// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol"; 
import "@openzeppelin/contracts/interfaces/IERC2981.sol";
import "@openzeppelin/contracts/access/Ownable.sol";


contract NFTTicket is ERC721URIStorage, ReentrancyGuard, IERC2981, Ownable {
    uint public nextEventId = 1;
    uint public nextTokenId = 1;

    struct Event {
        string name;
        uint maxTickets;
        uint priceWei;
        uint ticketsSold;
        address organiser;
        uint96 royaltyBps; // e.g., 500 = 5%
        bool exists;
        uint eventDate;
        bool cancelled;
        uint escrowBalance;
        uint activeTickets;
    }

    struct ResaleListing {
        address seller;
        uint priceWei;
        bool active;
    }

    mapping(uint => Event) public events;
    mapping(uint => uint) public tokenToEvent;
    mapping(uint => ResaleListing) public resaleListings;

    event EventCreated(uint indexed eventId, address indexed organiser, string name);
    event TicketMinted(uint indexed tokenId, uint indexed eventId, address indexed buyer);
    event TicketListed(uint indexed tokenId, address indexed seller, uint priceWei);
    event TicketResold(uint indexed tokenId, address indexed oldOwner, address indexed newOwner, uint priceWei);
    event ListingCancelled(uint indexed tokenId);
    
    event EventCancelled(uint indexed eventId);
    event TicketCancelled(uint indexed tokenId, uint indexed eventId, address indexed buyer, uint refundAmount);
    event TicketRefunded(uint indexed tokenId, uint indexed eventId, address indexed buyer, uint refundAmount);
    event FundsWithdrawn(uint indexed eventId, address indexed organiser, uint amount);

    constructor() ERC721("NFTEventTicket", "NETIX") Ownable(msg.sender) {}

    // --- Core Functions ---
    function createEvent(string memory name, uint maxTickets, uint priceWei, uint96 royaltyBps, uint eventDate) public {
        require(bytes(name).length > 0, "Name cannot be empty");
        require(maxTickets > 0, "Must have tickets");
        require(royaltyBps <= 10000, "Royalty cannot exceed 100%");
        require(eventDate > block.timestamp, "Event date must be in the future");

        events[nextEventId] = Event({
            name: name,
            maxTickets: maxTickets,
            priceWei: priceWei,
            ticketsSold: 0,
            organiser: msg.sender,
            royaltyBps: royaltyBps,
            exists: true,
            eventDate: eventDate,
            cancelled: false,
            escrowBalance: 0,
            activeTickets: 0
        });

        emit EventCreated(nextEventId, msg.sender, name);
        nextEventId++;
    }

    function buyTicket(uint eventId) public payable nonReentrant {
        Event storage evt = events[eventId];
        require(evt.exists, "Event does not exist");
        require(!evt.cancelled, "Event is cancelled");
        require(msg.sender != evt.organiser, "Organizer cannot buy tickets for their own event");
        require(msg.value == evt.priceWei, "Incorrect ETH amount");
        require(evt.ticketsSold < evt.maxTickets, "Sold out");

        uint tokenId = nextTokenId;
        nextTokenId++;

        evt.ticketsSold++;
        evt.activeTickets++;
        evt.escrowBalance += msg.value;
        tokenToEvent[tokenId] = eventId;
        
        _safeMint(msg.sender, tokenId);
        
        // Removed instant transfer to organiser to facilitate escrow and refunds
        emit TicketMinted(tokenId, eventId, msg.sender);
    }
    
    // --- Escrow and Cancellation Functions ---

    function cancelEvent(uint eventId) public {
        Event storage evt = events[eventId];
        require(evt.exists, "Event does not exist");
        require(msg.sender == evt.organiser, "Not the organiser");
        require(!evt.cancelled, "Already cancelled");
        require(block.timestamp < evt.eventDate, "Event has already occurred");
        
        evt.cancelled = true;
        emit EventCancelled(eventId);
    }

    function cancelTicket(uint tokenId) public nonReentrant {
        require(ownerOf(tokenId) == msg.sender, "Not the owner");
        
        uint eventId = tokenToEvent[tokenId];
        Event storage evt = events[eventId];
        
        require(!evt.cancelled, "Event cancelled, use claimRefund");
        require(block.timestamp < evt.eventDate, "Event already started/finished");

        // Refund 50%
        uint refundAmount = evt.priceWei / 2;
        
        evt.activeTickets--;
        evt.escrowBalance -= refundAmount; // Remaining 50% stays in escrow for the organiser

        if (resaleListings[tokenId].active) {
            delete resaleListings[tokenId];
        }

        _burn(tokenId);
        emit TicketCancelled(tokenId, eventId, msg.sender, refundAmount);

        (bool success, ) = payable(msg.sender).call{value: refundAmount}("");
        require(success, "Refund failed");
    }

    function claimRefund(uint tokenId) public nonReentrant {
        require(ownerOf(tokenId) == msg.sender, "Not the owner");
        
        uint eventId = tokenToEvent[tokenId];
        Event storage evt = events[eventId];
        
        require(evt.cancelled, "Event not cancelled");

        uint refundAmount = evt.priceWei;
        
        evt.activeTickets--;
        evt.escrowBalance -= refundAmount;

        if (resaleListings[tokenId].active) {
            delete resaleListings[tokenId];
        }

        _burn(tokenId);
        emit TicketRefunded(tokenId, eventId, msg.sender, refundAmount);

        (bool success, ) = payable(msg.sender).call{value: refundAmount}("");
        require(success, "Refund failed");
    }

    function withdrawEventFunds(uint eventId) public nonReentrant {
        Event storage evt = events[eventId];
        require(evt.exists, "Event does not exist");
        require(msg.sender == evt.organiser, "Not the organiser");
        require(
            (block.timestamp >= evt.eventDate && !evt.cancelled) || evt.cancelled,
            "Cannot withdraw yet"
        );
        
        uint amount;
        if (evt.cancelled) {
            uint totalRefundsNeeded = evt.activeTickets * evt.priceWei;
            require(evt.escrowBalance > totalRefundsNeeded, "No extra funds to withdraw");
            amount = evt.escrowBalance - totalRefundsNeeded;
        } else {
            amount = evt.escrowBalance;
        }

        require(amount > 0, "No funds to withdraw");
        evt.escrowBalance -= amount;

        emit FundsWithdrawn(eventId, msg.sender, amount);

        (bool success, ) = payable(msg.sender).call{value: amount}("");
        require(success, "Withdraw failed");
    }

    // --- Marketplace Functions ---
    function listForResale(uint tokenId, uint priceWei) public {
        require(ownerOf(tokenId) == msg.sender, "Not the owner");
        require(priceWei > 0, "Price must be > 0");

        resaleListings[tokenId] = ResaleListing({
            seller: msg.sender,
            priceWei: priceWei,
            active: true
        });

        emit TicketListed(tokenId, msg.sender, priceWei);
    }

    function buyResaleTicket(uint tokenId) public payable nonReentrant {
        ResaleListing memory listing = resaleListings[tokenId];
        require(listing.active, "Not for sale");
        require(msg.value == listing.priceWei, "Incorrect ETH amount");
        require(ownerOf(tokenId) == listing.seller, "Seller no longer owns ticket");

        (address organiser, uint royaltyAmount) = royaltyInfo(tokenId, msg.value);
        uint sellerProceeds = msg.value - royaltyAmount;

        delete resaleListings[tokenId]; // Prevent reentrancy

        _transfer(listing.seller, msg.sender, tokenId);

        if (royaltyAmount > 0) {
            (bool successRoyalty, ) = payable(organiser).call{value: royaltyAmount}("");
            require(successRoyalty, "Royalty transfer failed");
        }

        (bool successSeller, ) = payable(listing.seller).call{value: sellerProceeds}("");
        require(successSeller, "Seller transfer failed");

        emit TicketResold(tokenId, listing.seller, msg.sender, msg.value);
    }

    function cancelResaleListing(uint tokenId) public {
        require(resaleListings[tokenId].active, "No active listing");
        require(resaleListings[tokenId].seller == msg.sender, "Not the seller");
        
        delete resaleListings[tokenId];
        emit ListingCancelled(tokenId);
    }

    // --- View & Standards ---
    function fetchEventData(uint eventId) public view returns (Event memory) {
        return events[eventId];
    }

    function getResaleListing(uint tokenId) public view returns (ResaleListing memory) {
        return resaleListings[tokenId];
    }

    function royaltyInfo(uint tokenId, uint salePrice) public view override returns (address receiver, uint royaltyAmount) {
        uint eventId = tokenToEvent[tokenId];
        Event memory evt = events[eventId];
        uint amount = (salePrice * evt.royaltyBps) / 10000;
        return (evt.organiser, amount);
    }

    function supportsInterface(bytes4 interfaceId) public view override(ERC721URIStorage, IERC165) returns (bool) {
        return interfaceId == type(IERC2981).interfaceId || super.supportsInterface(interfaceId);
    }
}
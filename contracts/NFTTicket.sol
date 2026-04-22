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
        uint32 maxTickets;
        uint256 priceWei;
        uint32 ticketsSold;
        uint8 royaltyBps; // e.g., 500 = 5%
        bool exists;
        address organiser;
    }

    struct ResaleListing {
        address seller;
        uint256 priceWei;
        bool active;
    }

    mapping(uint => Event) public events;
    mapping(uint => uint) public tokenToEvent;
    mapping(uint => ResaleListing) public resaleListings;
    
    // eventId => (referrer address => percentage in basis points)
    mapping(uint => mapping(address => uint256)) public eventReferrals;

    event EventCreated(uint indexed eventId, address indexed organiser, string ipfsHash);
    event TicketMinted(uint indexed tokenId, uint indexed eventId, address indexed buyer);
    event TicketListed(uint indexed tokenId, address indexed seller, uint256 priceWei);
    event TicketResold(uint indexed tokenId, address indexed oldOwner, address indexed newOwner, uint256 priceWei);
    event ListingCancelled(uint indexed tokenId);
    event ReferralAdded(uint indexed eventId, address indexed referrer, uint256 bps);

    constructor() ERC721("NFTEventTicket", "NETIX") Ownable(msg.sender) {}

    // --- Core Functions ---
    function createEvent(string memory ipfsHash, uint32 maxTickets, uint256 priceWei, uint8 royaltyBps) external {
        require(maxTickets > 0, "Must have tickets");
        require(bytes(ipfsHash).length > 0, "IPFS hash cannot be empty");
        require(royaltyBps <= 10000, "Royalty cannot exceed 100%");

        events[nextEventId] = Event({
            maxTickets: maxTickets,
            priceWei: priceWei,
            ticketsSold: 0,
            royaltyBps: royaltyBps,
            exists: true,
            organiser: msg.sender
        });

        emit EventCreated(nextEventId, msg.sender, ipfsHash);
        nextEventId++;
    }

    function buyTicket(uint eventId) public payable nonReentrant {
        _buyTicketInternal(eventId, msg.sender, msg.value, address(0));
    }

    function buyTicketWithReferral(uint eventId, address referrer) public payable nonReentrant {
        _buyTicketInternal(eventId, msg.sender, msg.value, referrer);
    }

    function _buyTicketInternal(uint eventId, address buyer, uint256 amount, address referrer) internal {
        Event storage evt = events[eventId];
        require(evt.ticketsSold < evt.maxTickets, "Sold out");
        require(buyer != evt.organiser, "Organiser cannot buy their own tickets");
        require(evt.exists, "Event does not exist");
        require(amount == evt.priceWei, "Incorrect ETH amount");
        
        uint tokenId = nextTokenId;
        nextTokenId++;

        evt.ticketsSold++;
        tokenToEvent[tokenId] = eventId;
        
        _safeMint(buyer, tokenId);
        
        uint256 organiserAmount = amount;
        
        if (referrer != address(0) && referrer != evt.organiser && eventReferrals[eventId][referrer] > 0) {
            uint256 referralBps = eventReferrals[eventId][referrer];
            uint256 referrerAmount = (amount * referralBps) / 10000;
            organiserAmount = amount - referrerAmount;
            
            (bool successRef, ) = payable(referrer).call{value: referrerAmount}("");
            require(successRef, "Referral transfer failed");
        }
        
        (bool successOrg, ) = payable(evt.organiser).call{value: organiserAmount}("");
        require(successOrg, "Transfer failed");

        emit TicketMinted(tokenId, eventId, buyer);
    }

    function addReferral(uint eventId, address referrer, uint256 bps) external {
        Event storage evt = events[eventId];
        require(evt.exists, "Event does not exist");
        require(msg.sender == evt.organiser, "Only organiser can add referral");
        require(referrer != address(0), "Invalid referrer");
        require(referrer != evt.organiser, "Cannot refer self");
        require(bps <= 10000, "BPS cannot exceed 10000");
        
        eventReferrals[eventId][referrer] = bps;
        emit ReferralAdded(eventId, referrer, bps);
    }

    // --- Marketplace Functions ---
    function listForResale(uint tokenId, uint256 priceWei) public {
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
        
        uint eventId = tokenToEvent[tokenId];
        require(msg.sender != events[eventId].organiser, "Organiser cannot buy their own tickets");

        require(msg.value == listing.priceWei, "Incorrect ETH amount");
        require(ownerOf(tokenId) == listing.seller, "Seller no longer owns ticket");

        (address organiser, uint256 royaltyAmount) = royaltyInfo(tokenId, msg.value);
        uint256 sellerProceeds = msg.value - royaltyAmount;

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
        ResaleListing storage listing = resaleListings[tokenId];

        require(listing.active, "No active listing");
        require(listing.seller == msg.sender, "Not the seller");
        
        listing.active = false;
        emit ListingCancelled(tokenId);
    }

    // --- View & Standards ---
    function fetchEventData(uint eventId) public view returns (Event memory) {
        return events[eventId];
    }

    function getResaleListing(uint tokenId) public view returns (ResaleListing memory) {
        return resaleListings[tokenId];
    }

    function royaltyInfo(uint tokenId, uint salePrice) public view override returns (address receiver, uint256 royaltyAmount) {
        uint eventId = tokenToEvent[tokenId];
        Event memory evt = events[eventId];
        uint256 amount = (salePrice * uint256(evt.royaltyBps)) / 10000;
        return (evt.organiser, amount);
    }

    function supportsInterface(bytes4 interfaceId) public view override(ERC721URIStorage, IERC165) returns (bool) {
        return interfaceId == type(IERC2981).interfaceId || super.supportsInterface(interfaceId);
    }
}
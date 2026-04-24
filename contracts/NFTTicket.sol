// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol"; 
import "@openzeppelin/contracts/interfaces/IERC2981.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract NFTTicket is ERC721URIStorage, ReentrancyGuard, IERC2981, Ownable {
    uint256 public nextEventId = 1;
    uint256 public nextTokenId = 1;

    enum Tier { Silver, Gold, VIP }

    struct Event {
        uint256 maxTickets;
        uint256 priceWei;
        uint256 ticketsSold;
        address organiser;
        uint96 royaltyBps; // e.g., 500 = 5%
        bool exists;
        string ipfsHash;
    }

    struct ResaleListing {
        address seller;
        uint256 priceWei;
        bool active;
    }

    mapping(uint256 => Event) public events;
    mapping(uint256 => uint256) public tokenToEvent;
    mapping(uint256 => uint8) public tokenToTier; // Optimized from string to uint8
    mapping(uint256 => ResaleListing) public resaleListings;

    event EventCreated(uint256 indexed eventId, address indexed organiser, string ipfsHash);
    event EventUpdated(uint256 indexed eventId, string newIpfsHash);
    event TicketMinted(uint256 indexed tokenId, uint256 indexed eventId, address indexed buyer, uint8 tier);
    event TicketListed(uint256 indexed tokenId, address indexed seller, uint256 priceWei);
    event TicketResold(uint indexed tokenId, address indexed oldOwner, address indexed newOwner, uint256 priceWei);
    event ListingCancelled(uint256 indexed tokenId);

    constructor() ERC721("NFTEventTicket", "NETIX") Ownable(msg.sender) {}

    // --- Core Functions ---
    function createEvent(string memory ipfsHash, uint256 maxTickets, uint256 priceWei, uint96 royaltyBps) external {
        require(maxTickets > 0, "Must have tickets");
        require(bytes(ipfsHash).length > 0, "IPFS hash cannot be empty");
        require(priceWei > 0, "Price must be greater than zero");
        require(royaltyBps <= 10000, "Royalty cannot exceed 100%");

        events[nextEventId] = Event({
            maxTickets: maxTickets,
            priceWei: priceWei,
            ticketsSold: 0,
            organiser: msg.sender,
            royaltyBps: royaltyBps,
            exists: true,
            ipfsHash: ipfsHash
        });

        emit EventCreated(nextEventId, msg.sender, ipfsHash);
        unchecked { nextEventId++; }
    }

    function editEvent(uint256 eventId, string memory newIpfsHash, uint256 newMaxTickets, uint256 newPriceWei) external {
        Event storage evt = events[eventId];
        require(evt.exists, "Event does not exist");
        require(msg.sender == evt.organiser, "Not the organiser");
        require(newMaxTickets >= evt.ticketsSold, "Cannot reduce max below sold");
        require(bytes(newIpfsHash).length > 0, "IPFS hash cannot be empty");
        require(newPriceWei > 0, "Price must be > 0");

        evt.maxTickets = newMaxTickets;
        evt.priceWei = newPriceWei;
        evt.ipfsHash = newIpfsHash;

        emit EventUpdated(eventId, newIpfsHash);
    }

    function buyTicket(uint256 eventId, uint256 quantity, uint8 tier) external payable nonReentrant {
        require(quantity > 0, "Quantity must be > 0");
        Event storage evt = events[eventId];
        require(evt.exists, "Event does not exist");
        require(evt.ticketsSold + quantity <= evt.maxTickets, "Not enough tickets available");
        require(msg.sender != evt.organiser, "Organiser cannot buy their own tickets");
        require(msg.value >= evt.priceWei * quantity, "Incorrect ETH amount");
        
        for (uint256 i = 0; i < quantity; ) {
            uint256 tokenId = nextTokenId;
            _safeMint(msg.sender, tokenId);
            tokenToEvent[tokenId] = eventId;
            tokenToTier[tokenId] = tier;
            
            emit TicketMinted(tokenId, eventId, msg.sender, tier);
            
            unchecked { 
                nextTokenId++;
                i++; 
            }
        }

        evt.ticketsSold += quantity;
        
        (bool success, ) = payable(evt.organiser).call{value: msg.value}("");
        require(success, "Transfer failed");
    }

    function buyBatchTickets(uint256 eventId, uint8[] memory tiers, uint256[] memory quantities) external payable nonReentrant {
        require(tiers.length == quantities.length, "Mismatched input arrays");
        Event storage evt = events[eventId];
        require(evt.exists, "Event does not exist");
        require(msg.sender != evt.organiser, "Organiser cannot buy their own tickets");

        uint256 totalQuantity = 0;
        for (uint256 i = 0; i < quantities.length; ) {
            totalQuantity += quantities[i];
            unchecked { i++; }
        }

        require(totalQuantity > 0, "Quantity must be > 0");
        require(evt.ticketsSold + totalQuantity <= evt.maxTickets, "Not enough tickets available");
        require(msg.value >= evt.priceWei * totalQuantity, "Incorrect ETH amount");

        for (uint256 t = 0; t < tiers.length; ) {
            uint256 qty = quantities[t];
            uint8 tier = tiers[t];
            
            for (uint256 i = 0; i < qty; ) {
                uint256 tokenId = nextTokenId;
                _safeMint(msg.sender, tokenId);
                tokenToEvent[tokenId] = eventId;
                tokenToTier[tokenId] = tier;
                
                emit TicketMinted(tokenId, eventId, msg.sender, tier);
                
                unchecked { 
                    nextTokenId++;
                    i++; 
                }
            }
            unchecked { t++; }
        }

        evt.ticketsSold += totalQuantity;
        
        (bool success, ) = payable(evt.organiser).call{value: msg.value}("");
        require(success, "Transfer failed");
    }

    // --- Marketplace Functions ---
    function listForResale(uint256 tokenId, uint256 priceWei) external {
        require(ownerOf(tokenId) == msg.sender, "Not the owner");
        require(priceWei > 0, "Price must be > 0");

        resaleListings[tokenId] = ResaleListing({
            seller: msg.sender,
            priceWei: priceWei,
            active: true
        });

        emit TicketListed(tokenId, msg.sender, priceWei);
    }

    function buyResaleTicket(uint256 tokenId) external payable nonReentrant {
        ResaleListing memory listing = resaleListings[tokenId];
        require(listing.active, "Not for sale");
        
        uint256 eventId = tokenToEvent[tokenId];
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

    function cancelResaleListing(uint256 tokenId) external {
        ResaleListing storage listing = resaleListings[tokenId];

        require(listing.active, "No active listing");
        require(listing.seller == msg.sender, "Not the seller");
        
        listing.active = false;
        emit ListingCancelled(tokenId);
    }

    // --- View & Standards ---
    function fetchEventData(uint256 eventId) public view returns (Event memory) {
        return events[eventId];
    }

    function getResaleListing(uint256 tokenId) public view returns (ResaleListing memory) {
        return resaleListings[tokenId];
    }

    function royaltyInfo(uint256 tokenId, uint256 salePrice) public view override returns (address receiver, uint256 royaltyAmount) {
        uint256 eventId = tokenToEvent[tokenId];
        Event memory evt = events[eventId];
        uint256 amount = (salePrice * uint256(evt.royaltyBps)) / 10000;
        return (evt.organiser, amount);
    }

    function supportsInterface(bytes4 interfaceId) public view override(ERC721URIStorage, IERC165) returns (bool) {
        return interfaceId == type(IERC2981).interfaceId || super.supportsInterface(interfaceId);
    }
}
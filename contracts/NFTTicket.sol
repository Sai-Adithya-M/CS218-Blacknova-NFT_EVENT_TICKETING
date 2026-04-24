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
        address organiser;   
        uint40 priceWei;     
        uint24 maxTickets;   
        uint24 ticketsSold;  
        uint8  royaltyBps;
    }

    struct ResaleListing {
        address seller;
        uint48 priceWei;
        bool active;
    }

    mapping(uint256 => Event) public events;
    mapping(uint256 => uint256) public tokenToEvent;
    mapping(uint256 => uint8) public tokenToTier; // Optimized from string to uint8
    mapping(uint256 => ResaleListing) public resaleListings;
    mapping(uint256 => uint48) public tokenPurchasePrice; // gwei, tracks actual price paid

    event EventCreated(uint256 indexed eventId, address indexed organiser, string ipfsHash);
    event EventUpdated(uint256 indexed eventId, uint24 newMaxTickets, uint40 newPriceWei);
    event TicketMinted(uint256 indexed tokenId, uint256 indexed eventId, address indexed buyer, uint8 tier);
    event TicketListed(uint256 indexed tokenId, address indexed seller, uint48 priceWei);
    event TicketResold(uint256 indexed tokenId, address indexed oldOwner, address indexed newOwner, uint48 priceWei);
    event ListingCancelled(uint256 indexed tokenId);

    constructor() ERC721("NFTEventTicket", "NETIX") Ownable(msg.sender) {}

    // --- Core Functions ---
    function createEvent(string memory ipfsHash, uint24 maxTickets, uint40 priceWei, uint8 royaltyBps) external {
        require(maxTickets > 0, "Must have tickets");
        require(bytes(ipfsHash).length > 0, "IPFS hash cannot be empty");
        require(priceWei > 0, "Price must be greater than zero");
        require(royaltyBps <= 100, "Royalty cannot exceed 100%");

        uint256 eventId = nextEventId;
        events[eventId] = Event({
            organiser:   msg.sender,
            priceWei:    priceWei,
            maxTickets:  maxTickets,
            ticketsSold: 0,
            royaltyBps:  royaltyBps
        });
        unchecked { nextEventId++; }
        emit EventCreated(eventId, msg.sender, ipfsHash);
    }

    function editEvent(uint256 eventId, uint24 newMaxTickets, uint40 newPriceWei) external {
        Event storage evt = events[eventId];
        require(evt.organiser != address(0), "Event does not exist");
        require(msg.sender == evt.organiser, "Not the organiser");
        require(newMaxTickets >= evt.ticketsSold, "Cannot reduce max below sold");
        require(newPriceWei > 0, "Price must be > 0");

        evt.maxTickets = newMaxTickets;
        evt.priceWei = newPriceWei;
        emit EventUpdated(eventId, newMaxTickets, newPriceWei);
    }

    function buyTicket(uint256 eventId, uint24 quantity, uint8 tier) external payable nonReentrant {
        require(quantity > 0, "Quantity must be > 0");
        Event storage evt = events[eventId];
        require(evt.organiser != address(0), "Event does not exist");
        require(evt.ticketsSold + quantity <= evt.maxTickets, "Not enough tickets available");
        require(msg.sender != evt.organiser, "Organiser cannot buy their own tickets");
        // priceWei is stored in gwei; multiply by 1e9 to get wei
        require(msg.value >= uint256(evt.priceWei) * 1e9 * quantity, "Incorrect ETH amount");
        
        for (uint256 i = 0; i < quantity; ) {
            uint256 tokenId = nextTokenId;
            _safeMint(msg.sender, tokenId);
            tokenToEvent[tokenId] = eventId;
            tokenToTier[tokenId] = tier;
            tokenPurchasePrice[tokenId] = evt.priceWei;
            
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

    function buyBatchTickets(uint256 eventId, uint8[] memory tiers, uint24[] memory quantities) external payable nonReentrant {
        require(tiers.length == quantities.length, "Mismatched input arrays");
        Event storage evt = events[eventId];
        require(evt.organiser != address(0), "Event does not exist");
        require(msg.sender != evt.organiser, "Organiser cannot buy their own tickets");

        uint24 totalQuantity = 0;
        for (uint256 i = 0; i < quantities.length; ) {
            totalQuantity += quantities[i];
            unchecked { i++; }
        }

        require(totalQuantity > 0, "Quantity must be > 0");
        require(evt.ticketsSold + totalQuantity <= evt.maxTickets, "Not enough tickets available");
        // priceWei is stored in gwei; multiply by 1e9 to get wei
        require(msg.value >= uint256(evt.priceWei) * 1e9 * totalQuantity, "Incorrect ETH amount");

        for (uint256 t = 0; t < tiers.length; ) {
            uint24 qty = quantities[t];
            uint8 tier = tiers[t];
            
            for (uint256 i = 0; i < qty; ) {
                uint256 tokenId = nextTokenId;
                _safeMint(msg.sender, tokenId);
                tokenToEvent[tokenId] = eventId;
                tokenToTier[tokenId] = tier;
                tokenPurchasePrice[tokenId] = evt.priceWei;
                
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
    function listForResale(uint256 tokenId, uint48 priceWei) external {
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
        Event storage evtResale = events[eventId];
        require(evtResale.organiser != address(0), "Event does not exist");
        require(msg.sender != evtResale.organiser, "Organiser cannot buy their own tickets");

        // listingPrice is stored in gwei; multiply by 1e9 to compare against msg.value (wei)
        require(msg.value == uint256(listing.priceWei) * 1e9, "Incorrect ETH amount");
        require(ownerOf(tokenId) == listing.seller, "Seller no longer owns ticket");

        (address organiser, uint256 royaltyAmount) = royaltyInfo(tokenId, msg.value);
        uint256 sellerProceeds = msg.value - royaltyAmount;

        resaleListings[tokenId].active = false;

        if (royaltyAmount > 0) {
            (bool successRoyalty, ) = payable(organiser).call{value: royaltyAmount}("");
            require(successRoyalty, "Royalty transfer failed");
        }

        (bool successSeller, ) = payable(listing.seller).call{value: sellerProceeds}("");
        require(successSeller, "Seller transfer failed");

        _transfer(listing.seller, msg.sender, tokenId);
        tokenPurchasePrice[tokenId] = listing.priceWei;

        emit TicketResold(tokenId, listing.seller, msg.sender, listing.priceWei);
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

    function getTokenPurchasePrice(uint256 tokenId) public view returns (uint48) {
        return tokenPurchasePrice[tokenId];
    }

    function royaltyInfo(uint256 tokenId, uint256 salePrice) public view override returns (address receiver, uint256 royaltyAmount) {
        uint256 eventId = tokenToEvent[tokenId];
        Event memory evt = events[eventId];
        uint256 amount = (salePrice * uint256(evt.royaltyBps)) / 100;
        return (evt.organiser, amount);
    }

    function supportsInterface(bytes4 interfaceId) public view override(ERC721URIStorage, IERC165) returns (bool) {
        return interfaceId == type(IERC2981).interfaceId || super.supportsInterface(interfaceId);
    }
}
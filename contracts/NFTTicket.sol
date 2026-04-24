// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol"; 
import "@openzeppelin/contracts/interfaces/IERC2981.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract NFTTicket is ERC721, ERC721Enumerable, ReentrancyGuard, IERC2981, Ownable {
    uint256 public nextEventId = 1;
    uint256 public nextTokenId = 1;

    struct Tier {
        string name;
        uint256 price;
        uint256 maxSupply;
        uint256 soldCount;
    }

    struct Event {
        address organiser;
        uint96 royaltyBps; // basis points (e.g. 500 = 5%)
        bool exists;
        string ipfsHash;
        uint8 numTiers;
        uint256 totalRevenue;      // Primary sales revenue
        uint256 totalRoyaltyEarned; // Resale royalties earned
    }

    struct ResaleListing {
        address seller;
        uint256 priceWei;
        bool active;
    }

    mapping(uint256 => Event) public events;
    mapping(uint256 => mapping(uint8 => Tier)) public eventTiers;
    mapping(uint256 => uint256) public tokenToEvent;
    mapping(uint256 => uint8) public tokenToTier;
    mapping(uint256 => ResaleListing) public resaleListings;

    // --- Enhanced Events ---
    event EventCreated(uint256 indexed eventId, address indexed organiser, string ipfsHash, uint8 numTiers);
    
    event TicketPurchased(
        address indexed buyer, 
        uint256 indexed eventId, 
        uint8 tierId, 
        uint256 price, 
        uint256 royalty, 
        uint256 organizerAmount
    );

    event TicketMinted(uint256 indexed tokenId, uint256 indexed eventId, address indexed buyer, uint8 tier);
    
    event TicketListed(uint256 indexed tokenId, address indexed seller, uint256 priceWei);
    
    event TicketResold(
        uint256 indexed tokenId, 
        address indexed oldOwner, 
        address indexed newOwner, 
        uint256 priceWei,
        uint256 royaltyAmount
    );
    
    event ListingCancelled(uint256 indexed tokenId);

    constructor() ERC721("NFTEventTicket", "NETIX") Ownable(msg.sender) {}

    // --- Core Functions ---

    /**
     * @dev Create a new event with multiple ticket tiers.
     */
    function createEvent(
        string calldata ipfsHash, 
        uint96 royaltyBps,
        string[] calldata tierNames,
        uint256[] calldata tierPrices,
        uint256[] calldata tierSupplies
    ) external {
        uint8 numTiers = uint8(tierNames.length);
        require(numTiers > 0 && numTiers == tierPrices.length && numTiers == tierSupplies.length, "Invalid tier data");
        require(bytes(ipfsHash).length > 0, "IPFS hash required");
        require(royaltyBps <= 10000, "Royalty > 100%");

        uint256 currentEventId = nextEventId;
        
        Event storage newEvent = events[currentEventId];
        newEvent.organiser = msg.sender;
        newEvent.royaltyBps = royaltyBps;
        newEvent.exists = true;
        newEvent.ipfsHash = ipfsHash;
        newEvent.numTiers = numTiers;

        for (uint8 i = 0; i < numTiers; i++) {
            require(tierSupplies[i] > 0, "Supply must be > 0");
            eventTiers[currentEventId][i] = Tier({
                name: tierNames[i],
                price: tierPrices[i],
                maxSupply: tierSupplies[i],
                soldCount: 0
            });
        }

        emit EventCreated(currentEventId, msg.sender, ipfsHash, numTiers);
        
        unchecked { nextEventId = currentEventId + 1; }
    }

    /**
     * @dev Purchase tickets for a specific event and tier.
     */
    function buyTicket(uint256 eventId, uint256 quantity, uint8 tierId) external payable nonReentrant {
        require(quantity > 0, "Quantity must be > 0");
        Event storage evt = events[eventId];
        require(evt.exists, "Event not found");
        require(tierId < evt.numTiers, "Invalid tier");
        
        Tier storage tier = eventTiers[eventId][tierId];
        require(tier.soldCount + quantity <= tier.maxSupply, "Sold out");
        
        uint256 totalPrice = tier.price * quantity;
        require(msg.value >= totalPrice, "Insufficient ETH");
        
        address organiser = evt.organiser;
        require(msg.sender != organiser, "Organiser cannot buy");

        uint256 currentTokenId = nextTokenId;
        
        for (uint256 i = 0; i < quantity; i++) {
            _safeMint(msg.sender, currentTokenId);
            tokenToEvent[currentTokenId] = eventId;
            tokenToTier[currentTokenId] = tierId;
            
            emit TicketMinted(currentTokenId, eventId, msg.sender, tierId);
            emit TicketPurchased(msg.sender, eventId, tierId, tier.price, 0, tier.price);
            
            unchecked { currentTokenId++; }
        }

        nextTokenId = currentTokenId;
        tier.soldCount += quantity;
        evt.totalRevenue += msg.value;
        
        (bool success, ) = payable(organiser).call{value: msg.value}("");
        require(success, "Transfer failed");
    }

    /**
     * @dev Purchase a batch of tickets across different tiers.
     */
    function buyBatchTickets(uint256 eventId, uint8[] calldata tierIds, uint256[] calldata quantities) external payable nonReentrant {
        require(tierIds.length == quantities.length, "Array mismatch");
        Event storage evt = events[eventId];
        require(evt.exists, "Event not found");
        
        uint256 totalRequired = 0;
        uint256 currentTokenId = nextTokenId;

        for (uint256 i = 0; i < tierIds.length; i++) {
            uint8 tId = tierIds[i];
            uint256 qty = quantities[i];
            require(tId < evt.numTiers, "Invalid tier");
            
            Tier storage tier = eventTiers[eventId][tId];
            require(tier.soldCount + qty <= tier.maxSupply, "Sold out");
            
            totalRequired += tier.price * qty;
            tier.soldCount += qty;

            for (uint256 j = 0; j < qty; j++) {
                _safeMint(msg.sender, currentTokenId);
                tokenToEvent[currentTokenId] = eventId;
                tokenToTier[currentTokenId] = tId;
                
                emit TicketMinted(currentTokenId, eventId, msg.sender, tId);
                emit TicketPurchased(msg.sender, eventId, tId, tier.price, 0, tier.price);
                
                unchecked { currentTokenId++; }
            }
        }

        require(msg.value >= totalRequired, "Insufficient ETH");
        nextTokenId = currentTokenId;
        evt.totalRevenue += msg.value;

        (bool success, ) = payable(evt.organiser).call{value: msg.value}("");
        require(success, "Transfer failed");
    }

    // --- Marketplace ---

    function listForResale(uint256 tokenId, uint256 priceWei) external {
        require(ownerOf(tokenId) == msg.sender, "Not owner");
        require(priceWei > 0, "Price must be > 0");

        resaleListings[tokenId] = ResaleListing({
            seller: msg.sender,
            priceWei: priceWei,
            active: true
        });

        emit TicketListed(tokenId, msg.sender, priceWei);
    }

    function buyResaleTicket(uint256 tokenId) external payable nonReentrant {
        ResaleListing storage listing = resaleListings[tokenId];
        require(listing.active, "Not for sale");
        require(msg.value == listing.priceWei, "Incorrect ETH");
        
        address seller = listing.seller;
        require(ownerOf(tokenId) == seller, "Seller changed");

        uint256 eventId = tokenToEvent[tokenId];
        Event storage evt = events[eventId];
        
        uint256 royaltyAmount = (msg.value * uint256(evt.royaltyBps)) / 10000;
        uint256 sellerProceeds = msg.value - royaltyAmount;

        delete resaleListings[tokenId];
        evt.totalRoyaltyEarned += royaltyAmount;

        _transfer(seller, msg.sender, tokenId);

        if (royaltyAmount > 0) {
            (bool s1, ) = payable(evt.organiser).call{value: royaltyAmount}("");
            require(s1, "Royalty fail");
        }

        (bool s2, ) = payable(seller).call{value: sellerProceeds}("");
        require(s2, "Seller fail");

        emit TicketResold(tokenId, seller, msg.sender, msg.value, royaltyAmount);
    }

    function cancelResaleListing(uint256 tokenId) external {
        require(resaleListings[tokenId].seller == msg.sender, "Not seller");
        delete resaleListings[tokenId];
        emit ListingCancelled(tokenId);
    }

    // --- View & Analytics ---

    function getEventStats(uint256 eventId) external view returns (
        uint256 totalSold,
        uint256 totalRevenue,
        uint256 totalRoyaltyEarned,
        uint8 numTiers
    ) {
        Event storage evt = events[eventId];
        uint256 sold = 0;
        for (uint8 i = 0; i < evt.numTiers; i++) {
            sold += eventTiers[eventId][i].soldCount;
        }
        return (sold, evt.totalRevenue, evt.totalRoyaltyEarned, evt.numTiers);
    }

    function getTierData(uint256 eventId, uint8 tierId) external view returns (Tier memory) {
        return eventTiers[eventId][tierId];
    }

    function fetchEventData(uint256 eventId) public view returns (Event memory) {
        return events[eventId];
    }

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        require(_ownerOf(tokenId) != address(0), "Nonexistent token");
        uint256 eventId = tokenToEvent[tokenId];
        require(events[eventId].exists, "Invalid event mapping");
        return string(abi.encodePacked("ipfs://", events[eventId].ipfsHash));
    }

    function royaltyInfo(uint256 tokenId, uint256 salePrice) public view override returns (address, uint256) {
        Event storage evt = events[tokenToEvent[tokenId]];
        return (evt.organiser, (salePrice * uint256(evt.royaltyBps)) / 10000);
    }

    // --- Required Overrides ---

    function _update(address to, uint256 tokenId, address auth)
        internal
        override(ERC721, ERC721Enumerable)
        returns (address)
    {
        return super._update(to, tokenId, auth);
    }

    function _increaseBalance(address account, uint128 value)
        internal
        override(ERC721, ERC721Enumerable)
    {
        super._increaseBalance(account, value);
    }

    function supportsInterface(bytes4 interfaceId) public view override(ERC721, ERC721Enumerable, IERC165) returns (bool) {
        return interfaceId == type(IERC2981).interfaceId || super.supportsInterface(interfaceId);
    }
}
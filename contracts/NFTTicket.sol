// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol"; 
import "@openzeppelin/contracts/interfaces/IERC2981.sol";

contract NFTTicket is ERC721, ReentrancyGuard, IERC2981 {
    uint256 public nextEventId = 1;
    uint256 public nextTokenId = 1;

    enum Tier { Silver, Gold, VIP }

    // ── Event struct: exactly 1 storage slot (32 bytes) ──────────────────
    // address(20) + uint40(5) + uint24(3) + uint24(3) + uint8(1) = 32
    struct Event {
        address organiser;   
        uint40 priceWei;     
        uint24 maxTickets;   
        uint24 ticketsSold;  
        uint8  royaltyBps;
    }

    // ── TokenData: packed into 1 storage slot (was 3 separate mappings) ──
    // uint64(8) + uint8(1) + uint48(6) = 15 bytes → fits in 1 slot
    struct TokenData {
        uint64 eventId;
        uint8  tier;
        uint48 purchasePrice; // gwei
    }

    struct ResaleListing {
        address seller;
        uint48 priceWei;
        bool active;
    }

    mapping(uint256 => Event) public events;
    mapping(uint256 => TokenData) internal _tokenData; // packed: 1 SSTORE instead of 3
    mapping(uint256 => ResaleListing) public resaleListings;

    // ── Per-tier tracking (uint24 matches maxTickets/ticketsSold size) ───
    mapping(uint256 => mapping(uint8 => uint24)) public tierTicketsSold;
    mapping(uint256 => mapping(uint8 => uint24)) public tierMaxTickets;

    event EventCreated(uint256 indexed eventId, address indexed organiser, string ipfsHash);
    event EventUpdated(uint256 indexed eventId, uint24 newMaxTickets, uint40 newPriceWei);
    event TicketMinted(uint256 indexed tokenId, uint256 indexed eventId, address indexed buyer, uint8 tier);
    event TicketListed(uint256 indexed tokenId, address indexed seller, uint48 priceWei);
    event TicketResold(uint256 indexed tokenId, address indexed oldOwner, address indexed newOwner, uint48 priceWei);
    event ListingCancelled(uint256 indexed tokenId);

    constructor() ERC721("NFTEventTicket", "NETIX") {}

    // --- Core Functions ---
    function createEvent(
        string memory ipfsHash,
        uint24 maxTickets,
        uint40 priceWei,
        uint8 royaltyBps,
        uint8[] memory tierIds,
        uint24[] memory tierSupplies
    ) external {
        require(maxTickets > 0, "Must have tickets");
        require(bytes(ipfsHash).length > 0, "IPFS hash cannot be empty");
        require(priceWei > 0, "Price must be greater than zero");
        require(royaltyBps <= 100, "Royalty cannot exceed 100%");
        require(tierIds.length == tierSupplies.length, "Tier arrays mismatch");

        uint256 eventId = nextEventId;
        events[eventId] = Event({
            organiser:   msg.sender,
            priceWei:    priceWei,
            maxTickets:  maxTickets,
            ticketsSold: 0,
            royaltyBps:  royaltyBps
        });

        for (uint256 i = 0; i < tierIds.length; ) {
            tierMaxTickets[eventId][tierIds[i]] = tierSupplies[i];
            unchecked { i++; }
        }

        unchecked { nextEventId++; }
        emit EventCreated(eventId, msg.sender, ipfsHash);
    }

    function editEvent(
        uint256 eventId,
        uint24 newMaxTickets,
        uint40 newPriceWei,
        uint8[] memory tierIds,
        uint24[] memory tierSupplies
    ) external {
        Event storage evt = events[eventId];
        require(evt.organiser != address(0), "Event does not exist");
        require(msg.sender == evt.organiser, "Not the organiser");
        require(newMaxTickets >= evt.ticketsSold, "Cannot reduce max below sold");
        require(newPriceWei > 0, "Price must be > 0");
        require(tierIds.length == tierSupplies.length, "Tier arrays mismatch");

        evt.maxTickets = newMaxTickets;
        evt.priceWei = newPriceWei;

        for (uint256 i = 0; i < tierIds.length; ) {
            require(
                tierSupplies[i] >= tierTicketsSold[eventId][tierIds[i]],
                "Cannot reduce tier below sold"
            );
            tierMaxTickets[eventId][tierIds[i]] = tierSupplies[i];
            unchecked { i++; }
        }

        emit EventUpdated(eventId, newMaxTickets, newPriceWei);
    }

    function buyTicket(uint256 eventId, uint24 quantity, uint8 tier) external payable nonReentrant {
        require(quantity > 0, "Quantity must be > 0");
        Event storage evt = events[eventId];
        require(evt.organiser != address(0), "Event does not exist");
        require(evt.ticketsSold + quantity <= evt.maxTickets, "Not enough tickets available");
        require(msg.sender != evt.organiser, "Organiser cannot buy their own tickets");

        uint24 tierMax = tierMaxTickets[eventId][tier];
        if (tierMax > 0) {
            require(tierTicketsSold[eventId][tier] + quantity <= tierMax, "Tier sold out");
        }

        require(msg.value >= uint256(evt.priceWei) * 1e9 * quantity, "Incorrect ETH amount");

        // Actual per-ticket price in gwei
        uint48 actualPriceGwei = uint48(msg.value / (uint256(quantity) * 1e9));
        uint64 eid = uint64(eventId);

        for (uint256 i = 0; i < quantity; ) {
            uint256 tokenId = nextTokenId;
            _mint(msg.sender, tokenId); // _mint not _safeMint — saves ~2.5K gas/token
            _tokenData[tokenId] = TokenData(eid, tier, actualPriceGwei); // 1 SSTORE instead of 3

            emit TicketMinted(tokenId, eventId, msg.sender, tier);

            unchecked { 
                nextTokenId++;
                i++; 
            }
        }

        evt.ticketsSold += quantity;
        tierTicketsSold[eventId][tier] += quantity;
        
        (bool success, ) = payable(evt.organiser).call{value: msg.value}("");
        require(success, "Transfer failed");
    }

    function buyBatchTickets(uint256 eventId, uint8[] memory tiers, uint24[] memory quantities, uint40[] memory pricesGwei) external payable nonReentrant {
        require(tiers.length == quantities.length, "Mismatched input arrays");
        require(tiers.length == pricesGwei.length, "Mismatched price array");
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
        require(msg.value >= uint256(evt.priceWei) * 1e9 * totalQuantity, "Incorrect ETH amount");

        // Fail-fast tier checks
        for (uint256 i = 0; i < tiers.length; ) {
            uint24 tierMax = tierMaxTickets[eventId][tiers[i]];
            if (tierMax > 0) {
                require(tierTicketsSold[eventId][tiers[i]] + quantities[i] <= tierMax, "Tier sold out");
            }
            unchecked { i++; }
        }

        uint64 eid = uint64(eventId);

        for (uint256 t = 0; t < tiers.length; ) {
            uint24 qty = quantities[t];
            uint8 tier = tiers[t];
            uint48 tierPrice = uint48(pricesGwei[t]);
            
            for (uint256 i = 0; i < qty; ) {
                uint256 tokenId = nextTokenId;
                _mint(msg.sender, tokenId);
                _tokenData[tokenId] = TokenData(eid, tier, tierPrice);

                emit TicketMinted(tokenId, eventId, msg.sender, tier);

                unchecked { 
                    nextTokenId++;
                    i++; 
                }
            }

            tierTicketsSold[eventId][tier] += qty;
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
        
        uint256 eventId = uint256(_tokenData[tokenId].eventId);
        Event storage evtResale = events[eventId];
        require(evtResale.organiser != address(0), "Event does not exist");
        require(msg.sender != evtResale.organiser, "Organiser cannot buy their own tickets");

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
        _tokenData[tokenId].purchasePrice = listing.priceWei; // warm slot — cheap

        emit TicketResold(tokenId, listing.seller, msg.sender, listing.priceWei);
    }

    function cancelResaleListing(uint256 tokenId) external {
        ResaleListing storage listing = resaleListings[tokenId];

        require(listing.active, "No active listing");
        require(listing.seller == msg.sender, "Not the seller");
        
        listing.active = false;
        emit ListingCancelled(tokenId);
    }

    // --- View & Standards (backward-compatible getters) ---
    function tokenToEvent(uint256 tokenId) public view returns (uint256) {
        return uint256(_tokenData[tokenId].eventId);
    }

    function tokenToTier(uint256 tokenId) public view returns (uint8) {
        return _tokenData[tokenId].tier;
    }

    function getTokenPurchasePrice(uint256 tokenId) public view returns (uint48) {
        return _tokenData[tokenId].purchasePrice;
    }

    function fetchEventData(uint256 eventId) public view returns (Event memory) {
        return events[eventId];
    }

    function getResaleListing(uint256 tokenId) public view returns (ResaleListing memory) {
        return resaleListings[tokenId];
    }

    function getTierData(uint256 eventId, uint8 tier) public view returns (uint24 sold, uint24 max) {
        return (tierTicketsSold[eventId][tier], tierMaxTickets[eventId][tier]);
    }

    function royaltyInfo(uint256 tokenId, uint256 salePrice) public view override returns (address receiver, uint256 royaltyAmount) {
        uint256 eventId = uint256(_tokenData[tokenId].eventId);
        Event memory evt = events[eventId];
        uint256 amount = (salePrice * uint256(evt.royaltyBps)) / 100;
        return (evt.organiser, amount);
    }

    function supportsInterface(bytes4 interfaceId) public view override(ERC721, IERC165) returns (bool) {
        return interfaceId == type(IERC2981).interfaceId || super.supportsInterface(interfaceId);
    }
}
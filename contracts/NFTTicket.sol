// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/interfaces/IERC2981.sol";

contract NFTTicket is ERC721, ReentrancyGuard, IERC2981 {
    uint256 public nextEventId = 1;
    uint256 public nextTokenId = 1;

    // Strict constraint: Max 10 tickets per batch
    uint24 public constant MAX_BATCH = 10;

    // ── Event struct: Optimized into 1 storage slot ──────────────────────
    // address(160) + uint64 priceWei(64) + uint24 maxTickets(24) + uint8 royalty(8) = 256 bits
    struct Event {
        address organiser;   
        uint64 priceWei;     // Compact wei price (supports up to 18.4 ETH)
        uint24 maxTickets;   
        uint8  royaltyBps;
    }

    // ── TokenData: Optimized into 1 storage slot ────────────────────────────
    // uint32 eid(32) + uint8 tier(8) + uint64 orig(64) + uint64 last(64) + bool ref(8) + uint80 nonce(80) = 256 bits
    struct TokenData {
        uint32 eventId;
        uint8  tier;
        uint64 originalPrice; 
        uint64 lastPricePaid; 
        bool   refunded;      
        uint80 nonce;         
    }

    mapping(uint256 => bool) public usedTickets;

    struct ResaleListing {
        address seller;
        uint256 priceWei;
        bool active;
    }

    mapping(uint256 => Event) public events;
    mapping(uint256 => TokenData) internal _tokenData; 
    mapping(uint256 => ResaleListing) public resaleListings;
    
    mapping(uint256 => bool) public isCancelled;
    mapping(uint256 => uint256) public eventRefundLiability;
    mapping(uint256 => uint24) public eventTicketsSold;

    // Decentralized access control for ticket validation
    mapping(uint256 => mapping(address => bool)) public eventScanners;

    error EventIsCancelled();
    error NotEventOrganiser();
    error NotTicketOwner();
    error AlreadyRefunded();
    error RefundFailed();
    error InsufficientRefundFunds();
    error BatchLimitExceeded();
    error MaxTiersExceeded();
    error NotAuthorizedScanner();

    mapping(uint256 => mapping(uint8 => uint24)) public tierTicketsSold;
    mapping(uint256 => mapping(uint8 => uint24)) public tierMaxTickets;

    event EventCreated(uint256 indexed eventId, address indexed organiser, string ipfsHash);
    event EventUpdated(uint256 indexed eventId, uint24 newMaxTickets, uint256 newPriceWei);
    event TicketMinted(uint256 indexed tokenId, uint256 indexed eventId, address indexed buyer, uint8 tier);
    event TicketListed(uint256 indexed tokenId, address indexed seller, uint256 priceWei);
    event TicketResold(uint256 indexed tokenId, address indexed oldOwner, address indexed newOwner, uint256 priceWei);
    event ListingCancelled(uint256 indexed tokenId);
    event EventCancelled(uint256 indexed eventId);
    event RefundClaimed(uint256 indexed tokenId, address indexed user, uint256 amount);
    event ScannerAdded(uint256 indexed eventId, address indexed scanner);
    event ScannerRemoved(uint256 indexed eventId, address indexed scanner);

    constructor() ERC721("NFTEventTicket", "NETIX") {}

    function createEvent(
        string memory ipfsHash,
        uint24 maxTickets,
        uint64 priceWei,
        uint8 royaltyBps,
        uint8[] memory tierIds,
        uint24[] memory tierSupplies
    ) external {
        require(maxTickets > 0, "Must have tickets");
        require(bytes(ipfsHash).length > 0, "IPFS hash required");
        require(priceWei > 0, "Price must be > 0");
        require(royaltyBps <= 100, "Royalty <= 100%");
        require(tierIds.length == tierSupplies.length, "Tier mismatch");
        require(tierIds.length <= 3, "Max 3 tiers allowed");

        uint256 eventId = nextEventId;
        events[eventId] = Event({
            organiser:   msg.sender,
            priceWei:    priceWei,
            maxTickets:  maxTickets,
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
        uint64 newPriceWei,
        uint8[] memory tierIds,
        uint24[] memory tierSupplies
    ) external {
        Event storage evt = events[eventId];
        require(evt.organiser != address(0), "Event non-existent");
        if (msg.sender != evt.organiser) revert NotEventOrganiser();
        require(newMaxTickets >= eventTicketsSold[eventId], "Below sold");
        require(newPriceWei > 0, "Price must be > 0");
        require(tierIds.length == tierSupplies.length, "Tier mismatch");
        require(tierIds.length <= 3, "Max 3 tiers allowed");

        evt.maxTickets = newMaxTickets;
        evt.priceWei = newPriceWei;

        for (uint256 i = 0; i < tierIds.length; ) {
            require(tierSupplies[i] >= tierTicketsSold[eventId][tierIds[i]], "Tier below sold");
            tierMaxTickets[eventId][tierIds[i]] = tierSupplies[i];
            unchecked { i++; }
        }

        emit EventUpdated(eventId, newMaxTickets, newPriceWei);
    }

    function addScanner(uint256 eventId, address scanner) external {
        require(msg.sender == events[eventId].organiser, "Not organiser");
        require(scanner != address(0), "Invalid address");
        eventScanners[eventId][scanner] = true;
        emit ScannerAdded(eventId, scanner);
    }

    function removeScanner(uint256 eventId, address scanner) external {
        require(msg.sender == events[eventId].organiser, "Not organiser");
        eventScanners[eventId][scanner] = false;
        emit ScannerRemoved(eventId, scanner);
    }

    function buyTicket(uint256 eventId, uint24 quantity, uint8 tier) external payable nonReentrant {
        require(quantity > 0 && quantity <= MAX_BATCH, "Invalid quantity");
        if (isCancelled[eventId]) revert EventIsCancelled();

        Event storage evt = events[eventId];
        require(evt.organiser != address(0), "Event non-existent");
        require(eventTicketsSold[eventId] + quantity <= evt.maxTickets, "Sold out");
        require(msg.sender != evt.organiser, "Organiser buy error");

        uint24 tierMax = tierMaxTickets[eventId][tier];
        if (tierMax > 0) {
            require(tierTicketsSold[eventId][tier] + quantity <= tierMax, "Tier sold out");
        }

        require(msg.value >= uint256(evt.priceWei) * quantity, "Insufficient payment");

        uint64 computedPrice = uint64(msg.value / quantity);
        uint32 eid = uint32(eventId);

        for (uint256 i = 0; i < quantity; ) {
            uint256 tokenId = nextTokenId;
            uint80 nonce = uint80(uint256(keccak256(abi.encodePacked(block.prevrandao, block.timestamp, msg.sender, tokenId))));
            _mint(msg.sender, tokenId);
            _tokenData[tokenId] = TokenData(eid, tier, computedPrice, computedPrice, false, nonce);

            emit TicketMinted(tokenId, eventId, msg.sender, tier);
            unchecked { nextTokenId++; i++; }
        }

        eventTicketsSold[eventId] += quantity;
        tierTicketsSold[eventId][tier] += quantity;
        eventRefundLiability[eventId] += msg.value;
        
        (bool success, ) = payable(evt.organiser).call{value: msg.value}("");
        require(success, "Transfer failed");
    }

    function buyBatchTickets(uint256 eventId, uint8[] memory tiers, uint24[] memory quantities) external payable nonReentrant {
        require(tiers.length == quantities.length, "Input mismatch");
        if (isCancelled[eventId]) revert EventIsCancelled();

        Event storage evt = events[eventId];
        require(evt.organiser != address(0), "Event non-existent");
        require(msg.sender != evt.organiser, "Organiser buy error");

        uint24 totalQuantity = 0;
        for (uint256 i = 0; i < quantities.length; ) {
            totalQuantity += quantities[i];
            unchecked { i++; }
        }
        require(totalQuantity > 0 && totalQuantity <= MAX_BATCH, "Invalid quantity");
        require(eventTicketsSold[eventId] + totalQuantity <= evt.maxTickets, "Sold out");
        require(msg.value >= uint256(evt.priceWei) * totalQuantity, "Insufficient payment");

        uint64 computedPrice = uint64(msg.value / totalQuantity);
        uint32 eid = uint32(eventId);

        for (uint256 t = 0; t < tiers.length; ) {
            uint24 qty = quantities[t];
            uint8 tier = tiers[t];
            
            uint24 tierMax = tierMaxTickets[eventId][tier];
            if (tierMax > 0) {
                require(tierTicketsSold[eventId][tier] + qty <= tierMax, "Tier sold out");
            }

            for (uint256 i = 0; i < qty; ) {
                uint256 tokenId = nextTokenId;
                uint80 nonce = uint80(uint256(keccak256(abi.encodePacked(block.prevrandao, block.timestamp, msg.sender, tokenId))));
                _mint(msg.sender, tokenId);
                _tokenData[tokenId] = TokenData(eid, tier, computedPrice, computedPrice, false, nonce);

                emit TicketMinted(tokenId, eventId, msg.sender, tier);
                unchecked { nextTokenId++; i++; }
            }

            tierTicketsSold[eventId][tier] += qty;
            unchecked { t++; }
        }

        eventTicketsSold[eventId] += totalQuantity;
        eventRefundLiability[eventId] += msg.value;
        
        (bool success, ) = payable(evt.organiser).call{value: msg.value}("");
        require(success, "Transfer failed");
    }

    function listForResale(uint256 tokenId, uint256 priceWei) external {
        if (isCancelled[_tokenData[tokenId].eventId]) revert EventIsCancelled();
        require(ownerOf(tokenId) == msg.sender, "Not owner");
        require(priceWei > 0, "Price must be > 0");

        uint256 basePrice = uint256(_tokenData[tokenId].lastPricePaid);
        uint8 royalty = events[_tokenData[tokenId].eventId].royaltyBps;
        uint256 maxPrice = basePrice + (basePrice * (uint256(royalty) + 10) / 100);
        require(priceWei <= maxPrice, "Price exceeds cap");

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
        if (isCancelled[eventId]) revert EventIsCancelled();
        
        Event storage evtResale = events[eventId];
        require(evtResale.organiser != address(0), "Event non-existent");
        require(msg.sender != evtResale.organiser, "Organiser buy error");
        require(msg.value == listing.priceWei, "Incorrect payment");
        require(ownerOf(tokenId) == listing.seller, "Seller mismatch");

        (address organiser, uint256 royaltyAmount) = royaltyInfo(tokenId, msg.value);
        uint256 sellerProceeds = msg.value - royaltyAmount;

        resaleListings[tokenId].active = false;

        if (royaltyAmount > 0) {
            (bool successRoyalty, ) = payable(organiser).call{value: royaltyAmount}("");
            require(successRoyalty, "Royalty failed");
        }

        (bool successSeller, ) = payable(listing.seller).call{value: sellerProceeds}("");
        require(successSeller, "Seller failed");

        _transfer(listing.seller, msg.sender, tokenId);
        
        uint256 oldPrice = uint256(_tokenData[tokenId].lastPricePaid);
        _tokenData[tokenId].lastPricePaid = uint64(msg.value);
        
        eventRefundLiability[eventId] = eventRefundLiability[eventId] - oldPrice + msg.value;
        emit TicketResold(tokenId, listing.seller, msg.sender, msg.value);
    }

    function cancelResaleListing(uint256 tokenId) external {
        ResaleListing storage listing = resaleListings[tokenId];
        require(listing.active, "No listing");
        require(listing.seller == msg.sender, "Not seller");
        listing.active = false;
        emit ListingCancelled(tokenId);
    }

    function cancelEvent(uint256 eventId) external payable {
        Event storage evt = events[eventId];
        if (msg.sender != evt.organiser) revert NotEventOrganiser();
        if (isCancelled[eventId]) revert EventIsCancelled();
        if (msg.value < eventRefundLiability[eventId]) revert InsufficientRefundFunds();
        isCancelled[eventId] = true;
        emit EventCancelled(eventId);
    }

    function claimRefund(uint256 tokenId) external nonReentrant {
        if (ownerOf(tokenId) != msg.sender) revert NotTicketOwner();
        TokenData storage tData = _tokenData[tokenId];
        if (!isCancelled[tData.eventId]) revert EventIsCancelled(); 
        if (tData.refunded) revert AlreadyRefunded();

        tData.refunded = true; 
        uint256 refundAmount = uint256(tData.lastPricePaid);
        
        (bool success, ) = payable(msg.sender).call{value: refundAmount}("");
        if (!success) revert RefundFailed();

        emit RefundClaimed(tokenId, msg.sender, refundAmount);
    }

    function validateTicketEntry(uint256 tokenId) external {
        uint256 eventId = uint256(_tokenData[tokenId].eventId);
        // Organiser or Authorized Scanner
        require(
            msg.sender == events[eventId].organiser || eventScanners[eventId][msg.sender], 
            "Not authorized"
        );
        require(!usedTickets[tokenId], "Already used");
        require(!isCancelled[eventId], "Cancelled");
        require(!_tokenData[tokenId].refunded, "Refunded");
        usedTickets[tokenId] = true;
    }

    function getTokenPurchasePrice(uint256 tokenId) public view returns (uint256) {
        return uint256(_tokenData[tokenId].lastPricePaid);
    }

    function getTokenNonce(uint256 tokenId) public view returns (uint256) {
        return uint256(_tokenData[tokenId].nonce);
    }

    function tokenToEvent(uint256 tokenId) public view returns (uint256) {
        return uint256(_tokenData[tokenId].eventId);
    }

    function tokenToTier(uint256 tokenId) public view returns (uint8) {
        return _tokenData[tokenId].tier;
    }

    function getTokenOriginalPrice(uint256 tokenId) public view returns (uint256) {
        return uint256(_tokenData[tokenId].originalPrice);
    }

    function getTokenLastPricePaid(uint256 tokenId) public view returns (uint256) {
        return uint256(_tokenData[tokenId].lastPricePaid);
    }

    function isTokenRefunded(uint256 tokenId) public view returns (bool) {
        return _tokenData[tokenId].refunded;
    }

    function fetchEventData(uint256 eventId) public view returns (address organiser, uint256 priceWei, uint24 maxTickets, uint24 ticketsSold, uint8 royaltyBps) {
        Event memory evt = events[eventId];
        return (evt.organiser, evt.priceWei, evt.maxTickets, eventTicketsSold[eventId], evt.royaltyBps);
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
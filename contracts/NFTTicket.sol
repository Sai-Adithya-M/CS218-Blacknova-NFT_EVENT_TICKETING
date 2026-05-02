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

    // ── Tier struct: Each event can have multiple tiers ──────────────────
    struct Tier {
        uint256 price;
        uint256 maxSupply;
        uint256 sold;
    }

    // ── Event struct: Core event data ────────────────────────────────────
    struct Event {
        address organiser;   
        uint8   royaltyBps;
        uint8   maxResaleMarkupPct; // Max resale markup % over original price (e.g. 10 = 10%)
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
    mapping(uint256 => Tier[]) public eventTiers;
    mapping(uint256 => TokenData) internal _tokenData; 
    mapping(uint256 => ResaleListing) public resaleListings;
    
    mapping(uint256 => bool) public isCancelled;
    mapping(uint256 => uint256) public eventRefundLiability;
    mapping(uint256 => uint24) public eventTicketsSold;

    // Decentralized access control for ticket validation
    mapping(uint256 => mapping(address => bool)) public eventScanners;

    // ── Referral system ──────────────────────────────────────────────────
    // eventId => (referrer address => percentage in basis points, e.g. 500 = 5%)
    mapping(uint256 => mapping(address => uint256)) public eventReferrals;

    error EventIsCancelled();
    error NotEventOrganiser();
    error NotTicketOwner();
    error AlreadyRefunded();
    error RefundFailed();
    error InsufficientRefundFunds();
    error BatchLimitExceeded();
    error MaxTiersExceeded();
    error NotAuthorizedScanner();
    error AlreadyUsed();
    error InvalidToken();
    error WrongAttendee();

    // Legacy mappings removed in favor of eventTiers

    event EventCreated(uint256 indexed eventId, address indexed organiser, string ipfsHash);
    event EventUpdated(uint256 indexed eventId, uint24 newMaxTickets, uint256 newPriceWei);
    event TicketMinted(uint256 indexed tokenId, uint256 indexed eventId, address indexed buyer, uint8 tier);
    event TicketListed(uint256 indexed tokenId, address indexed seller, uint256 priceWei);
    event TicketResold(uint256 indexed tokenId, address indexed oldOwner, address indexed newOwner, uint256 priceWei, uint256 originalPrice);
    event ListingCancelled(uint256 indexed tokenId);
    event EventCancelled(uint256 indexed eventId);
    event RefundClaimed(uint256 indexed tokenId, address indexed user, uint256 amount);
    event ScannerAdded(uint256 indexed eventId, address indexed scanner);
    event ScannerRemoved(uint256 indexed eventId, address indexed scanner);
    event TicketValidated(uint256 indexed tokenId, address indexed attendee, address indexed validator, uint256 timestamp);
    event ReferralAdded(uint256 indexed eventId, address indexed referrer, uint256 bps);
    event ReferralPaid(uint256 indexed eventId, address indexed referrer, uint256 amount);

    constructor() ERC721("NFTEventTicket", "NETIX") {}

    function createEvent(
        string memory ipfsHash,
        uint8 royaltyBps,
        uint256[] memory prices,
        uint256[] memory supplies,
        uint8 maxResaleMarkupPct
    ) external {
        require(bytes(ipfsHash).length > 0, "IPFS hash required");
        require(royaltyBps <= 100, "Royalty <= 100%");
        require(prices.length == supplies.length, "Tier mismatch");
        require(prices.length > 0, "At least one tier required");
        require(prices.length <= 5, "Max 5 tiers allowed");
        require(maxResaleMarkupPct <= 100, "Markup <= 100%");

        uint256 eventId = nextEventId;
        events[eventId] = Event({
            organiser: msg.sender,
            royaltyBps: royaltyBps,
            maxResaleMarkupPct: maxResaleMarkupPct
        });

        for (uint256 i = 0; i < prices.length; i++) {
            eventTiers[eventId].push(Tier(prices[i], supplies[i], 0));
        }

        emit EventCreated(eventId, msg.sender, ipfsHash);
        nextEventId++;
    }

    function editEvent(
        uint256 eventId,
        uint256[] memory newPrices,
        uint256[] memory newSupplies
    ) external {
        Event storage evt = events[eventId];
        require(evt.organiser != address(0), "Event non-existent");
        if (msg.sender != evt.organiser) revert NotEventOrganiser();
        require(newPrices.length == newSupplies.length, "Tier mismatch");
        require(newPrices.length == eventTiers[eventId].length, "Cannot change tier count");

        for (uint256 i = 0; i < newPrices.length; i++) {
            Tier storage t = eventTiers[eventId][i];
            require(newSupplies[i] >= t.sold, "Below sold");
            t.price = newPrices[i];
            t.maxSupply = newSupplies[i];
        }

        emit EventUpdated(eventId, 0, newPrices[0]);
    }

    function getTiers(uint256 eventId) external view returns (Tier[] memory) {
        return eventTiers[eventId];
    }

    function getTier(uint256 eventId, uint256 tierId) external view returns (Tier memory) {
        require(tierId < eventTiers[eventId].length, "Invalid tierId");
        return eventTiers[eventId][tierId];
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

    function buyTicket(uint256 eventId, uint256 tierId) external payable nonReentrant {
        _buyTicketInternal(eventId, tierId, msg.sender, msg.value, address(0));
    }

    function buyTicketWithReferral(uint256 eventId, uint256 tierId, address referrer) external payable nonReentrant {
        _buyTicketInternal(eventId, tierId, msg.sender, msg.value, referrer);
    }

    function _buyTicketInternal(uint256 eventId, uint256 tierId, address buyer, uint256 amount, address referrer) internal {
        if (isCancelled[eventId]) revert EventIsCancelled();

        Event storage evt = events[eventId];
        require(evt.organiser != address(0), "Event non-existent");
        require(buyer != evt.organiser, "Organiser buy error");
        require(tierId < eventTiers[eventId].length, "Invalid tierId");

        Tier storage t = eventTiers[eventId][tierId];
        require(t.sold < t.maxSupply, "Sold out");
        require(amount == t.price, "Insufficient payment");

        uint256 tokenId = nextTokenId;
        uint80 nonce = uint80(uint256(keccak256(abi.encodePacked(block.prevrandao, block.timestamp, buyer, tokenId))));
        
        _mint(buyer, tokenId);
        _tokenData[tokenId] = TokenData({
            eventId: uint32(eventId),
            tier: uint8(tierId),
            originalPrice: uint64(amount),
            lastPricePaid: uint64(amount),
            refunded: false,
            nonce: nonce
        });

        t.sold++;
        eventTicketsSold[eventId]++;
        eventRefundLiability[eventId] += amount;
        
        emit TicketMinted(tokenId, eventId, buyer, uint8(tierId));
        nextTokenId++;

        // Handle referral payment
        uint256 organiserAmount = amount;
        if (referrer != address(0) && referrer != evt.organiser && referrer != buyer && eventReferrals[eventId][referrer] > 0) {
            uint256 referralBps = eventReferrals[eventId][referrer];
            uint256 referrerAmount = (amount * referralBps) / 10000;
            organiserAmount = amount - referrerAmount;
            
            (bool successRef, ) = payable(referrer).call{value: referrerAmount}("");
            require(successRef, "Referral transfer failed");
            emit ReferralPaid(eventId, referrer, referrerAmount);
        }

        (bool success, ) = payable(evt.organiser).call{value: organiserAmount}("");
        require(success, "Transfer failed");
    }

    function buyBatchTickets(uint256 eventId, uint256[] memory tierIds, uint24[] memory quantities) external payable nonReentrant {
        require(tierIds.length == quantities.length, "Input mismatch");
        if (isCancelled[eventId]) revert EventIsCancelled();

        Event storage evt = events[eventId];
        require(evt.organiser != address(0), "Event non-existent");
        require(msg.sender != evt.organiser, "Organiser buy error");

        uint256 totalRequired = 0;
        for (uint256 i = 0; i < tierIds.length; i++) {
            uint256 tId = tierIds[i];
            require(tId < eventTiers[eventId].length, "Invalid tierId");
            Tier storage t = eventTiers[eventId][tId];
            require(t.sold + quantities[i] <= t.maxSupply, "Tier sold out");
            totalRequired += t.price * quantities[i];
        }
        require(msg.value == totalRequired, "Incorrect payment");

        for (uint256 j = 0; j < tierIds.length; j++) {
            uint256 tId = tierIds[j];
            uint24 qty = quantities[j];
            Tier storage t = eventTiers[eventId][tId];

            for (uint256 i = 0; i < qty; i++) {
                uint256 tokenId = nextTokenId;
                uint80 nonce = uint80(uint256(keccak256(abi.encodePacked(block.prevrandao, block.timestamp, msg.sender, tokenId))));
                _mint(msg.sender, tokenId);
                _tokenData[tokenId] = TokenData({
                    eventId: uint32(eventId),
                    tier: uint8(tId),
                    originalPrice: uint64(t.price),
                    lastPricePaid: uint64(t.price),
                    refunded: false,
                    nonce: nonce
                });

                emit TicketMinted(tokenId, eventId, msg.sender, uint8(tId));
                nextTokenId++;
            }
            t.sold += qty;
            eventTicketsSold[eventId] += qty;
        }

        eventRefundLiability[eventId] += msg.value;
        (bool success, ) = payable(evt.organiser).call{value: msg.value}("");
        require(success, "Transfer failed");
    }

    function fetchEventData(uint256 eventId) public view returns (address organiser, uint8 royaltyBps, uint8 maxResaleMarkupPct) {
        Event storage evt = events[eventId];
        return (evt.organiser, evt.royaltyBps, evt.maxResaleMarkupPct);
    }

    // ── Referral Management ──────────────────────────────────────────────
    function addReferral(uint256 eventId, address referrer, uint256 bps) external {
        Event storage evt = events[eventId];
        require(evt.organiser != address(0), "Event non-existent");
        require(msg.sender == evt.organiser, "Only organiser can add referral");
        require(referrer != address(0), "Invalid referrer address");
        require(referrer != evt.organiser, "Cannot refer self");
        require(bps <= 5000, "Referral cannot exceed 50%");
        
        eventReferrals[eventId][referrer] = bps;
        emit ReferralAdded(eventId, referrer, bps);
    }

    function removeReferral(uint256 eventId, address referrer) external {
        Event storage evt = events[eventId];
        require(msg.sender == evt.organiser, "Only organiser");
        eventReferrals[eventId][referrer] = 0;
    }

    function getReferralBps(uint256 eventId, address referrer) public view returns (uint256) {
        return eventReferrals[eventId][referrer];
    }

    function listForResale(uint256 tokenId, uint256 priceWei) external {
        if (isCancelled[_tokenData[tokenId].eventId]) revert EventIsCancelled();
        require(ownerOf(tokenId) == msg.sender, "Not owner");
        require(priceWei > 0, "Price must be > 0");

        // Cap is always based on the original mint price, not last resale price.
        // Uses the organizer-configured maxResaleMarkupPct (defaults to 10% if 0).
        uint256 origPrice = uint256(_tokenData[tokenId].originalPrice);
        uint256 eventId = uint256(_tokenData[tokenId].eventId);
        uint256 markupPct = uint256(events[eventId].maxResaleMarkupPct);
        if (markupPct == 0) markupPct = 10; // Default 10% cap
        uint256 maxResalePrice = origPrice + (origPrice * markupPct / 100);
        require(priceWei <= maxResalePrice, "Resale price exceeds allowed cap");

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
        emit TicketResold(tokenId, listing.seller, msg.sender, msg.value, uint256(_tokenData[tokenId].originalPrice));
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

    /**
     * @notice Validates a ticket entry on-chain.
     * @param tokenId The ID of the ticket being scanned.
     * @param expectedAttendee The address of the person presenting the ticket (owner).
     */
    function validateTicketEntry(uint256 tokenId, address expectedAttendee) external nonReentrant {
        _validateTicketInternal(tokenId, expectedAttendee);
    }

    /**
     * @notice Validates multiple tickets in one transaction for gas optimization.
     * @param tokenIds Array of ticket IDs.
     * @param expectedAttendees Array of owner addresses matching the token IDs.
     */
    function validateBatch(uint256[] calldata tokenIds, address[] calldata expectedAttendees) external nonReentrant {
        require(tokenIds.length == expectedAttendees.length, "Length mismatch");
        for (uint256 i = 0; i < tokenIds.length; ) {
            _validateTicketInternal(tokenIds[i], expectedAttendees[i]);
            unchecked { i++; }
        }
    }

    /**
     * @dev Internal validation logic to minimize gas and prevent duplication.
     */
    function _validateTicketInternal(uint256 tokenId, address expectedAttendee) internal {
        // 1. Basic checks
        uint256 eventId = uint256(_tokenData[tokenId].eventId);
        if (eventId == 0) revert InvalidToken();

        // 2. Authorization: Caller must be organiser or approved scanner
        if (msg.sender != events[eventId].organiser && !eventScanners[eventId][msg.sender]) {
            revert NotAuthorizedScanner();
        }

        // 3. Status checks
        if (usedTickets[tokenId]) revert AlreadyUsed();
        if (isCancelled[eventId]) revert EventIsCancelled();
        if (_tokenData[tokenId].refunded) revert AlreadyRefunded();

        // 4. Ownership check: Ensure the attendee currently owns the ticket
        if (ownerOf(tokenId) != expectedAttendee) revert WrongAttendee();

        // 5. Mark as used
        usedTickets[tokenId] = true;

        emit TicketValidated(tokenId, expectedAttendee, msg.sender, block.timestamp);
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

    function getResaleListing(uint256 tokenId) public view returns (ResaleListing memory) {
        return resaleListings[tokenId];
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
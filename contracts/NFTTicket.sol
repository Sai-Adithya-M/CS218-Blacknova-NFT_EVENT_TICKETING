// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/interfaces/IERC2981.sol";

contract NFTTicket is ERC721, ReentrancyGuard, IERC2981 {
    uint256 public nextEventId = 1;
    uint256 public nextTokenId = 1;

    // Strict constraint: Max 10 tickets per batch
    // Security: Limit batch size to 10 to ensure transactions don't fail from being too large
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

    // ── Custom errors (saves ~200 gas each vs require strings) ───────────
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
    error EmptyIPFS();
    error RoyaltyTooHigh();
    error TierMismatch();
    error NoTiers();
    error TooManyTiers();
    error MarkupTooHigh();
    error RoyaltyExceedsMarkup();
    error EventNotFound();
    error OrganiserCannotBuy();
    error InvalidTier();
    error TierSoldOut();
    error WrongPayment();
    error TransferFailed();
    error NotOwner();
    error ZeroPrice();
    error ResaleCapExceeded();
    error NotForSale();
    error SellerMismatch();
    error NoListing();
    error NotSeller();
    error InvalidAddress();
    error CannotReferSelf();
    error ReferralTooHigh();
    error TierCountChanged();
    error BelowSold();
    error LengthMismatch();

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

    // =========================================================================
    //                           INTERNAL HELPERS
    // =========================================================================

    /// @dev Internal helper to securely send ETH to an address.
    /// Used for paying organizers, sellers, processing refunds, and referral payouts.
    function _sendETH(address to, uint256 amount) internal {
        assembly {
            let s := call(gas(), to, amount, 0, 0, 0, 0)
            if iszero(s) {
                mstore(0x00, 0x90b8ec18) // TransferFailed()
                revert(0x1c, 0x04)
            }
        }
    }

    // =========================================================================
    //                           EVENT MANAGEMENT
    // =========================================================================

    /// @notice Creates a new ticketing event with multiple pricing tiers.
    /// @dev Organizers configure the event details, ticket supplies, and resale rules here.
    function createEvent(
        string calldata ipfsHash,
        uint8 royaltyBps,
        uint256[] calldata prices,
        uint256[] calldata supplies,
        uint8 maxResaleMarkupPct
    ) external {
        if (bytes(ipfsHash).length == 0) revert EmptyIPFS();
        if (royaltyBps > 100) revert RoyaltyTooHigh();
        uint256 len = prices.length;
        if (len != supplies.length) revert TierMismatch();
        if (len == 0) revert NoTiers();
        if (len > 5) revert TooManyTiers();
        if (maxResaleMarkupPct > 100) revert MarkupTooHigh();
        if (maxResaleMarkupPct != 0 && royaltyBps >= maxResaleMarkupPct) revert RoyaltyExceedsMarkup();

        uint256 eventId = nextEventId;
        events[eventId] = Event({
            organiser: msg.sender,
            royaltyBps: royaltyBps,
            maxResaleMarkupPct: maxResaleMarkupPct
        });

        for (uint256 i = 0; i < len; ) {
            // Initialize each pricing tier with zero tickets sold so far
            eventTiers[eventId].push(Tier(prices[i], supplies[i], 0));
            unchecked { i++; }
        }

        emit EventCreated(eventId, msg.sender, ipfsHash);
        unchecked { nextEventId++; }
    }

    function editEvent(
        uint256 eventId,
        uint256[] calldata newPrices,
        uint256[] calldata newSupplies
    ) external {
        Event storage evt = events[eventId];
        // Ensure only the original organizer can modify their event
        address org = evt.organiser;
        if (org == address(0)) revert EventNotFound();
        if (msg.sender != org) revert NotEventOrganiser();
        uint256 len = newPrices.length;
        if (len != newSupplies.length) revert TierMismatch();
        if (len != eventTiers[eventId].length) revert TierCountChanged();

        for (uint256 i = 0; i < len; ) {
            Tier storage t = eventTiers[eventId][i];
            if (newSupplies[i] < t.sold) revert BelowSold();
            t.price = newPrices[i];
            t.maxSupply = newSupplies[i];
            unchecked { i++; }
        }

        emit EventUpdated(eventId, 0, newPrices[0]);
    }

    function getTiers(uint256 eventId) external view returns (Tier[] memory) {
        return eventTiers[eventId];
    }

    function getTier(uint256 eventId, uint256 tierId) external view returns (Tier memory) {
        if (tierId >= eventTiers[eventId].length) revert InvalidTier();
        return eventTiers[eventId][tierId];
    }

    function addScanner(uint256 eventId, address scanner) external {
        if (msg.sender != events[eventId].organiser) revert NotEventOrganiser();
        if (scanner == address(0)) revert InvalidAddress();
        eventScanners[eventId][scanner] = true;
        emit ScannerAdded(eventId, scanner);
    }

    function removeScanner(uint256 eventId, address scanner) external {
        if (msg.sender != events[eventId].organiser) revert NotEventOrganiser();
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
        address org = evt.organiser;
        if (org == address(0)) revert EventNotFound();
        if (buyer == org) revert OrganiserCannotBuy();

        // Fetch the requested ticket tier and verify it's not sold out
        Tier storage t = eventTiers[eventId][tierId];
        uint256 soldCount = t.sold; // Read once
        if (soldCount >= t.maxSupply) revert TierSoldOut();
        uint256 tierPrice = t.price; // Read once
        if (amount != tierPrice) revert WrongPayment();

        uint256 tokenId = nextTokenId;

        // Assembly nonce: avoids abi.encodePacked memory allocation overhead
        uint80 nonce;
        assembly {
            let fmp := mload(0x40)
            mstore(0x00, prevrandao())
            mstore(0x20, timestamp())
            mstore(0x40, buyer)
            mstore(0x60, tokenId)
            nonce := keccak256(0x00, 0x80)
            mstore(0x40, fmp)
        }
        
        _mint(buyer, tokenId);
        _tokenData[tokenId] = TokenData({
            eventId: uint32(eventId),
            tier: uint8(tierId),
            originalPrice: uint64(amount),
            lastPricePaid: uint64(amount),
            refunded: false,
            nonce: nonce
        });

        // Update global and event-specific counters after successful minting
        unchecked {
            t.sold = soldCount + 1;
            eventTicketsSold[eventId]++;
            nextTokenId = tokenId + 1;
            eventRefundLiability[eventId] += amount;
        }
        
        emit TicketMinted(tokenId, eventId, buyer, uint8(tierId));

        // Handle referral payment
        if (referrer != address(0) && referrer != org && referrer != buyer) {
            uint256 refBps = eventReferrals[eventId][referrer];
            if (refBps > 0) {
                uint256 referrerAmount;
                unchecked { referrerAmount = (amount * refBps) / 10000; }
                _sendETH(referrer, referrerAmount);
                emit ReferralPaid(eventId, referrer, referrerAmount);
                unchecked { amount -= referrerAmount; }
            }
        }

        _sendETH(org, amount);
    }

    function buyBatchTickets(uint256 eventId, uint256[] calldata tierIds, uint24[] calldata quantities) external payable nonReentrant {
        _buyBatchInternal(eventId, tierIds, quantities, address(0));
    }

    function buyBatchTicketsWithReferral(uint256 eventId, uint256[] calldata tierIds, uint24[] calldata quantities, address referrer) external payable nonReentrant {
        _buyBatchInternal(eventId, tierIds, quantities, referrer);
    }

    function _buyBatchInternal(uint256 eventId, uint256[] calldata tierIds, uint24[] calldata quantities, address referrer) internal {
        uint256 len = tierIds.length;
        if (len != quantities.length) revert LengthMismatch();
        if (isCancelled[eventId]) revert EventIsCancelled();

        Event storage evt = events[eventId];
        address org = evt.organiser;
        if (org == address(0)) revert EventNotFound();
        if (msg.sender == org) revert OrganiserCannotBuy();

        // ── Batch Processing ──
        // Process all requested tickets in a single pass to save on transaction costs
        uint256 cachedTokenId = nextTokenId;
        uint256 totalCost;
        uint256 totalMinted;

        for (uint256 j = 0; j < len; ) {
            uint256 tId = tierIds[j];
            uint24 qty = quantities[j];
            // Solidity array access handles OOB check
            Tier storage t = eventTiers[eventId][tId];
            uint256 tierSold = t.sold;
            uint256 tierMax = t.maxSupply;
            if (tierSold + qty > tierMax) revert TierSoldOut();
            uint64 tierPrice = uint64(t.price);

            // Mint all tickets for this tier
            for (uint256 i = 0; i < qty; ) {
                uint80 nonce;
                assembly {
                    let fmp := mload(0x40)
                    mstore(0x00, prevrandao())
                    mstore(0x20, timestamp())
                    mstore(0x40, caller())
                    mstore(0x60, cachedTokenId)
                    nonce := keccak256(0x00, 0x80)
                    mstore(0x40, fmp)
                }
                _mint(msg.sender, cachedTokenId);
                _tokenData[cachedTokenId] = TokenData({
                    eventId: uint32(eventId),
                    tier: uint8(tId),
                    originalPrice: tierPrice,
                    lastPricePaid: tierPrice,
                    refunded: false,
                    nonce: nonce
                });
                emit TicketMinted(cachedTokenId, eventId, msg.sender, uint8(tId));
                unchecked { cachedTokenId++; i++; }
            }

            // Keep a running total of the cost and number of tickets minted
            unchecked {
                t.sold = tierSold + qty;
                totalCost += uint256(tierPrice) * qty;
                totalMinted += qty;
                j++;
            }
        }

        // Ensure the buyer sent exactly enough ETH to cover all tickets in the batch
        if (msg.value != totalCost) revert WrongPayment();

        // Update final state variables with the total batch amounts
        nextTokenId = cachedTokenId;
        unchecked {
            eventTicketsSold[eventId] += uint24(totalMinted);
            eventRefundLiability[eventId] += msg.value;
        }

        // Handle referral payment
        uint256 organiserAmount = msg.value;
        if (referrer != address(0) && referrer != org && referrer != msg.sender) {
            uint256 refBps = eventReferrals[eventId][referrer];
            if (refBps > 0) {
                uint256 referrerAmount;
                unchecked { referrerAmount = (msg.value * refBps) / 10000; }
                organiserAmount = msg.value - referrerAmount;
                _sendETH(referrer, referrerAmount);
                emit ReferralPaid(eventId, referrer, referrerAmount);
            }
        }

        _sendETH(org, organiserAmount);
    }

    function fetchEventData(uint256 eventId) external view returns (address organiser, uint8 royaltyBps, uint8 maxResaleMarkupPct) {
        Event storage evt = events[eventId];
        return (evt.organiser, evt.royaltyBps, evt.maxResaleMarkupPct);
    }

    // ── Referral Management ──────────────────────────────────────────────
    function addReferral(uint256 eventId, address referrer, uint256 bps) external {
        Event storage evt = events[eventId];
        address org = evt.organiser;
        if (org == address(0)) revert EventNotFound();
        if (msg.sender != org) revert NotEventOrganiser();
        if (referrer == address(0)) revert InvalidAddress();
        if (referrer == org) revert CannotReferSelf();
        if (bps > 5000) revert ReferralTooHigh();
        
        eventReferrals[eventId][referrer] = bps;
        emit ReferralAdded(eventId, referrer, bps);
    }

    function removeReferral(uint256 eventId, address referrer) external {
        if (msg.sender != events[eventId].organiser) revert NotEventOrganiser();
        eventReferrals[eventId][referrer] = 0;
    }

    function getReferralBps(uint256 eventId, address referrer) external view returns (uint256) {
        return eventReferrals[eventId][referrer];
    }

    function listForResale(uint256 tokenId, uint256 priceWei) external {
        TokenData storage td = _tokenData[tokenId];
        uint256 eventId = uint256(td.eventId);
        if (isCancelled[eventId]) revert EventIsCancelled();
        if (ownerOf(tokenId) != msg.sender) revert NotOwner();
        if (priceWei == 0) revert ZeroPrice();

        // Cap is always based on the original mint price, not last resale price.
        uint256 origPrice = uint256(td.originalPrice);
        uint256 markupPct = uint256(events[eventId].maxResaleMarkupPct);
        if (markupPct == 0) markupPct = 10; // Default 10% cap
        uint256 maxResalePrice;
        unchecked { maxResalePrice = origPrice + (origPrice * markupPct / 100); }
        if (priceWei > maxResalePrice) revert ResaleCapExceeded();

        resaleListings[tokenId] = ResaleListing({
            seller: msg.sender,
            priceWei: priceWei,
            active: true
        });

        emit TicketListed(tokenId, msg.sender, priceWei);
    }

    function buyResaleTicket(uint256 tokenId) external payable nonReentrant {
        ResaleListing memory listing = resaleListings[tokenId];
        if (!listing.active) revert NotForSale();
        
        uint256 eventId = uint256(_tokenData[tokenId].eventId);
        if (isCancelled[eventId]) revert EventIsCancelled();
        
        Event storage evtResale = events[eventId];
        address org = evtResale.organiser;
        if (org == address(0)) revert EventNotFound();
        if (msg.sender == org) revert OrganiserCannotBuy();
        if (msg.value != listing.priceWei) revert WrongPayment();
        if (ownerOf(tokenId) != listing.seller) revert SellerMismatch();

        uint256 royaltyAmount = (msg.value * uint256(evtResale.royaltyBps)) / 100;
        uint256 sellerProceeds;
        unchecked { sellerProceeds = msg.value - royaltyAmount; }

        resaleListings[tokenId].active = false;

        if (royaltyAmount > 0) {
            _sendETH(org, royaltyAmount);
        }

        _sendETH(listing.seller, sellerProceeds);

        _transfer(listing.seller, msg.sender, tokenId);
        
        uint256 oldPrice = uint256(_tokenData[tokenId].lastPricePaid);
        _tokenData[tokenId].lastPricePaid = uint64(msg.value);
        
        unchecked {
            eventRefundLiability[eventId] = eventRefundLiability[eventId] - oldPrice + msg.value;
        }
        emit TicketResold(tokenId, listing.seller, msg.sender, msg.value, uint256(_tokenData[tokenId].originalPrice));
    }

    function cancelResaleListing(uint256 tokenId) external {
        ResaleListing storage listing = resaleListings[tokenId];
        if (!listing.active) revert NoListing();
        if (listing.seller != msg.sender) revert NotSeller();
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
        
        _sendETH(msg.sender, refundAmount);

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
        if (tokenIds.length != expectedAttendees.length) revert LengthMismatch();
        for (uint256 i = 0; i < tokenIds.length; ) {
            _validateTicketInternal(tokenIds[i], expectedAttendees[i]);
            unchecked { i++; }
        }
    }

    /**
     * @dev Internal validation logic to minimize gas and prevent duplication.
     */
    function _validateTicketInternal(uint256 tokenId, address expectedAttendee) internal {
        TokenData storage td = _tokenData[tokenId];
        uint256 eventId = uint256(td.eventId);
        if (eventId == 0) revert InvalidToken();

        if (msg.sender != events[eventId].organiser && !eventScanners[eventId][msg.sender]) {
            revert NotAuthorizedScanner();
        }

        if (usedTickets[tokenId]) revert AlreadyUsed();
        if (isCancelled[eventId]) revert EventIsCancelled();
        if (td.refunded) revert AlreadyRefunded();
        if (ownerOf(tokenId) != expectedAttendee) revert WrongAttendee();

        usedTickets[tokenId] = true;

        emit TicketValidated(tokenId, expectedAttendee, msg.sender, block.timestamp);
    }

    function getTokenPurchasePrice(uint256 tokenId) external view returns (uint256) {
        return uint256(_tokenData[tokenId].lastPricePaid);
    }

    function getTokenNonce(uint256 tokenId) external view returns (uint256) {
        return uint256(_tokenData[tokenId].nonce);
    }

    function tokenToEvent(uint256 tokenId) external view returns (uint256) {
        return uint256(_tokenData[tokenId].eventId);
    }

    function tokenToTier(uint256 tokenId) external view returns (uint8) {
        return _tokenData[tokenId].tier;
    }

    function getTokenOriginalPrice(uint256 tokenId) external view returns (uint256) {
        return uint256(_tokenData[tokenId].originalPrice);
    }

    function getTokenLastPricePaid(uint256 tokenId) external view returns (uint256) {
        return uint256(_tokenData[tokenId].lastPricePaid);
    }

    function isTokenRefunded(uint256 tokenId) external view returns (bool) {
        return _tokenData[tokenId].refunded;
    }

    function getResaleListing(uint256 tokenId) external view returns (ResaleListing memory) {
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
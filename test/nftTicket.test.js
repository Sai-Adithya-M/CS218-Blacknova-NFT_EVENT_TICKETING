import { expect } from "chai";
import hre from "hardhat";
const { ethers } = hre;

describe("NFTTicket — Full Gas Report", function () {
  let contract, deployer, organiser, buyer, buyer2, buyer3, scanner, referrer;
  const P1 = ethers.parseEther("0.1");
  const P2 = ethers.parseEther("0.2");
  const VIP = ethers.parseEther("0.5");
  const ROY = 10;   // 10%
  const MARKUP = 20; // 20% max resale

  beforeEach(async function () {
    [deployer, organiser, buyer, buyer2, buyer3, scanner, referrer] = await ethers.getSigners();
    const F = await ethers.getContractFactory("NFTTicket");
    contract = await F.deploy();
  });

  // ═══════════════════════════════════════════════════════════════════
  // 1. createEvent
  // ═══════════════════════════════════════════════════════════════════
  describe("createEvent", function () {
    it("creates event with 1 tier", async function () {
      await contract.connect(organiser).createEvent("QmHash1", ROY, [P1], [100], MARKUP);
      const d = await contract.fetchEventData(1);
      expect(d.organiser).to.equal(organiser.address);
      expect(d.royaltyBps).to.equal(ROY);
      expect(d.maxResaleMarkupPct).to.equal(MARKUP);
    });

    it("creates event with 3 tiers", async function () {
      await contract.connect(organiser).createEvent("QmHash2", ROY, [P1, P2, VIP], [100, 50, 10], MARKUP);
      const tiers = await contract.getTiers(1);
      expect(tiers.length).to.equal(3);
      expect(tiers[2].price).to.equal(VIP);
    });

    it("creates event with 5 tiers (max)", async function () {
      const prices = [P1, P1, P1, P1, P1];
      const supplies = [10, 10, 10, 10, 10];
      await contract.connect(organiser).createEvent("Qm5T", 5, prices, supplies, 50);
      const tiers = await contract.getTiers(1);
      expect(tiers.length).to.equal(5);
    });

    it("reverts: empty IPFS hash", async function () {
      await expect(contract.connect(organiser).createEvent("", ROY, [P1], [10], MARKUP))
        .to.be.revertedWithCustomError(contract, "EmptyIPFS");
    });

    it("reverts: tier mismatch", async function () {
      await expect(contract.connect(organiser).createEvent("QmE", ROY, [P1], [10, 20], MARKUP))
        .to.be.revertedWithCustomError(contract, "TierMismatch");
    });

    it("reverts: zero tiers", async function () {
      await expect(contract.connect(organiser).createEvent("QmE", ROY, [], [], MARKUP))
        .to.be.revertedWithCustomError(contract, "NoTiers");
    });

    it("reverts: > 5 tiers", async function () {
      await expect(contract.connect(organiser).createEvent("QmE", ROY, [P1,P1,P1,P1,P1,P1], [1,1,1,1,1,1], MARKUP))
        .to.be.revertedWithCustomError(contract, "TooManyTiers");
    });

    it("reverts: royalty > 100", async function () {
      await expect(contract.connect(organiser).createEvent("QmE", 101, [P1], [10], MARKUP))
        .to.be.revertedWithCustomError(contract, "RoyaltyTooHigh");
    });

    it("reverts: markup > 100", async function () {
      await expect(contract.connect(organiser).createEvent("QmE", ROY, [P1], [10], 101))
        .to.be.revertedWithCustomError(contract, "MarkupTooHigh");
    });

    it("reverts: royalty >= markup (bound check)", async function () {
      await expect(contract.connect(organiser).createEvent("QmE", 20, [P1], [10], 20))
        .to.be.revertedWithCustomError(contract, "RoyaltyExceedsMarkup");
    });

    it("allows royalty=0 with any markup", async function () {
      await contract.connect(organiser).createEvent("QmE", 0, [P1], [10], 0);
      const d = await contract.fetchEventData(1);
      expect(d.royaltyBps).to.equal(0);
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // 2. editEvent
  // ═══════════════════════════════════════════════════════════════════
  describe("editEvent", function () {
    beforeEach(async function () {
      await contract.connect(organiser).createEvent("QmEdit", ROY, [P1, VIP], [100, 10], MARKUP);
    });

    it("edits prices and supplies", async function () {
      const newP = [P2, ethers.parseEther("1.0")];
      await contract.connect(organiser).editEvent(1, newP, [200, 20]);
      const tiers = await contract.getTiers(1);
      expect(tiers[0].price).to.equal(P2);
      expect(tiers[1].maxSupply).to.equal(20);
    });

    it("reverts: event not found", async function () {
      await expect(contract.connect(organiser).editEvent(999, [P1], [100]))
        .to.be.revertedWithCustomError(contract, "EventNotFound");
    });

    it("reverts: tier mismatch", async function () {
      await expect(contract.connect(organiser).editEvent(1, [P1, VIP], [100]))
        .to.be.revertedWithCustomError(contract, "TierMismatch");
    });

    it("reverts: tier count changed", async function () {
      await expect(contract.connect(organiser).editEvent(1, [P1, VIP, P2], [100, 10, 50]))
        .to.be.revertedWithCustomError(contract, "TierCountChanged");
    });

    it("reverts: supply below sold", async function () {
      await contract.connect(buyer).buyTicket(1, 0, { value: P1 });
      await expect(contract.connect(organiser).editEvent(1, [P1, VIP], [0, 10]))
        .to.be.revertedWithCustomError(contract, "BelowSold");
    });

    it("reverts: non-organiser", async function () {
      await expect(contract.connect(buyer).editEvent(1, [P1, VIP], [100, 10]))
        .to.be.revertedWithCustomError(contract, "NotEventOrganiser");
    });

    it("reverts: cannot change tier count", async function () {
      await expect(contract.connect(organiser).editEvent(1, [P1], [100]))
        .to.be.revertedWithCustomError(contract, "TierCountChanged");
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // 3. getTiers / getTier / fetchEventData (view)
  // ═══════════════════════════════════════════════════════════════════
  describe("View functions", function () {
    beforeEach(async function () {
      await contract.connect(organiser).createEvent("QmV", ROY, [P1, VIP], [50, 5], MARKUP);
    });

    it("getTiers returns all tiers", async function () {
      const t = await contract.getTiers(1);
      expect(t.length).to.equal(2);
    });

    it("getTier returns specific tier", async function () {
      const t = await contract.getTier(1, 1);
      expect(t.price).to.equal(VIP);
    });

    it("getTier reverts: invalid tier", async function () {
      await expect(contract.getTier(1, 99))
        .to.be.revertedWithCustomError(contract, "InvalidTier");
    });

    it("fetchEventData returns organiser + royalty + markup", async function () {
      const d = await contract.fetchEventData(1);
      expect(d.organiser).to.equal(organiser.address);
      expect(d.royaltyBps).to.equal(ROY);
      expect(d.maxResaleMarkupPct).to.equal(MARKUP);
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // 4. buyTicket (single)
  // ═══════════════════════════════════════════════════════════════════
  describe("buyTicket", function () {
    beforeEach(async function () {
      await contract.connect(organiser).createEvent("QmBuy", ROY, [P1, VIP], [10, 2], MARKUP);
    });

    it("buys tier 0", async function () {
      await contract.connect(buyer).buyTicket(1, 0, { value: P1 });
      expect(await contract.ownerOf(1)).to.equal(buyer.address);
      const t = await contract.getTier(1, 0);
      expect(t.sold).to.equal(1);
    });

    it("buys tier 1 (VIP)", async function () {
      await contract.connect(buyer).buyTicket(1, 1, { value: VIP });
      expect(await contract.ownerOf(1)).to.equal(buyer.address);
    });

    it("reverts: wrong payment", async function () {
      await expect(contract.connect(buyer).buyTicket(1, 1, { value: P1 }))
        .to.be.revertedWithCustomError(contract, "WrongPayment");
    });

    it("reverts: sold out", async function () {
      await contract.connect(buyer).buyTicket(1, 1, { value: VIP });
      await contract.connect(buyer2).buyTicket(1, 1, { value: VIP });
      await expect(contract.connect(buyer3).buyTicket(1, 1, { value: VIP }))
        .to.be.revertedWithCustomError(contract, "TierSoldOut");
    });

    it("reverts: organiser cannot buy own event", async function () {
      await expect(contract.connect(organiser).buyTicket(1, 0, { value: P1 }))
        .to.be.revertedWithCustomError(contract, "OrganiserCannotBuy");
    });

    it("reverts: event is cancelled", async function () {
      await contract.connect(organiser).cancelEvent(1);
      await expect(contract.connect(buyer).buyTicket(1, 0, { value: P1 }))
        .to.be.revertedWithCustomError(contract, "EventIsCancelled");
    });

    it("reverts: event not found", async function () {
      await expect(contract.connect(buyer).buyTicket(999, 0, { value: P1 }))
        .to.be.revertedWithCustomError(contract, "EventNotFound");
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // 5. buyBatchTickets
  // ═══════════════════════════════════════════════════════════════════
  describe("buyBatchTickets", function () {
    beforeEach(async function () {
      await contract.connect(organiser).createEvent("QmBatch", ROY, [P1, VIP], [10, 5], MARKUP);
    });

    it("batch buy: 2 tier-0 + 1 tier-1", async function () {
      const total = P1 * 2n + VIP;
      await contract.connect(buyer).buyBatchTickets(1, [0, 1], [2, 1], { value: total });
      expect((await contract.getTier(1, 0)).sold).to.equal(2);
      expect((await contract.getTier(1, 1)).sold).to.equal(1);
    });

    it("reverts: incorrect payment", async function () {
      await expect(contract.connect(buyer).buyBatchTickets(1, [0], [2], { value: P1 }))
        .to.be.revertedWithCustomError(contract, "WrongPayment");
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // 6. Referral system
  // ═══════════════════════════════════════════════════════════════════
  describe("Referral System", function () {
    beforeEach(async function () {
      await contract.connect(organiser).createEvent("QmRef", ROY, [P1], [100], MARKUP);
    });

    it("addReferral: sets referral bps", async function () {
      await contract.connect(organiser).addReferral(1, referrer.address, 500);
      expect(await contract.getReferralBps(1, referrer.address)).to.equal(500);
    });


    it("addReferral reverts: non-organiser", async function () {
      await expect(contract.connect(buyer).addReferral(1, referrer.address, 500))
        .to.be.revertedWithCustomError(contract, "NotEventOrganiser");
    });

    it("addReferral reverts: > 50%", async function () {
      await expect(contract.connect(organiser).addReferral(1, referrer.address, 5001))
        .to.be.revertedWithCustomError(contract, "ReferralTooHigh");
    });

    it("buyTicketWithReferral: referrer gets 5%", async function () {
      await contract.connect(organiser).addReferral(1, referrer.address, 500);
      const refBefore = await ethers.provider.getBalance(referrer.address);
      await contract.connect(buyer).buyTicketWithReferral(1, 0, referrer.address, { value: P1 });
      const refAfter = await ethers.provider.getBalance(referrer.address);
      expect(refAfter - refBefore).to.equal(ethers.parseEther("0.005"));
    });

    it("buyBatchTicketsWithReferral: referrer gets share", async function () {
      await contract.connect(organiser).addReferral(1, referrer.address, 500);
      const refBefore = await ethers.provider.getBalance(referrer.address);
      await contract.connect(buyer).buyBatchTicketsWithReferral(1, [0], [3], referrer.address, { value: P1 * 3n });
      const refAfter = await ethers.provider.getBalance(referrer.address);
      // 5% of 0.3 ETH = 0.015 ETH
      expect(refAfter - refBefore).to.equal(ethers.parseEther("0.015"));
    });

    it("unregistered referrer: organiser gets 100%", async function () {
      const orgBefore = await ethers.provider.getBalance(organiser.address);
      await contract.connect(buyer).buyTicketWithReferral(1, 0, referrer.address, { value: P1 });
      const orgAfter = await ethers.provider.getBalance(organiser.address);
      expect(orgAfter - orgBefore).to.equal(P1);
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // 7. Resale: listForResale / buyResaleTicket / cancelResaleListing
  // ═══════════════════════════════════════════════════════════════════
  describe("Secondary Market (Resale)", function () {
    beforeEach(async function () {
      await contract.connect(organiser).createEvent("QmResale", ROY, [P1], [10], MARKUP);
      await contract.connect(buyer).buyTicket(1, 0, { value: P1 });
    });

    it("listForResale: lists at markup cap", async function () {
      const maxPrice = P1 + (P1 * BigInt(MARKUP) / 100n); // 0.12 ETH
      await contract.connect(buyer).listForResale(1, maxPrice);
      const listing = await contract.getResaleListing(1);
      expect(listing.active).to.be.true;
      expect(listing.priceWei).to.equal(maxPrice);
    });

    it("listForResale reverts: above cap", async function () {
      const overCap = P1 + (P1 * BigInt(MARKUP) / 100n) + 1n;
      await expect(contract.connect(buyer).listForResale(1, overCap))
        .to.be.revertedWithCustomError(contract, "ResaleCapExceeded");
    });

    it("buyResaleTicket: transfers ownership + pays royalty", async function () {
      const resalePrice = P1 + (P1 * BigInt(MARKUP) / 100n);
      await contract.connect(buyer).listForResale(1, resalePrice);

      const orgBefore = await ethers.provider.getBalance(organiser.address);
      await contract.connect(buyer2).buyResaleTicket(1, { value: resalePrice });

      expect(await contract.ownerOf(1)).to.equal(buyer2.address);
      const orgAfter = await ethers.provider.getBalance(organiser.address);
      // Royalty = 10% of resalePrice
      expect(orgAfter - orgBefore).to.equal(resalePrice * BigInt(ROY) / 100n);
    });

    it("non-compounding: 2nd resale still capped at original+markup%", async function () {
      const cap = P1 + (P1 * BigInt(MARKUP) / 100n);
      await contract.connect(buyer).listForResale(1, cap);
      await contract.connect(buyer2).buyResaleTicket(1, { value: cap });

      // buyer2 re-lists at same cap — should pass
      await contract.connect(buyer2).listForResale(1, cap);
      await contract.connect(buyer3).buyResaleTicket(1, { value: cap });
      expect(await contract.ownerOf(1)).to.equal(buyer3.address);
    });

    it("cancelResaleListing: deactivates listing", async function () {
      await contract.connect(buyer).listForResale(1, P1);
      await contract.connect(buyer).cancelResaleListing(1);
      const listing = await contract.getResaleListing(1);
      expect(listing.active).to.be.false;
    });

    it("cancelResaleListing reverts: not seller", async function () {
      await contract.connect(buyer).listForResale(1, P1);
      await expect(contract.connect(buyer2).cancelResaleListing(1))
        .to.be.revertedWithCustomError(contract, "NotSeller");
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // 8. cancelEvent + claimRefund
  // ═══════════════════════════════════════════════════════════════════
  describe("Event Cancellation & Refunds", function () {
    beforeEach(async function () {
      await contract.connect(organiser).createEvent("QmCancel", ROY, [P1], [10], MARKUP);
      await contract.connect(buyer).buyTicket(1, 0, { value: P1 });
      await contract.connect(buyer2).buyTicket(1, 0, { value: P1 });
    });

    it("cancelEvent: emits event", async function () {
      await expect(contract.connect(organiser).cancelEvent(1, { value: P1 * 2n }))
        .to.emit(contract, "EventCancelled").withArgs(1);
      expect(await contract.isCancelled(1)).to.be.true;
    });

    it("cancelEvent reverts: insufficient funds", async function () {
      await expect(contract.connect(organiser).cancelEvent(1, { value: P1 }))
        .to.be.revertedWithCustomError(contract, "InsufficientRefundFunds");
    });

    it("cancelEvent reverts: not organiser", async function () {
      await expect(contract.connect(buyer).cancelEvent(1, { value: P1 * 2n }))
        .to.be.revertedWithCustomError(contract, "NotEventOrganiser");
    });

    it("claimRefund: refunds buyer after cancellation", async function () {
      await contract.connect(organiser).cancelEvent(1, { value: P1 * 2n });
      const before = await ethers.provider.getBalance(buyer.address);
      const tx = await contract.connect(buyer).claimRefund(1);
      const receipt = await tx.wait();
      const gas = receipt.gasUsed * receipt.gasPrice;
      const after = await ethers.provider.getBalance(buyer.address);
      expect(after).to.equal(before + P1 - gas);
    });

    it("claimRefund reverts: not cancelled", async function () {
      await expect(contract.connect(buyer).claimRefund(1))
        .to.be.revertedWithCustomError(contract, "EventIsCancelled");
    });

    it("claimRefund reverts: double refund", async function () {
      await contract.connect(organiser).cancelEvent(1, { value: P1 * 2n });
      await contract.connect(buyer).claimRefund(1);
      await expect(contract.connect(buyer).claimRefund(1))
        .to.be.revertedWithCustomError(contract, "AlreadyRefunded");
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // 9. Scanner system: addScanner
  // ═══════════════════════════════════════════════════════════════════
  describe("Scanner Management", function () {
    beforeEach(async function () {
      await contract.connect(organiser).createEvent("QmScan", ROY, [P1], [10], MARKUP);
    });

    it("addScanner: grants scanner role", async function () {
      await contract.connect(organiser).addScanner(1, scanner.address);
      expect(await contract.eventScanners(1, scanner.address)).to.be.true;
    });


    it("addScanner reverts: not organiser", async function () {
      await expect(contract.connect(buyer).addScanner(1, scanner.address))
        .to.be.revertedWithCustomError(contract, "NotEventOrganiser");
    });

    it("addScanner reverts: invalid address", async function () {
      await expect(contract.connect(organiser).addScanner(1, ethers.ZeroAddress))
        .to.be.revertedWithCustomError(contract, "InvalidAddress");
    });

    it("removeScanner: revokes scanner role", async function () {
      await contract.connect(organiser).addScanner(1, scanner.address);
      await contract.connect(organiser).removeScanner(1, scanner.address);
      expect(await contract.eventScanners(1, scanner.address)).to.be.false;
    });

    it("removeScanner reverts: not organiser", async function () {
      await expect(contract.connect(buyer).removeScanner(1, scanner.address))
        .to.be.revertedWithCustomError(contract, "NotEventOrganiser");
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // 10. Ticket Validation: validateTicketEntry
  // ═══════════════════════════════════════════════════════════════════
  describe("Ticket Validation", function () {
    beforeEach(async function () {
      await contract.connect(organiser).createEvent("QmVal", ROY, [P1], [10], MARKUP);
      await contract.connect(buyer).buyTicket(1, 0, { value: P1 });
      await contract.connect(buyer2).buyTicket(1, 0, { value: P1 });
      await contract.connect(buyer3).buyTicket(1, 0, { value: P1 });
    });

    it("validateTicketEntry: organiser validates", async function () {
      await expect(contract.connect(organiser).validateTicketEntry(1, buyer.address))
        .to.emit(contract, "TicketValidated");
      expect(await contract.usedTickets(1)).to.be.true;
    });

    it("validateTicketEntry: scanner validates", async function () {
      await contract.connect(organiser).addScanner(1, scanner.address);
      await contract.connect(scanner).validateTicketEntry(1, buyer.address);
      expect(await contract.usedTickets(1)).to.be.true;
    });

    it("validateTicketEntry reverts: already used", async function () {
      await contract.connect(organiser).validateTicketEntry(1, buyer.address);
      await expect(contract.connect(organiser).validateTicketEntry(1, buyer.address))
        .to.be.revertedWithCustomError(contract, "AlreadyUsed");
    });

    it("validateTicketEntry reverts: wrong attendee", async function () {
      await expect(contract.connect(organiser).validateTicketEntry(1, buyer2.address))
        .to.be.revertedWithCustomError(contract, "WrongAttendee");
    });

    it("validateTicketEntry reverts: not authorized", async function () {
      await expect(contract.connect(buyer2).validateTicketEntry(1, buyer.address))
        .to.be.revertedWithCustomError(contract, "NotAuthorizedScanner");
    });

  });

  // ═══════════════════════════════════════════════════════════════════
  // 11. Token data view functions
  // ═══════════════════════════════════════════════════════════════════
  describe("Token Data Views", function () {
    beforeEach(async function () {
      await contract.connect(organiser).createEvent("QmData", ROY, [P1], [10], MARKUP);
      await contract.connect(buyer).buyTicket(1, 0, { value: P1 });
    });

    it("tokenToEvent", async function () {
      expect(await contract.tokenToEvent(1)).to.equal(1);
    });

    it("tokenToTier", async function () {
      expect(await contract.tokenToTier(1)).to.equal(0);
    });

    it("getTokenOriginalPrice", async function () {
      expect(await contract.getTokenOriginalPrice(1)).to.equal(P1);
    });

    it("getTokenLastPricePaid", async function () {
      expect(await contract.getTokenLastPricePaid(1)).to.equal(P1);
    });

    it("getTokenPurchasePrice", async function () {
      expect(await contract.getTokenPurchasePrice(1)).to.equal(P1);
    });

    it("getTokenNonce: non-zero", async function () {
      const nonce = await contract.getTokenNonce(1);
      expect(nonce).to.not.equal(0);
    });

    it("isTokenRefunded: false by default", async function () {
      expect(await contract.isTokenRefunded(1)).to.be.false;
    });

    it("getResaleListing: inactive by default", async function () {
      const l = await contract.getResaleListing(1);
      expect(l.active).to.be.false;
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // 12. royaltyInfo (EIP-2981) + supportsInterface
  // ═══════════════════════════════════════════════════════════════════
  describe("EIP-2981 Royalties", function () {
    beforeEach(async function () {
      await contract.connect(organiser).createEvent("QmRoy", ROY, [P1], [10], MARKUP);
      await contract.connect(buyer).buyTicket(1, 0, { value: P1 });
    });

    it("royaltyInfo: returns correct receiver + amount", async function () {
      const [receiver, amount] = await contract.royaltyInfo(1, P1);
      expect(receiver).to.equal(organiser.address);
      expect(amount).to.equal(P1 * BigInt(ROY) / 100n);
    });

    it("supportsInterface: ERC721", async function () {
      expect(await contract.supportsInterface("0x80ac58cd")).to.be.true;
    });

    it("supportsInterface: ERC2981", async function () {
      expect(await contract.supportsInterface("0x2a55205a")).to.be.true;
    });
  });
});
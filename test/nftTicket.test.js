import { expect } from "chai";
import hre from "hardhat";
const { ethers } = hre;

describe("NFTTicket", function () {
  let contract, deployer, organiser, buyer, buyer2, buyer3;
  const ONE_ETH = ethers.parseEther("1");
  const HALF_ETH = ethers.parseEther("0.5");
  const TWO_ETH = ethers.parseEther("2");
  const TINY = ethers.parseEther("0.01");

  const TIER_SILVER = 0;
  const TIER_GOLD = 1;
  const TIER_VIP = 2;
  const ROYALTY_BPS = 1000; // 10%

  beforeEach(async function () {
    [deployer, organiser, buyer, buyer2, buyer3] = await ethers.getSigners();
    const NFTTicket = await ethers.getContractFactory("NFTTicket");
    contract = await NFTTicket.deploy();
  });

  // ─── Event Creation ──────────────────────────────────────────────
  describe("Event Creation", function () {
    it("Creates an event successfully", async function () {
      const tx = await contract.connect(organiser).createEvent("QmHash1", 100, ONE_ETH, ROYALTY_BPS);
      const receipt = await tx.wait();
      console.log("  ⛽  createEvent gas:", receipt.gasUsed.toString());
      const evt = await contract.fetchEventData(1);
      expect(evt.maxTickets).to.equal(100);
      expect(evt.priceWei).to.equal(ONE_ETH);
      expect(evt.organiser).to.equal(organiser.address);
      expect(evt.royaltyBps).to.equal(ROYALTY_BPS);
      expect(evt.exists).to.equal(true);
    });

    it("Reverts with empty IPFS hash", async function () {
      await expect(contract.connect(organiser).createEvent("", 10, ONE_ETH, ROYALTY_BPS))
        .to.be.revertedWith("IPFS hash cannot be empty");
    });

    it("Reverts with zero tickets", async function () {
      await expect(contract.connect(organiser).createEvent("QmHash", 0, ONE_ETH, ROYALTY_BPS))
        .to.be.revertedWith("Must have tickets");
    });

    it("Reverts with zero price", async function () {
      await expect(contract.connect(organiser).createEvent("QmHash", 10, 0, ROYALTY_BPS))
        .to.be.revertedWith("Price must be greater than zero");
    });

    it("Reverts with royalty > 100%", async function () {
      await expect(contract.connect(organiser).createEvent("QmHash", 10, ONE_ETH, 10001))
        .to.be.revertedWith("Royalty cannot exceed 100%");
    });

    it("Creates multiple events and increments IDs", async function () {
      await contract.connect(organiser).createEvent("QmHash1", 50, ONE_ETH, 500);
      await contract.connect(organiser).createEvent("QmHash2", 100, TWO_ETH, 1000);
      const tx3 = await contract.connect(buyer).createEvent("QmHash3", 25, HALF_ETH, 250);
      const r3 = await tx3.wait();
      console.log("  ⛽  createEvent (3rd) gas:", r3.gasUsed.toString());

      const e1 = await contract.fetchEventData(1);
      const e2 = await contract.fetchEventData(2);
      const e3 = await contract.fetchEventData(3);
      expect(e1.maxTickets).to.equal(50);
      expect(e2.maxTickets).to.equal(100);
      expect(e3.organiser).to.equal(buyer.address);
      expect(await contract.nextEventId()).to.equal(4);
    });

    it("Creates event with max royalty 100%", async function () {
      const tx = await contract.connect(organiser).createEvent("QmMaxRoyalty", 10, ONE_ETH, 10000);
      const receipt = await tx.wait();
      console.log("  ⛽  createEvent (100% royalty) gas:", receipt.gasUsed.toString());
      const evt = await contract.fetchEventData(1);
      expect(evt.royaltyBps).to.equal(10000);
    });

    it("Creates event with tiny price", async function () {
      const tx = await contract.connect(organiser).createEvent("QmTiny", 1000, TINY, 100);
      const receipt = await tx.wait();
      console.log("  ⛽  createEvent (tiny price) gas:", receipt.gasUsed.toString());
      const evt = await contract.fetchEventData(1);
      expect(evt.priceWei).to.equal(TINY);
    });

    it("Emits EventCreated event", async function () {
      await expect(contract.connect(organiser).createEvent("QmEmit", 10, ONE_ETH, 500))
        .to.emit(contract, "EventCreated").withArgs(1, organiser.address, "QmEmit");
    });
  });

  // ─── Edit Event ──────────────────────────────────────────────────
  describe("Edit Event", function () {
    beforeEach(async function () {
      await contract.connect(organiser).createEvent("QmOriginal", 50, ONE_ETH, ROYALTY_BPS);
    });

    it("Organiser can edit their event", async function () {
      const tx = await contract.connect(organiser).editEvent(1, "QmNew", 100, TWO_ETH);
      const receipt = await tx.wait();
      console.log("  ⛽  editEvent gas:", receipt.gasUsed.toString());
      const evt = await contract.fetchEventData(1);
      expect(evt.maxTickets).to.equal(100);
      expect(evt.priceWei).to.equal(TWO_ETH);
    });

    it("Non-organiser cannot edit event", async function () {
      await expect(contract.connect(buyer).editEvent(1, "QmHack", 100, ONE_ETH))
        .to.be.revertedWith("Not the organiser");
    });

    it("Cannot reduce max below sold tickets", async function () {
      await contract.connect(buyer).buyTicket(1, 5, TIER_SILVER, { value: ONE_ETH * 5n });
      await expect(contract.connect(organiser).editEvent(1, "QmNew", 3, ONE_ETH))
        .to.be.revertedWith("Cannot reduce max below sold");
    });

    it("Emits EventUpdated on edit", async function () {
      await expect(contract.connect(organiser).editEvent(1, "QmUpdated", 50, ONE_ETH))
        .to.emit(contract, "EventUpdated").withArgs(1, "QmUpdated");
    });

    it("Cannot edit non-existent event", async function () {
      await expect(contract.connect(organiser).editEvent(99, "QmFake", 10, ONE_ETH))
        .to.be.revertedWith("Event does not exist");
    });

    it("Edit with empty hash reverts", async function () {
      await expect(contract.connect(organiser).editEvent(1, "", 50, ONE_ETH))
        .to.be.revertedWith("IPFS hash cannot be empty");
    });

    it("Edit with zero price reverts", async function () {
      await expect(contract.connect(organiser).editEvent(1, "QmNew", 50, 0))
        .to.be.revertedWith("Price must be > 0");
    });
  });

  // ─── Ticket Purchase ─────────────────────────────────────────────
  describe("Ticket Purchase", function () {
    beforeEach(async function () {
      await contract.connect(organiser).createEvent("QmEvent", 10, ONE_ETH, ROYALTY_BPS);
    });

    it("Buys a single Silver ticket", async function () {
      const tx = await contract.connect(buyer).buyTicket(1, 1, TIER_SILVER, { value: ONE_ETH });
      const receipt = await tx.wait();
      console.log("  ⛽  buyTicket (1x Silver) gas:", receipt.gasUsed.toString());
      expect(await contract.ownerOf(1)).to.equal(buyer.address);
      expect(await contract.tokenToTier(1)).to.equal(TIER_SILVER);
    });

    it("Buys a single Gold ticket", async function () {
      const tx = await contract.connect(buyer).buyTicket(1, 1, TIER_GOLD, { value: ONE_ETH });
      const receipt = await tx.wait();
      console.log("  ⛽  buyTicket (1x Gold) gas:", receipt.gasUsed.toString());
      expect(await contract.tokenToTier(1)).to.equal(TIER_GOLD);
    });

    it("Buys a single VIP ticket", async function () {
      const tx = await contract.connect(buyer).buyTicket(1, 1, TIER_VIP, { value: ONE_ETH });
      const receipt = await tx.wait();
      console.log("  ⛽  buyTicket (1x VIP) gas:", receipt.gasUsed.toString());
      expect(await contract.tokenToTier(1)).to.equal(TIER_VIP);
    });

    it("Buys 3x VIP tickets", async function () {
      const tx = await contract.connect(buyer).buyTicket(1, 3, TIER_VIP, { value: ONE_ETH * 3n });
      const receipt = await tx.wait();
      console.log("  ⛽  buyTicket (3x VIP) gas:", receipt.gasUsed.toString());
      for (let i = 1; i <= 3; i++) {
        expect(await contract.ownerOf(i)).to.equal(buyer.address);
        expect(await contract.tokenToTier(i)).to.equal(TIER_VIP);
      }
    });

    it("Buys 5x Silver tickets", async function () {
      const tx = await contract.connect(buyer).buyTicket(1, 5, TIER_SILVER, { value: ONE_ETH * 5n });
      const receipt = await tx.wait();
      console.log("  ⛽  buyTicket (5x Silver) gas:", receipt.gasUsed.toString());
      const evt = await contract.fetchEventData(1);
      expect(evt.ticketsSold).to.equal(5);
    });

    it("Buying beyond max tickets reverts", async function () {
      await contract.connect(buyer).buyTicket(1, 10, TIER_SILVER, { value: ONE_ETH * 10n });
      await expect(contract.connect(buyer2).buyTicket(1, 1, TIER_SILVER, { value: ONE_ETH }))
        .to.be.revertedWith("Not enough tickets available");
    });

    it("Rejects insufficient ETH", async function () {
      await expect(contract.connect(buyer).buyTicket(1, 1, TIER_SILVER, { value: HALF_ETH }))
        .to.be.revertedWith("Incorrect ETH amount");
    });

    it("Accepts overpayment (>=)", async function () {
      await expect(contract.connect(buyer).buyTicket(1, 1, TIER_GOLD, { value: ethers.parseEther("1.5") }))
        .to.not.be.reverted;
    });

    it("Organiser cannot buy own tickets", async function () {
      await expect(contract.connect(organiser).buyTicket(1, 1, TIER_SILVER, { value: ONE_ETH }))
        .to.be.revertedWith("Organiser cannot buy their own tickets");
    });

    it("Cannot buy from non-existent event", async function () {
      await expect(contract.connect(buyer).buyTicket(99, 1, TIER_SILVER, { value: ONE_ETH }))
        .to.be.revertedWith("Event does not exist");
    });

    it("Cannot buy zero quantity", async function () {
      await expect(contract.connect(buyer).buyTicket(1, 0, TIER_SILVER, { value: 0 }))
        .to.be.revertedWith("Quantity must be > 0");
    });

    it("Emits TicketMinted event", async function () {
      await expect(contract.connect(buyer).buyTicket(1, 1, TIER_GOLD, { value: ONE_ETH }))
        .to.emit(contract, "TicketMinted").withArgs(1, 1, buyer.address, TIER_GOLD);
    });

    it("Organiser receives payment", async function () {
      const before = await ethers.provider.getBalance(organiser.address);
      await contract.connect(buyer).buyTicket(1, 2, TIER_SILVER, { value: ONE_ETH * 2n });
      const after = await ethers.provider.getBalance(organiser.address);
      expect(after - before).to.equal(ONE_ETH * 2n);
    });

    it("Multiple buyers purchase from same event", async function () {
      await contract.connect(buyer).buyTicket(1, 3, TIER_SILVER, { value: ONE_ETH * 3n });
      await contract.connect(buyer2).buyTicket(1, 2, TIER_GOLD, { value: ONE_ETH * 2n });
      const tx = await contract.connect(buyer3).buyTicket(1, 1, TIER_VIP, { value: ONE_ETH });
      const receipt = await tx.wait();
      console.log("  ⛽  buyTicket (3rd buyer) gas:", receipt.gasUsed.toString());
      const evt = await contract.fetchEventData(1);
      expect(evt.ticketsSold).to.equal(6);
      expect(await contract.ownerOf(4)).to.equal(buyer2.address);
      expect(await contract.ownerOf(6)).to.equal(buyer3.address);
    });
  });

  // ─── Batch Ticket Purchase ────────────────────────────────────────
  describe("Batch Ticket Purchase", function () {
    beforeEach(async function () {
      await contract.connect(organiser).createEvent("QmBatch", 50, ONE_ETH, ROYALTY_BPS);
    });

    it("Buys batch tickets across 2 tiers", async function () {
      const tx = await contract.connect(buyer).buyBatchTickets(1, [TIER_SILVER, TIER_GOLD], [2, 1], { value: ONE_ETH * 3n });
      const receipt = await tx.wait();
      console.log("  ⛽  buyBatchTickets (2S+1G) gas:", receipt.gasUsed.toString());
      expect(await contract.tokenToTier(1)).to.equal(TIER_SILVER);
      expect(await contract.tokenToTier(2)).to.equal(TIER_SILVER);
      expect(await contract.tokenToTier(3)).to.equal(TIER_GOLD);
    });

    it("Buys batch tickets across all 3 tiers", async function () {
      const tx = await contract.connect(buyer).buyBatchTickets(1, [TIER_SILVER, TIER_GOLD, TIER_VIP], [2, 2, 1], { value: ONE_ETH * 5n });
      const receipt = await tx.wait();
      console.log("  ⛽  buyBatchTickets (2S+2G+1V) gas:", receipt.gasUsed.toString());
      expect(await contract.tokenToTier(5)).to.equal(TIER_VIP);
      const evt = await contract.fetchEventData(1);
      expect(evt.ticketsSold).to.equal(5);
    });

    it("Batch with mismatched arrays reverts", async function () {
      await expect(contract.connect(buyer).buyBatchTickets(1, [TIER_SILVER], [1, 2], { value: ONE_ETH * 3n }))
        .to.be.revertedWith("Mismatched input arrays");
    });

    it("Batch with zero total quantity reverts", async function () {
      await expect(contract.connect(buyer).buyBatchTickets(1, [TIER_SILVER], [0], { value: 0 }))
        .to.be.revertedWith("Quantity must be > 0");
    });

    it("Large batch purchase (10 tickets)", async function () {
      const tx = await contract.connect(buyer).buyBatchTickets(1, [TIER_SILVER, TIER_GOLD, TIER_VIP], [4, 3, 3], { value: ONE_ETH * 10n });
      const receipt = await tx.wait();
      console.log("  ⛽  buyBatchTickets (10 tickets) gas:", receipt.gasUsed.toString());
      expect(await contract.fetchEventData(1).then(e => e.ticketsSold)).to.equal(10);
    });
  });

  // ─── Marketplace & Royalties ──────────────────────────────────────
  describe("Marketplace & Royalties", function () {
    beforeEach(async function () {
      await contract.connect(organiser).createEvent("QmConcert", 10, ONE_ETH, ROYALTY_BPS);
      await contract.connect(buyer).buyTicket(1, 1, TIER_SILVER, { value: ONE_ETH });
    });

    it("Lists a ticket for resale", async function () {
      const tx = await contract.connect(buyer).listForResale(1, ONE_ETH);
      const receipt = await tx.wait();
      console.log("  ⛽  listForResale gas:", receipt.gasUsed.toString());
      const listing = await contract.getResaleListing(1);
      expect(listing.active).to.equal(true);
      expect(listing.seller).to.equal(buyer.address);
    });

    it("Non-owner cannot list", async function () {
      await expect(contract.connect(buyer2).listForResale(1, ONE_ETH))
        .to.be.revertedWith("Not the owner");
    });

    it("Cannot list with zero price", async function () {
      await expect(contract.connect(buyer).listForResale(1, 0))
        .to.be.revertedWith("Price must be > 0");
    });

    it("Emits TicketListed event", async function () {
      await expect(contract.connect(buyer).listForResale(1, TWO_ETH))
        .to.emit(contract, "TicketListed").withArgs(1, buyer.address, TWO_ETH);
    });

    it("Buys resale ticket with correct royalty split", async function () {
      await contract.connect(buyer).listForResale(1, ONE_ETH);
      const orgBefore = await ethers.provider.getBalance(organiser.address);
      const sellerBefore = await ethers.provider.getBalance(buyer.address);
      const tx = await contract.connect(buyer2).buyResaleTicket(1, { value: ONE_ETH });
      const receipt = await tx.wait();
      console.log("  ⛽  buyResaleTicket gas:", receipt.gasUsed.toString());
      const orgAfter = await ethers.provider.getBalance(organiser.address);
      const sellerAfter = await ethers.provider.getBalance(buyer.address);
      expect(orgAfter - orgBefore).to.equal(ethers.parseEther("0.1"));
      expect(sellerAfter - sellerBefore).to.equal(ethers.parseEther("0.9"));
    });

    it("Resale with higher price – royalty scales", async function () {
      await contract.connect(buyer).listForResale(1, TWO_ETH);
      const orgBefore = await ethers.provider.getBalance(organiser.address);
      const tx = await contract.connect(buyer2).buyResaleTicket(1, { value: TWO_ETH });
      const receipt = await tx.wait();
      console.log("  ⛽  buyResaleTicket (2ETH) gas:", receipt.gasUsed.toString());
      const orgAfter = await ethers.provider.getBalance(organiser.address);
      expect(orgAfter - orgBefore).to.equal(ethers.parseEther("0.2")); // 10% of 2 ETH
    });

    it("ownerOf updates after resale", async function () {
      await contract.connect(buyer).listForResale(1, ONE_ETH);
      await contract.connect(buyer2).buyResaleTicket(1, { value: ONE_ETH });
      expect(await contract.ownerOf(1)).to.equal(buyer2.address);
    });

    it("Emits TicketResold event", async function () {
      await contract.connect(buyer).listForResale(1, ONE_ETH);
      await expect(contract.connect(buyer2).buyResaleTicket(1, { value: ONE_ETH }))
        .to.emit(contract, "TicketResold").withArgs(1, buyer.address, buyer2.address, ONE_ETH);
    });

    it("ERC-2981 royaltyInfo returns expected values", async function () {
      const [receiver, amount] = await contract.royaltyInfo(1, ONE_ETH);
      expect(receiver).to.equal(organiser.address);
      expect(amount).to.equal(ethers.parseEther("0.1"));
    });

    it("ERC-2981 royaltyInfo with 5ETH sale", async function () {
      const fiveEth = ethers.parseEther("5");
      const [receiver, amount] = await contract.royaltyInfo(1, fiveEth);
      expect(receiver).to.equal(organiser.address);
      expect(amount).to.equal(ethers.parseEther("0.5"));
    });

    it("Cancels a resale listing", async function () {
      await contract.connect(buyer).listForResale(1, ONE_ETH);
      const tx = await contract.connect(buyer).cancelResaleListing(1);
      const receipt = await tx.wait();
      console.log("  ⛽  cancelResaleListing gas:", receipt.gasUsed.toString());
      const listing = await contract.getResaleListing(1);
      expect(listing.active).to.equal(false);
    });

    it("Emits ListingCancelled event", async function () {
      await contract.connect(buyer).listForResale(1, ONE_ETH);
      await expect(contract.connect(buyer).cancelResaleListing(1))
        .to.emit(contract, "ListingCancelled").withArgs(1);
    });

    it("Cannot cancel if not seller", async function () {
      await contract.connect(buyer).listForResale(1, ONE_ETH);
      await expect(contract.connect(buyer2).cancelResaleListing(1))
        .to.be.revertedWith("Not the seller");
    });

    it("Cancelled listing cannot be purchased", async function () {
      await contract.connect(buyer).listForResale(1, ONE_ETH);
      await contract.connect(buyer).cancelResaleListing(1);
      await expect(contract.connect(buyer2).buyResaleTicket(1, { value: ONE_ETH }))
        .to.be.revertedWith("Not for sale");
    });

    it("Resale buyer can relist at higher price", async function () {
      await contract.connect(buyer).listForResale(1, ONE_ETH);
      await contract.connect(buyer2).buyResaleTicket(1, { value: ONE_ETH });
      const tx = await contract.connect(buyer2).listForResale(1, TWO_ETH);
      const receipt = await tx.wait();
      console.log("  ⛽  listForResale (relist) gas:", receipt.gasUsed.toString());
      const listing = await contract.getResaleListing(1);
      expect(listing.active).to.equal(true);
      expect(listing.seller).to.equal(buyer2.address);
      expect(listing.priceWei).to.equal(TWO_ETH);
    });

    it("Wrong ETH amount for resale reverts", async function () {
      await contract.connect(buyer).listForResale(1, ONE_ETH);
      await expect(contract.connect(buyer2).buyResaleTicket(1, { value: HALF_ETH }))
        .to.be.revertedWith("Incorrect ETH amount");
    });

    it("Organiser cannot buy resale ticket", async function () {
      await contract.connect(buyer).listForResale(1, ONE_ETH);
      await expect(contract.connect(organiser).buyResaleTicket(1, { value: ONE_ETH }))
        .to.be.revertedWith("Organiser cannot buy their own tickets");
    });
  });

  // ─── Chain Resale (3-hop) ─────────────────────────────────────────
  describe("Chain Resale", function () {
    it("Ticket passes through 3 owners with royalties each time", async function () {
      await contract.connect(organiser).createEvent("QmChain", 10, ONE_ETH, ROYALTY_BPS);
      // buyer1 buys
      await contract.connect(buyer).buyTicket(1, 1, TIER_VIP, { value: ONE_ETH });
      // buyer1 → buyer2
      await contract.connect(buyer).listForResale(1, TWO_ETH);
      let orgBefore = await ethers.provider.getBalance(organiser.address);
      let tx = await contract.connect(buyer2).buyResaleTicket(1, { value: TWO_ETH });
      let receipt = await tx.wait();
      console.log("  ⛽  resale hop 1 gas:", receipt.gasUsed.toString());
      let orgAfter = await ethers.provider.getBalance(organiser.address);
      expect(orgAfter - orgBefore).to.equal(ethers.parseEther("0.2"));
      expect(await contract.ownerOf(1)).to.equal(buyer2.address);

      // buyer2 → buyer3
      const THREE_ETH = ethers.parseEther("3");
      await contract.connect(buyer2).listForResale(1, THREE_ETH);
      orgBefore = await ethers.provider.getBalance(organiser.address);
      tx = await contract.connect(buyer3).buyResaleTicket(1, { value: THREE_ETH });
      receipt = await tx.wait();
      console.log("  ⛽  resale hop 2 gas:", receipt.gasUsed.toString());
      orgAfter = await ethers.provider.getBalance(organiser.address);
      expect(orgAfter - orgBefore).to.equal(ethers.parseEther("0.3"));
      expect(await contract.ownerOf(1)).to.equal(buyer3.address);
    });
  });

  // ─── View & Standards ─────────────────────────────────────────────
  describe("View & Standards", function () {
    it("supportsInterface returns true for ERC-721", async function () {
      expect(await contract.supportsInterface("0x80ac58cd")).to.equal(true);
    });

    it("supportsInterface returns true for ERC-2981", async function () {
      expect(await contract.supportsInterface("0x2a55205a")).to.equal(true);
    });

    it("fetchEventData for non-existent event returns defaults", async function () {
      const evt = await contract.fetchEventData(999);
      expect(evt.exists).to.equal(false);
      expect(evt.maxTickets).to.equal(0);
    });

    it("getResaleListing for unlisted token returns inactive", async function () {
      const listing = await contract.getResaleListing(999);
      expect(listing.active).to.equal(false);
    });

    it("tokenToEvent mapping is correct", async function () {
      await contract.connect(organiser).createEvent("QmA", 10, ONE_ETH, 500);
      await contract.connect(organiser).createEvent("QmB", 10, ONE_ETH, 500);
      await contract.connect(buyer).buyTicket(1, 1, TIER_SILVER, { value: ONE_ETH });
      await contract.connect(buyer).buyTicket(2, 1, TIER_GOLD, { value: ONE_ETH });
      expect(await contract.tokenToEvent(1)).to.equal(1);
      expect(await contract.tokenToEvent(2)).to.equal(2);
    });

    it("nextTokenId increments correctly across events", async function () {
      await contract.connect(organiser).createEvent("QmA", 10, ONE_ETH, 500);
      await contract.connect(organiser).createEvent("QmB", 10, ONE_ETH, 500);
      await contract.connect(buyer).buyTicket(1, 3, TIER_SILVER, { value: ONE_ETH * 3n });
      await contract.connect(buyer).buyTicket(2, 2, TIER_GOLD, { value: ONE_ETH * 2n });
      expect(await contract.nextTokenId()).to.equal(6);
    });
  });
});
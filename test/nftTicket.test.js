import { expect } from "chai";
import hre from "hardhat";
const { ethers } = hre;

describe("NFTTicket", function () {
  let contract, deployer, organiser, buyer, buyer2;
  const ONE_ETH_GWEI = ethers.parseUnits("1", "gwei"); // price stored in gwei
  const ONE_ETH_WEI = ethers.parseEther("1"); // value sent in transactions

  // Tier enum values matching the Solidity enum Tier { Silver=0, Gold=1, VIP=2 }
  const TIER_SILVER = 0;
  const TIER_GOLD = 1;
  const TIER_VIP = 2;

  // Royalty: 10%
  const ROYALTY_BPS = 10;

  // Helper: default tier setup for tests (all tiers share total supply)
  const defaultTierIds = [TIER_SILVER, TIER_GOLD, TIER_VIP];
  const defaultTierSupplies = [40, 30, 30]; // total = 100

  beforeEach(async function () {
    [deployer, organiser, buyer, buyer2] = await ethers.getSigners();
    const NFTTicket = await ethers.getContractFactory("NFTTicket");
    contract = await NFTTicket.deploy();
  });

  // ─── Event Creation ──────────────────────────────────────────────
  describe("Event Creation", function () {
    it("Creates an event successfully", async function () {
      const tx = await contract
        .connect(organiser)
        .createEvent("QmFakeIpfsHash123", 100, ONE_ETH_GWEI, ROYALTY_BPS, defaultTierIds, defaultTierSupplies);
      const receipt = await tx.wait();
      console.log("  ⛽  createEvent gas:", receipt.gasUsed.toString());

      const evt = await contract.fetchEventData(1);
      expect(evt.maxTickets).to.equal(100);
      expect(evt.priceWei).to.equal(ONE_ETH_GWEI);
      expect(evt.organiser).to.equal(organiser.address);
      expect(evt.royaltyBps).to.equal(ROYALTY_BPS);

      // Per-tier limits were set
      const [silverSold, silverMax] = await contract.getTierData(1, TIER_SILVER);
      expect(silverMax).to.equal(40);
      expect(silverSold).to.equal(0);
    });

    it("Reverts with empty IPFS hash", async function () {
      await expect(
        contract.connect(organiser).createEvent("", 10, ONE_ETH_GWEI, ROYALTY_BPS, [TIER_SILVER], [10])
      ).to.be.revertedWith("IPFS hash cannot be empty");
    });
  });

  // ─── Edit Event ──────────────────────────────────────────────────
  describe("Edit Event", function () {
    beforeEach(async function () {
      await contract
        .connect(organiser)
        .createEvent("QmOriginalHash", 50, ONE_ETH_GWEI, ROYALTY_BPS, [TIER_SILVER, TIER_GOLD], [30, 20]);
    });

    it("Organiser can edit their event", async function () {
      const newPriceGwei = ethers.parseUnits("2", "gwei");
      const tx = await contract
        .connect(organiser)
        .editEvent(1, 100, newPriceGwei, [TIER_SILVER, TIER_GOLD], [60, 40]);
      const receipt = await tx.wait();
      console.log("  ⛽  editEvent gas:", receipt.gasUsed.toString());

      const evt = await contract.fetchEventData(1);
      expect(evt.maxTickets).to.equal(100);
      expect(evt.priceWei).to.equal(newPriceGwei);

      const [, silverMax] = await contract.getTierData(1, TIER_SILVER);
      const [, goldMax] = await contract.getTierData(1, TIER_GOLD);
      expect(silverMax).to.equal(60);
      expect(goldMax).to.equal(40);
    });

    it("Non-organiser cannot edit event", async function () {
      await expect(
        contract.connect(buyer).editEvent(1, 100, ONE_ETH_GWEI, [TIER_SILVER], [100])
      ).to.be.revertedWith("Not the organiser");
    });
  });

  // ─── Ticket Purchase ─────────────────────────────────────────────
  describe("Ticket Purchase", function () {
    beforeEach(async function () {
      await contract
        .connect(organiser)
        .createEvent("QmFakeIpfsHash123", 10, ONE_ETH_GWEI, ROYALTY_BPS, [TIER_SILVER, TIER_GOLD, TIER_VIP], [4, 3, 3]);
    });

    it("Buys a single Silver ticket", async function () {
      const tx = await contract
        .connect(buyer)
        .buyTicket(1, 1, TIER_SILVER, { value: ONE_ETH_WEI });
      const receipt = await tx.wait();
      console.log("  ⛽  buyTicket (1x Silver) gas:", receipt.gasUsed.toString());

      expect(await contract.ownerOf(1)).to.equal(buyer.address);
      expect(await contract.tokenToTier(1)).to.equal(TIER_SILVER);

      const [silverSold] = await contract.getTierData(1, TIER_SILVER);
      expect(silverSold).to.equal(1);
    });

    it("Buys multiple VIP tickets", async function () {
      const qty = 3;
      const tx = await contract
        .connect(buyer)
        .buyTicket(1, qty, TIER_VIP, { value: ONE_ETH_WEI * BigInt(qty) });
      const receipt = await tx.wait();
      console.log("  ⛽  buyTicket (3x VIP) gas:", receipt.gasUsed.toString());

      for (let i = 1; i <= qty; i++) {
        expect(await contract.ownerOf(i)).to.equal(buyer.address);
        expect(await contract.tokenToTier(i)).to.equal(TIER_VIP);
      }

      const [vipSold] = await contract.getTierData(1, TIER_VIP);
      expect(vipSold).to.equal(3);
    });

    it("Buying beyond max tickets reverts", async function () {
      // Buy all 10
      await contract
        .connect(buyer)
        .buyTicket(1, 4, TIER_SILVER, { value: ONE_ETH_WEI * 4n });
      await contract
        .connect(buyer)
        .buyTicket(1, 3, TIER_GOLD, { value: ONE_ETH_WEI * 3n });
      await contract
        .connect(buyer)
        .buyTicket(1, 3, TIER_VIP, { value: ONE_ETH_WEI * 3n });
      // Try to buy one more
      await expect(
        contract
          .connect(buyer2)
          .buyTicket(1, 1, TIER_SILVER, { value: ONE_ETH_WEI })
      ).to.be.revertedWith("Not enough tickets available");
    });

    it("Reverts when a specific tier is sold out", async function () {
      // Silver has max 4 — buy all 4
      await contract
        .connect(buyer)
        .buyTicket(1, 4, TIER_SILVER, { value: ONE_ETH_WEI * 4n });

      // Try to buy one more Silver — should revert with tier error
      await expect(
        contract
          .connect(buyer2)
          .buyTicket(1, 1, TIER_SILVER, { value: ONE_ETH_WEI })
      ).to.be.revertedWith("Tier sold out");
    });

    it("Can still buy other tiers when one tier is maxed", async function () {
      // Max out Silver (4)
      await contract
        .connect(buyer)
        .buyTicket(1, 4, TIER_SILVER, { value: ONE_ETH_WEI * 4n });

      // Gold should still work
      await expect(
        contract
          .connect(buyer2)
          .buyTicket(1, 1, TIER_GOLD, { value: ONE_ETH_WEI })
      ).to.not.be.reverted;
    });

    it("Rejects insufficient ETH", async function () {
      const half = ethers.parseEther("0.5");
      await expect(
        contract.connect(buyer).buyTicket(1, 1, TIER_SILVER, { value: half })
      ).to.be.revertedWith("Incorrect ETH amount");
    });

    it("Accepts overpayment (>=)", async function () {
      const extra = ethers.parseEther("1.5");
      await expect(
        contract.connect(buyer).buyTicket(1, 1, TIER_GOLD, { value: extra })
      ).to.not.be.reverted;
    });
  });

  // ─── Batch Ticket Purchase ────────────────────────────────────────
  describe("Batch Ticket Purchase", function () {
    beforeEach(async function () {
      await contract
        .connect(organiser)
        .createEvent("QmBatchEvent", 50, ONE_ETH_GWEI, ROYALTY_BPS, [TIER_SILVER, TIER_GOLD], [30, 20]);
    });

    it("Buys batch tickets across tiers", async function () {
      // 2 Silver + 1 Gold = 3 tickets
      const tiers = [TIER_SILVER, TIER_GOLD];
      const quantities = [2, 1];
      const totalQty = 3;

      const tx = await contract
        .connect(buyer)
        .buyBatchTickets(1, tiers, quantities, {
          value: ONE_ETH_WEI * BigInt(totalQty),
        });
      const receipt = await tx.wait();
      console.log("  ⛽  buyBatchTickets gas:", receipt.gasUsed.toString());

      // First 2 tokens → Silver, 3rd → Gold
      expect(await contract.tokenToTier(1)).to.equal(TIER_SILVER);
      expect(await contract.tokenToTier(2)).to.equal(TIER_SILVER);
      expect(await contract.tokenToTier(3)).to.equal(TIER_GOLD);

      const [silverSold] = await contract.getTierData(1, TIER_SILVER);
      const [goldSold] = await contract.getTierData(1, TIER_GOLD);
      expect(silverSold).to.equal(2);
      expect(goldSold).to.equal(1);
    });

    it("Batch reverts when a tier is sold out", async function () {
      // Gold has max 20 — try to buy 21 in batch
      await expect(
        contract
          .connect(buyer)
          .buyBatchTickets(1, [TIER_GOLD], [21], { value: ONE_ETH_WEI * 21n })
      ).to.be.revertedWith("Tier sold out");
    });
  });

  // ─── Marketplace & Royalties ──────────────────────────────────────
  describe("Marketplace & Royalties", function () {
    const RESALE_PRICE_GWEI = ONE_ETH_GWEI;
    const RESALE_PRICE_WEI = ONE_ETH_WEI;

    beforeEach(async function () {
      await contract
        .connect(organiser)
        .createEvent("QmConcertHash", 10, ONE_ETH_GWEI, ROYALTY_BPS, [TIER_SILVER], [10]);
      // Buyer purchases 1 Silver ticket  →  tokenId = 1
      await contract
        .connect(buyer)
        .buyTicket(1, 1, TIER_SILVER, { value: ONE_ETH_WEI });
    });

    it("Lists a ticket for resale (gas)", async function () {
      const tx = await contract
        .connect(buyer)
        .listForResale(1, RESALE_PRICE_GWEI);
      const receipt = await tx.wait();
      console.log("  ⛽  listForResale gas:", receipt.gasUsed.toString());

      const listing = await contract.getResaleListing(1);
      expect(listing.active).to.equal(true);
      expect(listing.seller).to.equal(buyer.address);
      expect(listing.priceWei).to.equal(RESALE_PRICE_GWEI);
    });

    it("A non-owner cannot list a ticket for resale", async function () {
      await expect(
        contract.connect(buyer2).listForResale(1, ONE_ETH_GWEI)
      ).to.be.revertedWith("Not the owner");
    });

    it("Buys a resale ticket with correct royalty split (gas)", async function () {
      await contract.connect(buyer).listForResale(1, RESALE_PRICE_GWEI);

      const orgBefore = await ethers.provider.getBalance(organiser.address);
      const sellerBefore = await ethers.provider.getBalance(buyer.address);

      const tx = await contract
        .connect(buyer2)
        .buyResaleTicket(1, { value: RESALE_PRICE_WEI });
      const receipt = await tx.wait();
      console.log("  ⛽  buyResaleTicket gas:", receipt.gasUsed.toString());

      const orgAfter = await ethers.provider.getBalance(organiser.address);
      const sellerAfter = await ethers.provider.getBalance(buyer.address);

      // 10% of 1 ETH = 0.1 ETH royalty
      const expectedRoyalty = ethers.parseEther("0.1");
      const expectedSellerProceeds = ethers.parseEther("0.9");

      expect(orgAfter - orgBefore).to.equal(expectedRoyalty);
      expect(sellerAfter - sellerBefore).to.equal(expectedSellerProceeds);
    });

    it("ERC-721 ownerOf updates correctly after resale", async function () {
      await contract.connect(buyer).listForResale(1, RESALE_PRICE_GWEI);
      await contract
        .connect(buyer2)
        .buyResaleTicket(1, { value: RESALE_PRICE_WEI });
      expect(await contract.ownerOf(1)).to.equal(buyer2.address);
    });

    it("ERC-2981 royaltyInfo returns expected values", async function () {
      const [receiver, amount] = await contract.royaltyInfo(1, ONE_ETH_WEI);
      expect(receiver).to.equal(organiser.address);
      // 10% → 0.1 ETH
      expect(amount).to.equal(ethers.parseEther("0.1"));
    });

    it("Cancels a resale listing (gas)", async function () {
      await contract.connect(buyer).listForResale(1, ONE_ETH_GWEI);
      const tx = await contract.connect(buyer).cancelResaleListing(1);
      const receipt = await tx.wait();
      console.log(
        "  ⛽  cancelResaleListing gas:",
        receipt.gasUsed.toString()
      );
    });

    it("A cancelled listing cannot be purchased", async function () {
      await contract.connect(buyer).listForResale(1, ONE_ETH_GWEI);
      await contract.connect(buyer).cancelResaleListing(1);
      await expect(
        contract.connect(buyer2).buyResaleTicket(1, { value: ONE_ETH_WEI })
      ).to.be.revertedWith("Not for sale");
    });

    it("Resale buyer can relist at higher price", async function () {
      // buyer lists → buyer2 buys → buyer2 relists
      await contract.connect(buyer).listForResale(1, RESALE_PRICE_GWEI);
      await contract
        .connect(buyer2)
        .buyResaleTicket(1, { value: RESALE_PRICE_WEI });

      const higherPriceGwei = ethers.parseUnits("2", "gwei");
      await contract.connect(buyer2).listForResale(1, higherPriceGwei);

      const listing = await contract.getResaleListing(1);
      expect(listing.active).to.equal(true);
      expect(listing.seller).to.equal(buyer2.address);
      expect(listing.priceWei).to.equal(higherPriceGwei);
    });
  });
});
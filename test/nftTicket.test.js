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

  // Royalty: 1000 bps = 10 %  (royaltyBps is uint96, so this is fine)
  const ROYALTY_BPS = 10;

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
        .createEvent("QmFakeIpfsHash123", 100, ONE_ETH_GWEI, ROYALTY_BPS);
      const receipt = await tx.wait();
      console.log("  ⛽  createEvent gas:", receipt.gasUsed.toString());

      const evt = await contract.fetchEventData(1);
      expect(evt.maxTickets).to.equal(100);
      expect(evt.priceWei).to.equal(ONE_ETH_GWEI);
      expect(evt.organiser).to.equal(organiser.address);
      expect(evt.royaltyBps).to.equal(ROYALTY_BPS);

    });

    it("Reverts with empty IPFS hash", async function () {
      await expect(
        contract.connect(organiser).createEvent("", 10, ONE_ETH_GWEI, ROYALTY_BPS)
      ).to.be.revertedWith("IPFS hash cannot be empty");
    });
  });

  // ─── Edit Event ──────────────────────────────────────────────────
  describe("Edit Event", function () {
    beforeEach(async function () {
      await contract
        .connect(organiser)
        .createEvent("QmOriginalHash", 50, ONE_ETH_GWEI, ROYALTY_BPS);
    });

    it("Organiser can edit their event", async function () {
      const newPriceGwei = ethers.parseUnits("2", "gwei");
      const tx = await contract
        .connect(organiser)
        .editEvent(1, 100, newPriceGwei);
      const receipt = await tx.wait();
      console.log("  ⛽  editEvent gas:", receipt.gasUsed.toString());

      const evt = await contract.fetchEventData(1);
      expect(evt.maxTickets).to.equal(100);
      expect(evt.priceWei).to.equal(newPriceGwei);
    });

    it("Non-organiser cannot edit event", async function () {
      await expect(
        contract.connect(buyer).editEvent(1, 100, ONE_ETH_GWEI)
      ).to.be.revertedWith("Not the organiser");
    });
  });

  // ─── Ticket Purchase ─────────────────────────────────────────────
  describe("Ticket Purchase", function () {
    beforeEach(async function () {
      await contract
        .connect(organiser)
        .createEvent("QmFakeIpfsHash123", 10, ONE_ETH_GWEI, ROYALTY_BPS);
    });

    it("Buys a single Silver ticket", async function () {
      const tx = await contract
        .connect(buyer)
        .buyTicket(1, 1, TIER_SILVER, { value: ONE_ETH_WEI });
      const receipt = await tx.wait();
      console.log("  ⛽  buyTicket (1x Silver) gas:", receipt.gasUsed.toString());

      expect(await contract.ownerOf(1)).to.equal(buyer.address);
      expect(await contract.tokenToTier(1)).to.equal(TIER_SILVER);
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
    });

    it("Buying beyond max tickets reverts", async function () {
      // Buy all 10
      await contract
        .connect(buyer)
        .buyTicket(1, 10, TIER_SILVER, { value: ONE_ETH_WEI * 10n });
      // Try to buy one more
      await expect(
        contract
          .connect(buyer2)
          .buyTicket(1, 1, TIER_SILVER, { value: ONE_ETH_WEI })
      ).to.be.revertedWith("Not enough tickets available");
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
        .createEvent("QmBatchEvent", 50, ONE_ETH_GWEI, ROYALTY_BPS);
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
    });
  });

  // ─── Marketplace & Royalties ──────────────────────────────────────
  describe("Marketplace & Royalties", function () {
    const RESALE_PRICE_GWEI = ONE_ETH_GWEI;
    const RESALE_PRICE_WEI = ONE_ETH_WEI;

    beforeEach(async function () {
      await contract
        .connect(organiser)
        .createEvent("QmConcertHash", 10, ONE_ETH_GWEI, ROYALTY_BPS);
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
import { expect } from "chai";
import hre from "hardhat";
const { ethers } = hre;

describe("NFTTicket", function () {
  let contract, deployer, organiser, buyer, buyer2, buyer3;
  const P1_WEI  = ethers.parseEther("0.1");
  const P2_WEI  = ethers.parseEther("0.2");
  const HALF_WEI  = ethers.parseEther("0.05");

  const S = 0, G = 1, V = 2; // Silver, Gold, VIP
  const ROY = 10; // 10% royalty

  beforeEach(async function () {
    [deployer, organiser, buyer, buyer2, buyer3] = await ethers.getSigners();
    const F = await ethers.getContractFactory("NFTTicket");
    contract = await F.deploy();
  });

  // ─── 1. Event Creation ─────────────────────────────────
  describe("Event Creation", function () {
    it("Creates event with 3 tiers", async function () {
      const tx = await contract.connect(organiser).createEvent("QmHash1", 100, P1_WEI, ROY, [S,G,V], [40,30,30]);
      const r = await tx.wait();
      const e = await contract.fetchEventData(1);
      expect(e.maxTickets).to.equal(100);
      expect(e.organiser).to.equal(organiser.address);
    });

    it("Reverts with 4 tiers", async function () {
      await expect(
        contract.connect(organiser).createEvent("QmHash", 100, P1_WEI, ROY, [0,1,2,3], [25,25,25,25])
      ).to.be.revertedWith("Max 3 tiers allowed");
    });

    it("Reverts empty IPFS hash", async function () {
      await expect(contract.connect(organiser).createEvent("", 10, P1_WEI, ROY, [S], [10])).to.be.revertedWith("IPFS hash required");
    });

    it("Reverts zero tickets", async function () {
      await expect(contract.connect(organiser).createEvent("QmX", 0, P1_WEI, ROY, [], [])).to.be.revertedWith("Must have tickets");
    });

    it("Reverts zero price", async function () {
      await expect(contract.connect(organiser).createEvent("QmX", 10, 0, ROY, [S], [10])).to.be.revertedWith("Price must be > 0");
    });

    it("Reverts royalty > 100", async function () {
      await expect(contract.connect(organiser).createEvent("QmX", 10, P1_WEI, 101, [S], [10])).to.be.revertedWith("Royalty <= 100%");
    });
  });

  // ─── 2. Edit Event ─────────────────────────────────────
  describe("Edit Event", function () {
    beforeEach(async function () {
      await contract.connect(organiser).createEvent("QmEdit", 50, P1_WEI, ROY, [S,G], [30,20]);
    });

    it("Edits price and supply", async function () {
      await contract.connect(organiser).editEvent(1, 100, P2_WEI, [S,G], [60,40]);
      const e = await contract.fetchEventData(1);
      expect(e.maxTickets).to.equal(100);
      expect(e.priceWei).to.equal(P2_WEI);
    });

    it("Non-organiser cannot edit", async function () {
      await expect(contract.connect(buyer).editEvent(1, 100, P1_WEI, [S], [100])).to.be.revertedWithCustomError(contract, "NotEventOrganiser");
    });

    it("Reverts with 4 tiers on edit", async function () {
      await expect(
        contract.connect(organiser).editEvent(1, 100, P1_WEI, [0,1,2,3], [25,25,25,25])
      ).to.be.revertedWith("Max 3 tiers allowed");
    });
  });

  // ─── 3. Ticket Purchase ────────────────────────
  describe("Ticket Purchase", function () {
    beforeEach(async function () {
      await contract.connect(organiser).createEvent("QmBuy", 30, P1_WEI, ROY, [S,G,V], [10,10,10]);
    });

    it("Buy 10x Gold (limit hit)", async function () {
      await expect(contract.connect(buyer).buyTicket(1, 10, G, { value: P1_WEI * 10n })).to.not.be.reverted;
    });

    it("Reverts when buying more than 10 tickets", async function () {
      await expect(
        contract.connect(buyer).buyTicket(1, 11, S, { value: P1_WEI * 11n })
      ).to.be.revertedWith("Invalid quantity");
    });

    it("Reverts batch when totalQuantity > 10", async function () {
      await expect(
        contract.connect(buyer).buyBatchTickets(1, [S, G], [6, 5], { value: P1_WEI * 11n })
      ).to.be.revertedWith("Invalid quantity");
    });

    it("Batch 5S+5G (limit hit)", async function () {
      await expect(
        contract.connect(buyer).buyBatchTickets(1, [S, G], [5, 5], { value: P1_WEI * 10n })
      ).to.not.be.reverted;
    });

    it("Insufficient payment reverts", async function () {
      await expect(contract.connect(buyer).buyTicket(1, 1, S, { value: HALF_WEI })).to.be.revertedWith("Insufficient payment");
    });
  });

  // ─── 4. Resale & Access Control ────────────────────────
  describe("Resale & Access", function () {
    beforeEach(async function () {
      await contract.connect(organiser).createEvent("QmResale", 20, P1_WEI, ROY, [S,G], [10,10]);
      await contract.connect(buyer).buyTicket(1, 1, S, { value: P1_WEI });
    });

    it("Enforces dynamic resale cap", async function () {
      const base = await contract.getTokenPurchasePrice(1);
      const max = base + (base * (BigInt(ROY) + 10n)) / 100n;
      
      await expect(
        contract.connect(buyer).listForResale(1, max + 1n)
      ).to.be.revertedWith("Price exceeds cap");
      
      await expect(
        contract.connect(buyer).listForResale(1, max)
      ).to.not.be.reverted;
    });

    it("Organiser can add and remove scanners", async function () {
      await contract.connect(organiser).addScanner(1, buyer2.address);
      expect(await contract.eventScanners(1, buyer2.address)).to.be.true;
      
      await contract.connect(organiser).removeScanner(1, buyer2.address);
      expect(await contract.eventScanners(1, buyer2.address)).to.be.false;
    });

    it("Scanner can validate ticket entry", async function () {
      await contract.connect(organiser).addScanner(1, buyer2.address);
      await expect(contract.connect(buyer2).validateTicketEntry(1)).to.not.be.reverted;
    });

    it("Non-authorized cannot validate ticket", async function () {
      await expect(
        contract.connect(buyer3).validateTicketEntry(1)
      ).to.be.revertedWith("Not authorized");
    });

    it("Organiser can validate ticket", async function () {
      await expect(contract.connect(organiser).validateTicketEntry(1)).to.not.be.reverted;
    });
  });

  // ─── 5. Marketplace ────────────────────────
  describe("Marketplace", function () {
    beforeEach(async function () {
      await contract.connect(organiser).createEvent("QmMarket", 20, P1_WEI, ROY, [S], [10]);
      await contract.connect(buyer).buyTicket(1, 1, S, { value: P1_WEI });
    });

    it("Ownership transfers on resale", async function () {
      await contract.connect(buyer).listForResale(1, P1_WEI);
      await contract.connect(buyer2).buyResaleTicket(1, { value: P1_WEI });
      expect(await contract.ownerOf(1)).to.equal(buyer2.address);
    });

    it("ERC-2981 royaltyInfo", async function () {
      const [recv, amt] = await contract.royaltyInfo(1, P1_WEI);
      expect(recv).to.equal(organiser.address);
      expect(amt).to.equal(ethers.parseEther("0.01"));
    });
  });
});
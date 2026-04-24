import { expect } from "chai";
import hre from "hardhat";
const { ethers } = hre;

describe("NFTTicket", function () {
  let contract, deployer, organiser, buyer, buyer2, buyer3;
  const P1_GWEI = ethers.parseUnits("1", "gwei");
  const P1_WEI  = ethers.parseEther("1");
  const P2_GWEI = ethers.parseUnits("2", "gwei");
  const P2_WEI  = ethers.parseEther("2");
  const HALF_GWEI = ethers.parseUnits("0.5", "gwei");
  const HALF_WEI  = ethers.parseEther("0.5");

  const S = 0, G = 1, V = 2; // Silver, Gold, VIP
  const ROY = 10; // 10% royalty

  beforeEach(async function () {
    [deployer, organiser, buyer, buyer2, buyer3] = await ethers.getSigners();
    const F = await ethers.getContractFactory("NFTTicket");
    contract = await F.deploy();
  });

  // ─── 1. Event Creation (8 tests) ─────────────────────────────────
  describe("Event Creation", function () {
    it("1. Creates event with 3 tiers", async function () {
      const tx = await contract.connect(organiser).createEvent("QmHash1", 100, P1_GWEI, ROY, [S,G,V], [40,30,30]);
      const r = await tx.wait();
      console.log("  ⛽ createEvent(3 tiers):", r.gasUsed.toString());
      const e = await contract.fetchEventData(1);
      expect(e.maxTickets).to.equal(100);
      expect(e.organiser).to.equal(organiser.address);
    });

    it("2. Creates event with 1 tier", async function () {
      const tx = await contract.connect(organiser).createEvent("QmHash2", 50, P2_GWEI, 5, [S], [50]);
      const r = await tx.wait();
      console.log("  ⛽ createEvent(1 tier):", r.gasUsed.toString());
    });

    it("3. Creates event with 0% royalty", async function () {
      const tx = await contract.connect(organiser).createEvent("QmHash3", 20, P1_GWEI, 0, [S,G], [10,10]);
      const r = await tx.wait();
      console.log("  ⛽ createEvent(0% royalty):", r.gasUsed.toString());
    });

    it("4. Creates event with 100% royalty", async function () {
      await expect(contract.connect(organiser).createEvent("QmHash4", 10, P1_GWEI, 100, [S], [10])).to.not.be.reverted;
    });

    it("5. Reverts empty IPFS hash", async function () {
      await expect(contract.connect(organiser).createEvent("", 10, P1_GWEI, ROY, [S], [10])).to.be.revertedWith("IPFS hash cannot be empty");
    });

    it("6. Reverts zero tickets", async function () {
      await expect(contract.connect(organiser).createEvent("QmX", 0, P1_GWEI, ROY, [], [])).to.be.revertedWith("Must have tickets");
    });

    it("7. Reverts zero price", async function () {
      await expect(contract.connect(organiser).createEvent("QmX", 10, 0, ROY, [S], [10])).to.be.revertedWith("Price must be greater than zero");
    });

    it("8. Reverts royalty > 100", async function () {
      await expect(contract.connect(organiser).createEvent("QmX", 10, P1_GWEI, 101, [S], [10])).to.be.revertedWith("Royalty cannot exceed 100%");
    });
  });

  // ─── 2. Edit Event (7 tests) ─────────────────────────────────────
  describe("Edit Event", function () {
    beforeEach(async function () {
      await contract.connect(organiser).createEvent("QmEdit", 50, P1_GWEI, ROY, [S,G], [30,20]);
    });

    it("9. Edits price and supply", async function () {
      const tx = await contract.connect(organiser).editEvent(1, 100, P2_GWEI, [S,G], [60,40]);
      const r = await tx.wait();
      console.log("  ⛽ editEvent(price+supply):", r.gasUsed.toString());
      const e = await contract.fetchEventData(1);
      expect(e.maxTickets).to.equal(100);
      expect(e.priceWei).to.equal(P2_GWEI);
    });

    it("10. Edits only price", async function () {
      const tx = await contract.connect(organiser).editEvent(1, 50, P2_GWEI, [S,G], [30,20]);
      const r = await tx.wait();
      console.log("  ⛽ editEvent(price only):", r.gasUsed.toString());
    });

    it("11. Edits only supply", async function () {
      const tx = await contract.connect(organiser).editEvent(1, 80, P1_GWEI, [S,G], [50,30]);
      const r = await tx.wait();
      console.log("  ⛽ editEvent(supply only):", r.gasUsed.toString());
    });

    it("12. Non-organiser cannot edit", async function () {
      await expect(contract.connect(buyer).editEvent(1, 100, P1_GWEI, [S], [100])).to.be.revertedWith("Not the organiser");
    });

    it("13. Cannot reduce below sold", async function () {
      await contract.connect(buyer).buyTicket(1, 5, S, { value: P1_WEI * 5n });
      await expect(contract.connect(organiser).editEvent(1, 3, P1_GWEI, [S], [3])).to.be.revertedWith("Cannot reduce max below sold");
    });

    it("14. Cannot reduce tier below tier-sold", async function () {
      await contract.connect(buyer).buyTicket(1, 10, S, { value: P1_WEI * 10n });
      await expect(contract.connect(organiser).editEvent(1, 50, P1_GWEI, [S,G], [5,20])).to.be.revertedWith("Cannot reduce tier below sold");
    });

    it("15. Reverts zero price edit", async function () {
      await expect(contract.connect(organiser).editEvent(1, 50, 0, [S], [50])).to.be.revertedWith("Price must be > 0");
    });
  });

  // ─── 3. Single Ticket Purchase (10 tests) ────────────────────────
  describe("Ticket Purchase", function () {
    beforeEach(async function () {
      await contract.connect(organiser).createEvent("QmBuy", 30, P1_GWEI, ROY, [S,G,V], [10,10,10]);
    });

    it("16. Buy 1x Silver", async function () {
      const tx = await contract.connect(buyer).buyTicket(1, 1, S, { value: P1_WEI });
      const r = await tx.wait();
      console.log("  ⛽ buyTicket(1x Silver):", r.gasUsed.toString());
      expect(await contract.ownerOf(1)).to.equal(buyer.address);
      expect(await contract.tokenToTier(1)).to.equal(S);
    });

    it("17. Buy 1x Gold", async function () {
      const tx = await contract.connect(buyer).buyTicket(1, 1, G, { value: P1_WEI });
      const r = await tx.wait();
      console.log("  ⛽ buyTicket(1x Gold):", r.gasUsed.toString());
    });

    it("18. Buy 1x VIP", async function () {
      const tx = await contract.connect(buyer).buyTicket(1, 1, V, { value: P1_WEI });
      const r = await tx.wait();
      console.log("  ⛽ buyTicket(1x VIP):", r.gasUsed.toString());
    });

    it("19. Buy 3x VIP", async function () {
      const tx = await contract.connect(buyer).buyTicket(1, 3, V, { value: P1_WEI * 3n });
      const r = await tx.wait();
      console.log("  ⛽ buyTicket(3x VIP):", r.gasUsed.toString());
      const [sold] = await contract.getTierData(1, V);
      expect(sold).to.equal(3);
    });

    it("20. Buy 5x Silver", async function () {
      const tx = await contract.connect(buyer).buyTicket(1, 5, S, { value: P1_WEI * 5n });
      const r = await tx.wait();
      console.log("  ⛽ buyTicket(5x Silver):", r.gasUsed.toString());
    });

    it("21. Buy 10x Gold (full tier)", async function () {
      const tx = await contract.connect(buyer).buyTicket(1, 10, G, { value: P1_WEI * 10n });
      const r = await tx.wait();
      console.log("  ⛽ buyTicket(10x Gold):", r.gasUsed.toString());
    });

    it("22. Tier sold out reverts", async function () {
      await contract.connect(buyer).buyTicket(1, 10, S, { value: P1_WEI * 10n });
      await expect(contract.connect(buyer2).buyTicket(1, 1, S, { value: P1_WEI })).to.be.revertedWith("Tier sold out");
    });

    it("23. Other tiers work when one maxed", async function () {
      await contract.connect(buyer).buyTicket(1, 10, S, { value: P1_WEI * 10n });
      await expect(contract.connect(buyer2).buyTicket(1, 1, G, { value: P1_WEI })).to.not.be.reverted;
    });

    it("24. Insufficient ETH reverts", async function () {
      await expect(contract.connect(buyer).buyTicket(1, 1, S, { value: HALF_WEI })).to.be.revertedWith("Incorrect ETH amount");
    });

    it("25. Overpayment accepted", async function () {
      await expect(contract.connect(buyer).buyTicket(1, 1, G, { value: P2_WEI })).to.not.be.reverted;
    });
  });

  // ─── 4. Purchase Price Tracking (4 tests) ────────────────────────
  describe("Purchase Price Tracking", function () {
    beforeEach(async function () {
      await contract.connect(organiser).createEvent("QmPrice", 20, P1_GWEI, ROY, [S,G], [10,10]);
    });

    it("26. tokenPurchasePrice reflects actual ETH paid", async function () {
      await contract.connect(buyer).buyTicket(1, 1, S, { value: P1_WEI });
      const price = await contract.getTokenPurchasePrice(1);
      expect(price).to.equal(P1_GWEI);
    });

    it("27. Overpayment stored correctly", async function () {
      await contract.connect(buyer).buyTicket(1, 1, S, { value: P2_WEI });
      const price = await contract.getTokenPurchasePrice(1);
      expect(price).to.equal(P2_GWEI);
    });

    it("28. Multi-buy stores per-ticket price", async function () {
      await contract.connect(buyer).buyTicket(1, 3, G, { value: P1_WEI * 3n });
      for (let i = 1; i <= 3; i++) {
        expect(await contract.getTokenPurchasePrice(i)).to.equal(P1_GWEI);
      }
    });

    it("29. Resale updates purchase price", async function () {
      await contract.connect(buyer).buyTicket(1, 1, S, { value: P1_WEI });
      await contract.connect(buyer).listForResale(1, P2_GWEI);
      await contract.connect(buyer2).buyResaleTicket(1, { value: P2_WEI });
      expect(await contract.getTokenPurchasePrice(1)).to.equal(P2_GWEI);
    });
  });

  // ─── 5. Batch Ticket Purchase (6 tests) ──────────────────────────
  describe("Batch Purchase", function () {
    beforeEach(async function () {
      await contract.connect(organiser).createEvent("QmBatch", 60, P1_GWEI, ROY, [S,G,V], [20,20,20]);
    });

    it("30. Batch 2S+1G", async function () {
      const tx = await contract.connect(buyer).buyBatchTickets(1, [S,G], [2,1], [P1_GWEI,P1_GWEI], { value: P1_WEI * 3n });
      const r = await tx.wait();
      console.log("  ⛽ buyBatch(2S+1G):", r.gasUsed.toString());
      expect(await contract.tokenToTier(1)).to.equal(S);
      expect(await contract.tokenToTier(3)).to.equal(G);
    });

    it("31. Batch 3S+3G+3V", async function () {
      const tx = await contract.connect(buyer).buyBatchTickets(1, [S,G,V], [3,3,3], [P1_GWEI,P1_GWEI,P1_GWEI], { value: P1_WEI * 9n });
      const r = await tx.wait();
      console.log("  ⛽ buyBatch(3+3+3):", r.gasUsed.toString());
    });

    it("32. Batch 5S+5G", async function () {
      const tx = await contract.connect(buyer).buyBatchTickets(1, [S,G], [5,5], [P1_GWEI,P1_GWEI], { value: P1_WEI * 10n });
      const r = await tx.wait();
      console.log("  ⛽ buyBatch(5+5):", r.gasUsed.toString());
    });

    it("33. Batch stores per-tier prices", async function () {
      await contract.connect(buyer).buyBatchTickets(1, [S,G], [1,1], [P1_GWEI,P2_GWEI], { value: P1_WEI + P2_WEI });
      expect(await contract.getTokenPurchasePrice(1)).to.equal(P1_GWEI);
      expect(await contract.getTokenPurchasePrice(2)).to.equal(P2_GWEI);
    });

    it("34. Batch tier sold out reverts", async function () {
      await expect(
        contract.connect(buyer).buyBatchTickets(1, [G], [21], [P1_GWEI], { value: P1_WEI * 21n })
      ).to.be.revertedWith("Tier sold out");
    });

    it("35. Batch mismatched arrays reverts", async function () {
      await expect(
        contract.connect(buyer).buyBatchTickets(1, [S,G], [1], [P1_GWEI], { value: P1_WEI })
      ).to.be.revertedWith("Mismatched input arrays");
    });
  });

  // ─── 6. Per-Tier Data (4 tests) ──────────────────────────────────
  describe("Per-Tier Data", function () {
    beforeEach(async function () {
      await contract.connect(organiser).createEvent("QmTier", 30, P1_GWEI, ROY, [S,G,V], [10,10,10]);
    });

    it("36. getTierData returns correct initial state", async function () {
      const [sold, max] = await contract.getTierData(1, S);
      expect(sold).to.equal(0);
      expect(max).to.equal(10);
    });

    it("37. getTierData updates after purchase", async function () {
      await contract.connect(buyer).buyTicket(1, 3, G, { value: P1_WEI * 3n });
      const [sold, max] = await contract.getTierData(1, G);
      expect(sold).to.equal(3);
      expect(max).to.equal(10);
    });

    it("38. getTierData independent across tiers", async function () {
      await contract.connect(buyer).buyTicket(1, 5, V, { value: P1_WEI * 5n });
      const [sSold] = await contract.getTierData(1, S);
      const [vSold] = await contract.getTierData(1, V);
      expect(sSold).to.equal(0);
      expect(vSold).to.equal(5);
    });

    it("39. getTierData updates after edit", async function () {
      await contract.connect(organiser).editEvent(1, 50, P1_GWEI, [S,G,V], [20,15,15]);
      const [, sMax] = await contract.getTierData(1, S);
      const [, gMax] = await contract.getTierData(1, G);
      expect(sMax).to.equal(20);
      expect(gMax).to.equal(15);
    });
  });

  // ─── 7. Marketplace & Royalties (14 tests) ───────────────────────
  describe("Marketplace & Royalties", function () {
    beforeEach(async function () {
      await contract.connect(organiser).createEvent("QmMarket", 20, P1_GWEI, ROY, [S,G], [10,10]);
      await contract.connect(buyer).buyTicket(1, 1, S, { value: P1_WEI });
    });

    it("40. List for resale", async function () {
      const tx = await contract.connect(buyer).listForResale(1, P1_GWEI);
      const r = await tx.wait();
      console.log("  ⛽ listForResale:", r.gasUsed.toString());
      const l = await contract.getResaleListing(1);
      expect(l.active).to.equal(true);
    });

    it("41. Non-owner cannot list", async function () {
      await expect(contract.connect(buyer2).listForResale(1, P1_GWEI)).to.be.revertedWith("Not the owner");
    });

    it("42. Buy resale with royalty", async function () {
      await contract.connect(buyer).listForResale(1, P1_GWEI);
      const orgBefore = await ethers.provider.getBalance(organiser.address);
      const selBefore = await ethers.provider.getBalance(buyer.address);
      const tx = await contract.connect(buyer2).buyResaleTicket(1, { value: P1_WEI });
      const r = await tx.wait();
      console.log("  ⛽ buyResaleTicket:", r.gasUsed.toString());
      const orgAfter = await ethers.provider.getBalance(organiser.address);
      const selAfter = await ethers.provider.getBalance(buyer.address);
      expect(orgAfter - orgBefore).to.equal(ethers.parseEther("0.1"));
      expect(selAfter - selBefore).to.equal(ethers.parseEther("0.9"));
    });

    it("43. Ownership transfers on resale", async function () {
      await contract.connect(buyer).listForResale(1, P1_GWEI);
      await contract.connect(buyer2).buyResaleTicket(1, { value: P1_WEI });
      expect(await contract.ownerOf(1)).to.equal(buyer2.address);
    });

    it("44. ERC-2981 royaltyInfo", async function () {
      const [recv, amt] = await contract.royaltyInfo(1, P1_WEI);
      expect(recv).to.equal(organiser.address);
      expect(amt).to.equal(ethers.parseEther("0.1"));
    });

    it("45. Cancel listing", async function () {
      await contract.connect(buyer).listForResale(1, P1_GWEI);
      const tx = await contract.connect(buyer).cancelResaleListing(1);
      const r = await tx.wait();
      console.log("  ⛽ cancelResaleListing:", r.gasUsed.toString());
    });

    it("46. Cancelled listing cannot be bought", async function () {
      await contract.connect(buyer).listForResale(1, P1_GWEI);
      await contract.connect(buyer).cancelResaleListing(1);
      await expect(contract.connect(buyer2).buyResaleTicket(1, { value: P1_WEI })).to.be.revertedWith("Not for sale");
    });

    it("47. Relist at higher price", async function () {
      await contract.connect(buyer).listForResale(1, P1_GWEI);
      await contract.connect(buyer2).buyResaleTicket(1, { value: P1_WEI });
      const tx = await contract.connect(buyer2).listForResale(1, P2_GWEI);
      const r = await tx.wait();
      console.log("  ⛽ listForResale(relist):", r.gasUsed.toString());
      const l = await contract.getResaleListing(1);
      expect(l.priceWei).to.equal(P2_GWEI);
    });

    it("48. Buy relisted ticket at higher price", async function () {
      await contract.connect(buyer).listForResale(1, P1_GWEI);
      await contract.connect(buyer2).buyResaleTicket(1, { value: P1_WEI });
      await contract.connect(buyer2).listForResale(1, P2_GWEI);
      const tx = await contract.connect(buyer3).buyResaleTicket(1, { value: P2_WEI });
      const r = await tx.wait();
      console.log("  ⛽ buyResaleTicket(2nd):", r.gasUsed.toString());
      expect(await contract.ownerOf(1)).to.equal(buyer3.address);
    });

    it("49. List at lower price", async function () {
      await contract.connect(buyer).listForResale(1, HALF_GWEI);
      const l = await contract.getResaleListing(1);
      expect(l.priceWei).to.equal(HALF_GWEI);
    });

    it("50. Wrong resale price reverts", async function () {
      await contract.connect(buyer).listForResale(1, P2_GWEI);
      await expect(contract.connect(buyer2).buyResaleTicket(1, { value: P1_WEI })).to.be.revertedWith("Incorrect ETH amount");
    });

    it("51. Organiser cannot buy own resale", async function () {
      await contract.connect(buyer).listForResale(1, P1_GWEI);
      await expect(contract.connect(organiser).buyResaleTicket(1, { value: P1_WEI })).to.be.revertedWith("Organiser cannot buy their own tickets");
    });

    it("52. Non-seller cannot cancel", async function () {
      await contract.connect(buyer).listForResale(1, P1_GWEI);
      await expect(contract.connect(buyer2).cancelResaleListing(1)).to.be.revertedWith("Not the seller");
    });

    it("53. Organiser cannot buy own ticket", async function () {
      await expect(contract.connect(organiser).buyTicket(1, 1, S, { value: P1_WEI })).to.be.revertedWith("Organiser cannot buy their own tickets");
    });
  });

  // ─── 8. Multi-Event Scenarios (5 tests) ──────────────────────────
  describe("Multi-Event", function () {
    it("54. Create 3 events", async function () {
      const tx1 = await contract.connect(organiser).createEvent("QmA", 50, P1_GWEI, ROY, [S,G], [30,20]);
      const tx2 = await contract.connect(organiser).createEvent("QmB", 30, P2_GWEI, 5, [S], [30]);
      const tx3 = await contract.connect(buyer).createEvent("QmC", 20, P1_GWEI, 0, [S,V], [10,10]);
      const [r1, r2, r3] = await Promise.all([tx1.wait(), tx2.wait(), tx3.wait()]);
      console.log("  ⛽ createEvent x3:", r1.gasUsed.toString(), r2.gasUsed.toString(), r3.gasUsed.toString());
      expect(await contract.nextEventId()).to.equal(4);
    });

    it("55. Buy across events", async function () {
      await contract.connect(organiser).createEvent("QmE1", 10, P1_GWEI, ROY, [S], [10]);
      await contract.connect(organiser).createEvent("QmE2", 10, P2_GWEI, ROY, [G], [10]);
      await contract.connect(buyer).buyTicket(1, 1, S, { value: P1_WEI });
      await contract.connect(buyer).buyTicket(2, 1, G, { value: P2_WEI });
      expect(await contract.tokenToEvent(1)).to.equal(1);
      expect(await contract.tokenToEvent(2)).to.equal(2);
    });

    it("56. Tier data isolated between events", async function () {
      await contract.connect(organiser).createEvent("QmI1", 10, P1_GWEI, ROY, [S], [10]);
      await contract.connect(organiser).createEvent("QmI2", 10, P1_GWEI, ROY, [S], [10]);
      await contract.connect(buyer).buyTicket(1, 5, S, { value: P1_WEI * 5n });
      const [sold1] = await contract.getTierData(1, S);
      const [sold2] = await contract.getTierData(2, S);
      expect(sold1).to.equal(5);
      expect(sold2).to.equal(0);
    });

    it("57. Edit non-existent event reverts", async function () {
      await expect(contract.connect(organiser).editEvent(99, 10, P1_GWEI, [S], [10])).to.be.revertedWith("Event does not exist");
    });

    it("58. Buy non-existent event reverts", async function () {
      await expect(contract.connect(buyer).buyTicket(99, 1, S, { value: P1_WEI })).to.be.revertedWith("Event does not exist");
    });
  });

  // ─── 9. ERC-165 & Standards (2 tests) ────────────────────────────
  describe("Standards", function () {
    it("59. Supports ERC-2981 interface", async function () {
      const ERC2981_ID = "0x2a55205a";
      expect(await contract.supportsInterface(ERC2981_ID)).to.equal(true);
    });

    it("60. Supports ERC-721 interface", async function () {
      const ERC721_ID = "0x80ac58cd";
      expect(await contract.supportsInterface(ERC721_ID)).to.equal(true);
    });
  });
});
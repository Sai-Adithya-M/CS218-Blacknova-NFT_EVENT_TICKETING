import { expect } from "chai";
import hre from "hardhat";
const { ethers } = hre;

describe("NFTTicket Multi-Tier", function () {
  let contract, deployer, organiser, buyer, buyer2, buyer3;
  const P1_WEI = ethers.parseEther("0.1");
  const P2_WEI = ethers.parseEther("0.2");
  const VIP_WEI = ethers.parseEther("0.5");
  const ROY = 10; // 10% royalty

  beforeEach(async function () {
    [deployer, organiser, buyer, buyer2, buyer3] = await ethers.getSigners();
    const F = await ethers.getContractFactory("NFTTicket");
    contract = await F.deploy();
  });

  describe("Event Creation & Multi-Tier Setup", function () {
    it("Creates an event with 3 independent tiers", async function () {
      const prices = [P1_WEI, P2_WEI, VIP_WEI];
      const supplies = [100, 50, 10];
      
      await contract.connect(organiser).createEvent("QmHash1", ROY, prices, supplies);
      
      const tiers = await contract.getTiers(1);
      expect(tiers.length).to.equal(3);
      expect(tiers[0].price).to.equal(P1_WEI);
      expect(tiers[2].maxSupply).to.equal(10);
      
      const eventData = await contract.fetchEventData(1);
      expect(eventData.organiser).to.equal(organiser.address);
      expect(eventData.royaltyBps).to.equal(ROY);
    });

    it("Reverts if price and supply array lengths mismatch", async function () {
      await expect(
        contract.connect(organiser).createEvent("QmErr", ROY, [P1_WEI], [10, 20])
      ).to.be.revertedWith("Tier mismatch");
    });

    it("Reverts with zero tiers", async function () {
      await expect(
        contract.connect(organiser).createEvent("QmEmpty", ROY, [], [])
      ).to.be.revertedWith("At least one tier required");
    });
  });

  describe("Ticket Purchasing (Multi-Tier)", function () {
    beforeEach(async function () {
      await contract.connect(organiser).createEvent("QmBuy", ROY, [P1_WEI, VIP_WEI], [10, 2]);
    });

    it("Allows buying a specific tier (Silver)", async function () {
      await contract.connect(buyer).buyTicket(1, 0, { value: P1_WEI });
      const tier = await contract.getTier(1, 0);
      expect(tier.sold).to.equal(1);
    });

    it("Allows buying a premium tier (VIP)", async function () {
      await contract.connect(buyer).buyTicket(1, 1, { value: VIP_WEI });
      const tier = await contract.getTier(1, 1);
      expect(tier.sold).to.equal(1);
    });

    it("Reverts if incorrect payment is sent for a tier", async function () {
      await expect(
        contract.connect(buyer).buyTicket(1, 1, { value: P1_WEI })
      ).to.be.revertedWith("Insufficient payment");
    });

    it("Reverts if a tier is sold out", async function () {
      await contract.connect(buyer).buyTicket(1, 1, { value: VIP_WEI });
      await contract.connect(buyer2).buyTicket(1, 1, { value: VIP_WEI });
      
      await expect(
        contract.connect(buyer3).buyTicket(1, 1, { value: VIP_WEI })
      ).to.be.revertedWith("Sold out");
    });

    it("Allows batch purchasing of different tiers", async function () {
      // Buy 2 Silver and 1 VIP in one tx
      const tierIds = [0, 1];
      const qtys = [2, 1];
      const totalCost = (P1_WEI * 2n) + VIP_WEI;
      
      await contract.connect(buyer).buyBatchTickets(1, tierIds, qtys, { value: totalCost });
      
      const silverTier = await contract.getTier(1, 0);
      const vipTier = await contract.getTier(1, 1);
      
      expect(silverTier.sold).to.equal(2);
      expect(vipTier.sold).to.equal(1);
    });
  });

  describe("Event Cancellation & Refunds", function () {
    beforeEach(async function () {
      await contract.connect(organiser).createEvent("QmCancel", ROY, [P1_WEI], [10]);
      await contract.connect(buyer).buyTicket(1, 0, { value: P1_WEI });
      await contract.connect(buyer2).buyTicket(1, 0, { value: P1_WEI });
    });

    it("Organiser can cancel event by providing total refund liability", async function () {
      const liability = P1_WEI * 2n;
      await expect(contract.connect(organiser).cancelEvent(1, { value: liability }))
        .to.emit(contract, "EventCancelled")
        .withArgs(1);
      
      expect(await contract.isCancelled(1)).to.be.true;
    });

    it("Reverts cancellation if insufficient funds provided", async function () {
      await expect(
        contract.connect(organiser).cancelEvent(1, { value: P1_WEI })
      ).to.be.revertedWithCustomError(contract, "InsufficientRefundFunds");
    });

    it("Allows ticket owners to claim refund after cancellation", async function () {
      await contract.connect(organiser).cancelEvent(1, { value: P1_WEI * 2n });
      
      const initialBalance = await ethers.provider.getBalance(buyer.address);
      const tx = await contract.connect(buyer).claimRefund(1);
      const receipt = await tx.wait();
      const gasUsed = receipt.gasUsed * receipt.gasPrice;
      
      const finalBalance = await ethers.provider.getBalance(buyer.address);
      expect(finalBalance).to.equal(initialBalance + P1_WEI - gasUsed);
    });

    it("Reverts refund if event is not cancelled", async function () {
      await expect(
        contract.connect(buyer).claimRefund(1)
      ).to.be.revertedWithCustomError(contract, "EventIsCancelled"); // The error name is slightly confusing here but it checks !isCancelled
    });

    it("Prevents double refunding", async function () {
      await contract.connect(organiser).cancelEvent(1, { value: P1_WEI * 2n });
      await contract.connect(buyer).claimRefund(1);
      
      await expect(
        contract.connect(buyer).claimRefund(1)
      ).to.be.revertedWithCustomError(contract, "AlreadyRefunded");
    });
  });

  describe("Marketplace & Royalties", function () {
    beforeEach(async function () {
      await contract.connect(organiser).createEvent("QmMarket", ROY, [P1_WEI], [10]);
      await contract.connect(buyer).buyTicket(1, 0, { value: P1_WEI });
    });

    it("Ownership transfers on resale and seller receives funds", async function () {
      await contract.connect(buyer).listForResale(1, P1_WEI);
      
      const sellerInitial = await ethers.provider.getBalance(buyer.address);
      await contract.connect(buyer2).buyResaleTicket(1, { value: P1_WEI });
      
      expect(await contract.ownerOf(1)).to.equal(buyer2.address);
      // Roughly check balance (ignoring gas but ensuring it went up)
      expect(await ethers.provider.getBalance(buyer.address)).to.be.gt(sellerInitial);
    });

    it("Supports EIP-2981 royalty info correctly", async function () {
      const [receiver, amount] = await contract.royaltyInfo(1, P1_WEI);
      expect(receiver).to.equal(organiser.address);
      expect(amount).to.equal(P1_WEI * BigInt(ROY) / 100n);
    });
  });

  describe("Resale Price Cap (Non-Compounding)", function () {
    const TICKET_PRICE = ethers.parseEther("1.0"); // 1 ETH original price
    const MAX_RESALE = ethers.parseEther("1.1");   // 1 ETH + 10% = 1.1 ETH cap

    beforeEach(async function () {
      await contract.connect(organiser).createEvent("QmResaleCap", ROY, [TICKET_PRICE], [10]);
      // buyer purchases token #1
      await contract.connect(buyer).buyTicket(1, 0, { value: TICKET_PRICE });
    });

    it("First resale within the 10% cap succeeds", async function () {
      // List at exactly the cap (originalPrice + 10%)
      await contract.connect(buyer).listForResale(1, MAX_RESALE);

      await expect(
        contract.connect(buyer2).buyResaleTicket(1, { value: MAX_RESALE })
      )
        .to.emit(contract, "TicketResold")
        .withArgs(1, buyer.address, buyer2.address, MAX_RESALE, TICKET_PRICE);

      expect(await contract.ownerOf(1)).to.equal(buyer2.address);
    });

    it("Listing above the cap is rejected", async function () {
      const overCap = MAX_RESALE + 1n;
      await expect(
        contract.connect(buyer).listForResale(1, overCap)
      ).to.be.revertedWith("Resale price exceeds allowed cap");
    });

    it("Second resale is still capped at original price + 10% (no compounding)", async function () {
      // First resale at cap
      await contract.connect(buyer).listForResale(1, MAX_RESALE);
      await contract.connect(buyer2).buyResaleTicket(1, { value: MAX_RESALE });

      // buyer2 now owns the ticket; lastPricePaid == 1.1 ETH
      // But the cap must still be 1.0 + 10% = 1.1 ETH (not 1.1 + 10% = 1.21)
      await contract.connect(buyer2).listForResale(1, MAX_RESALE);
      await contract.connect(buyer3).buyResaleTicket(1, { value: MAX_RESALE });
      expect(await contract.ownerOf(1)).to.equal(buyer3.address);
    });

    it("Second resale cannot exceed original-price-based cap", async function () {
      // First resale at cap
      await contract.connect(buyer).listForResale(1, MAX_RESALE);
      await contract.connect(buyer2).buyResaleTicket(1, { value: MAX_RESALE });

      // Attempting to list at 1.21 ETH (would pass under old compounding logic)
      const compoundedPrice = ethers.parseEther("1.21");
      await expect(
        contract.connect(buyer2).listForResale(1, compoundedPrice)
      ).to.be.revertedWith("Resale price exceeds allowed cap");
    });
  });
});
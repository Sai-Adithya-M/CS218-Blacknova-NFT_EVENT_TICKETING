import { expect } from "chai";
import hre from "hardhat";
const { ethers } = hre;

describe("NFTTicket", function () {
  let contract, deployer, organiser, buyer, buyer2;
  const ONE_ETH = ethers.parseEther("1");

  beforeEach(async function () {
    [deployer, organiser, buyer, buyer2] = await ethers.getSigners();
    const NFTTicket = await ethers.getContractFactory("NFTTicket");
    contract = await NFTTicket.deploy();
  });

  describe("Core Logic", function () {
    it("Buying beyond max tickets reverts", async function () {
      await contract.connect(organiser).createEvent("Small Show", 1, ONE_ETH, 1000);
      await contract.connect(buyer).buyTicket(1, 1, 0, { value: ONE_ETH });
      await expect(contract.connect(buyer2).buyTicket(1, 1, 0, { value: ONE_ETH }))
        .to.be.revertedWith("Not enough tickets available");
    });
  });

  describe("Marketplace & Royalties", function () {
    beforeEach(async function () {
      // 10% royalty (1000 bps)
      await contract.connect(organiser).createEvent("Concert", 10, ONE_ETH, 1000);
      await contract.connect(buyer).buyTicket(1, 1, 0, { value: ONE_ETH });
    });

    it("A non-owner cannot list a ticket for resale", async function () {
      await expect(contract.connect(buyer2).listForResale(1, ONE_ETH))
        .to.be.revertedWith("Not the owner");
    });

    it("Royalty split works correctly (10% on 1 ETH)", async function () {
      await contract.connect(buyer).listForResale(1, ONE_ETH);
      
      const orgBalanceBefore = await ethers.provider.getBalance(organiser.address);
      const sellerBalanceBefore = await ethers.provider.getBalance(buyer.address);

      await contract.connect(buyer2).buyResaleTicket(1, { value: ONE_ETH });

      const orgBalanceAfter = await ethers.provider.getBalance(organiser.address);
      // Organiser gets 0.1 ETH
      expect(orgBalanceAfter - orgBalanceBefore).to.equal(ethers.parseEther("0.1"));

      // Seller gets 0.9 ETH (buyer balance check requires accounting for gas if they sent the tx, but here buyer2 sent the tx, so buyer's balance is clean)
      const sellerBalanceAfter = await ethers.provider.getBalance(buyer.address);
      expect(sellerBalanceAfter - sellerBalanceBefore).to.equal(ethers.parseEther("0.9"));
    });

    it("ERC-721 ownerOf updates correctly after transfer", async function () {
      await contract.connect(buyer).listForResale(1, ONE_ETH);
      await contract.connect(buyer2).buyResaleTicket(1, { value: ONE_ETH });
      expect(await contract.ownerOf(1)).to.equal(buyer2.address);
    });

    it("ERC-2981 royaltyInfo returns expected values", async function () {
      const [receiver, amount] = await contract.royaltyInfo(1, ONE_ETH);
      expect(receiver).to.equal(organiser.address);
      expect(amount).to.equal(ethers.parseEther("0.1"));
    });

    it("A cancelled listing cannot be purchased", async function () {
      await contract.connect(buyer).listForResale(1, ONE_ETH);
      await contract.connect(buyer).cancelResaleListing(1);
      await expect(contract.connect(buyer2).buyResaleTicket(1, { value: ONE_ETH }))
        .to.be.revertedWith("Not for sale");
    });
  });
});
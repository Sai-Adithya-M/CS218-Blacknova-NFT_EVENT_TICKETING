import { expect } from "chai";
import hre from "hardhat";
const { ethers } = hre;

describe("Referral Payment Test", function () {
  let contract, organiser, buyer, referrer;
  const PRICE = ethers.parseEther("0.1");

  beforeEach(async function () {
    [, organiser, buyer, referrer] = await ethers.getSigners();
    const F = await ethers.getContractFactory("NFTTicket");
    contract = await F.deploy();

    // Create event with 1 tier, 10% royalty, 10% max resale markup
    await contract.connect(organiser).createEvent("QmRef", 10, [PRICE], [100], 10);
    
    // Register referrer with 5% (500 bps)
    await contract.connect(organiser).addReferral(1, referrer.address, 500);
  });

  it("buyTicketWithReferral: referrer receives 5%", async function () {
    const refBalBefore = await ethers.provider.getBalance(referrer.address);
    const orgBalBefore = await ethers.provider.getBalance(organiser.address);

    await contract.connect(buyer).buyTicketWithReferral(1, 0, referrer.address, { value: PRICE });

    const refBalAfter = await ethers.provider.getBalance(referrer.address);
    const orgBalAfter = await ethers.provider.getBalance(organiser.address);

    const refGain = refBalAfter - refBalBefore;
    const orgGain = orgBalAfter - orgBalBefore;

    console.log("Single: Referrer gained:", ethers.formatEther(refGain), "ETH");
    console.log("Single: Organiser gained:", ethers.formatEther(orgGain), "ETH");

    expect(refGain).to.equal(ethers.parseEther("0.005"));
    expect(orgGain).to.equal(ethers.parseEther("0.095"));
  });

  it("buyBatchTicketsWithReferral: referrer receives 5% on batch of 3 tickets", async function () {
    const refBalBefore = await ethers.provider.getBalance(referrer.address);
    const orgBalBefore = await ethers.provider.getBalance(organiser.address);

    const totalCost = PRICE * 3n;
    await contract.connect(buyer).buyBatchTicketsWithReferral(1, [0], [3], referrer.address, { value: totalCost });

    const refBalAfter = await ethers.provider.getBalance(referrer.address);
    const orgBalAfter = await ethers.provider.getBalance(organiser.address);

    const refGain = refBalAfter - refBalBefore;
    const orgGain = orgBalAfter - orgBalBefore;

    console.log("Batch(3): Referrer gained:", ethers.formatEther(refGain), "ETH");
    console.log("Batch(3): Organiser gained:", ethers.formatEther(orgGain), "ETH");

    // 5% of 0.3 ETH = 0.015 ETH
    expect(refGain).to.equal(ethers.parseEther("0.015"));
    // 95% of 0.3 ETH = 0.285 ETH
    expect(orgGain).to.equal(ethers.parseEther("0.285"));
  });

  it("buyBatchTickets (no referrer): organiser gets 100%", async function () {
    const refBalBefore = await ethers.provider.getBalance(referrer.address);
    const orgBalBefore = await ethers.provider.getBalance(organiser.address);

    await contract.connect(buyer).buyBatchTickets(1, [0], [2], { value: PRICE * 2n });

    const refBalAfter = await ethers.provider.getBalance(referrer.address);
    const orgBalAfter = await ethers.provider.getBalance(organiser.address);

    expect(refBalAfter - refBalBefore).to.equal(0n);
    expect(orgBalAfter - orgBalBefore).to.equal(PRICE * 2n);
    console.log("No-ref batch: Organiser got full 0.2 ETH, referrer got 0");
  });
});

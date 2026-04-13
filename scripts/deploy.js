import hre from "hardhat";

async function main() {
  console.log("Deploying NFTTicket Contract...");
  
  const Contract = await hre.ethers.getContractFactory("NFTTicket");
  const contract = await Contract.deploy();
  
  await contract.waitForDeployment();
  
  console.log(`NFTTicket successfully deployed to: ${contract.target}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
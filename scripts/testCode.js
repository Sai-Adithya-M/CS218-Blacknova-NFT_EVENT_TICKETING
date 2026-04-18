import hre from "hardhat";

async function main() {
  const code = await hre.ethers.provider.getCode("0x74eFFE12e70e99e4CC9D2703433eFcF87A35BdE3");
  console.log("Code length:", code.length);
  if (code.length > 2) {
    console.log("Code prefix:", code.substring(0, 20));
  }
}

main().catch(console.error);

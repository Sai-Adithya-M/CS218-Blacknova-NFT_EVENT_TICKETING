import { EtherscanProvider } from "ethers";
const p = new EtherscanProvider("sepolia");
p.getHistory("0x1111111111111111111111111111111111111111").then(console.log).catch(console.error);

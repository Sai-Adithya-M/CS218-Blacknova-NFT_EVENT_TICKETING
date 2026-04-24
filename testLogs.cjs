const { ethers } = require('ethers');
const provider = new ethers.JsonRpcProvider("https://rpc.ankr.com/eth_sepolia");
const ABI = ["event EventCreated(uint256 indexed eventId, address indexed organiser, string ipfsHash)"];
const contract = new ethers.Contract("0xE2ABA4804a977678a489BA4d2799dfeec544124b", ABI, provider);

async function test() {
  try {
    const filter = contract.filters.EventCreated();
    const logs = await contract.queryFilter(filter, 0); // Ankr might allow from 0 if it's not too many logs
    console.log("Logs found:", logs.length);
    if(logs.length > 0) {
      console.log("Tx hashes:", logs.map(l => l.transactionHash));
    }
  } catch(e) {
    console.error("Failed:", e.message);
  }
}
test();

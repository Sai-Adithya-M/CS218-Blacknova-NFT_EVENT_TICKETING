export const config = {
  // Exact contract address verified on Sepolia Etherscan
  contractAddress: import.meta.env.VITE_CONTRACT_ADDRESS || "0xBD05B4B6aC1421464F9a76F3B541d18345884CD4",
  sepoliaChainId: 11155111,
  // Using a cluster of reliable public RPC nodes
  sepoliaRpcUrl: "https://ethereum-sepolia-rpc.publicnode.com",
  // Deployment Block: must be close to contract deploy block for RPC log queries to work
  // Contract 0xAB6F71bF... was deployed around block 10710000 on Sepolia
  deploymentBlock: 10700000,

};

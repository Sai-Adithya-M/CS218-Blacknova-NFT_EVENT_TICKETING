export const config = {
  // Exact contract address verified on Sepolia Etherscan
  contractAddress: import.meta.env.VITE_CONTRACT_ADDRESS || "0xBB6adD474fbe3845e04e7cb62bc23283560D0f26",
  sepoliaChainId: 11155111,
  // Using a cluster of reliable public RPC nodes
  sepoliaRpcUrl: "https://ethereum-sepolia-rpc.publicnode.com",
  // Deployment Block updated for new contract deployment (May 10, 2026)
  deploymentBlock: 10910000,

};

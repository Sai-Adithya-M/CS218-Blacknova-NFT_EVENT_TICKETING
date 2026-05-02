export const config = {
  // Exact contract address verified on Sepolia Etherscan
  contractAddress: import.meta.env.VITE_CONTRACT_ADDRESS || "0xeF279873A75Bd70148F5D41232027684363173ea",
  sepoliaChainId: 11155111,
  // Using a cluster of reliable public RPC nodes
  sepoliaRpcUrl: "https://ethereum-sepolia-rpc.publicnode.com",
  // Deployment Block updated for new contract deployment (May 2, 2026)
  deploymentBlock: 10760000,

};

export const config = {
  // Exact contract address verified on Sepolia Etherscan
  contractAddress: import.meta.env.VITE_CONTRACT_ADDRESS || "0x4ba4BCF64eC2eB5C99310b75cb969EF8345F4ff2",
  sepoliaChainId: 11155111,
  // Using a cluster of reliable public RPC nodes
  sepoliaRpcUrl: "https://ethereum-sepolia-rpc.publicnode.com",
  // Deployment Block updated for new contract deployment (May 2, 2026)
  deploymentBlock: 10760000,

};

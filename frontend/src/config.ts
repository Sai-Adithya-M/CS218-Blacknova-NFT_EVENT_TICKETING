export const config = {
  // Exact contract address verified on Sepolia Etherscan
  contractAddress: import.meta.env.VITE_CONTRACT_ADDRESS || "0xC900569d61Ce47bc1be9dbe7117Cae8Ae979Da80",
  sepoliaChainId: 11155111,
  // Using a cluster of reliable public RPC nodes
  sepoliaRpcUrl: "https://ethereum-sepolia-rpc.publicnode.com",
  // Deployment Block: must be close to contract deploy block for RPC log queries to work
  deploymentBlock: 10723000,

};

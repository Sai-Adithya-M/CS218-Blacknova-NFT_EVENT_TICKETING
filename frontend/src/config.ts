export const config = {
  // Exact contract address verified on Sepolia Etherscan
  contractAddress: import.meta.env.VITE_CONTRACT_ADDRESS || "0x6A0d38216cB1bc9cEC83683D8EcBEE4A45684b6c",
  sepoliaChainId: 11155111,
  // Using a cluster of reliable public RPC nodes
  sepoliaRpcUrl: "https://ethereum-sepolia-rpc.publicnode.com",
  // Deployment Block updated to stay within 50k block range: 10680000
  deploymentBlock: 10680000,
};

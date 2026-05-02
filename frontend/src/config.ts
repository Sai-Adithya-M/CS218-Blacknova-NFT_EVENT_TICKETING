export const config = {
  // Exact contract address verified on Sepolia Etherscan
  contractAddress: import.meta.env.VITE_CONTRACT_ADDRESS || "0xCc7AC6b5A7123781463aeec00EEeD0DD21f12705",
  sepoliaChainId: 11155111,
  // Using a cluster of reliable public RPC nodes
  sepoliaRpcUrl: "https://ethereum-sepolia-rpc.publicnode.com",
  // Deployment Block updated to stay within 50k block range: 10680000
  deploymentBlock: 10730000,

};

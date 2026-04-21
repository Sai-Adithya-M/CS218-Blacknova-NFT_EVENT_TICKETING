export const config = {
  // Exact contract address verified on Sepolia Etherscan
  contractAddress: import.meta.env.VITE_CONTRACT_ADDRESS || "0x74eFFE12e70e99e4CC9D2703433eFcF87A35BdE3",
  sepoliaChainId: 11155111,
  // Using a cluster of reliable public RPC nodes
  sepoliaRpcUrl: "https://ethereum-sepolia-rpc.publicnode.com",
  // EXACT Deployment Block found on Etherscan: 10659564
  deploymentBlock: 10659564,
};

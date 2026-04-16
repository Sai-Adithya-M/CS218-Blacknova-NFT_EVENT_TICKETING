export const config = {
  // Use the env var if available, otherwise fallback to the generic Address Zero placeholder.
  contractAddress: import.meta.env.VITE_CONTRACT_ADDRESS || "0x0000000000000000000000000000000000000000",
  sepoliaChainId: 11155111,
};

export const config = {
  // Use the env var if available, otherwise fallback to the generic Address Zero placeholder.
  contractAddress: import.meta.env.VITE_CONTRACT_ADDRESS || "0x090Fa0DE24338Ac61C8b511fC2d3e20dAd37cfBE",
  sepoliaChainId: 11155111,
};

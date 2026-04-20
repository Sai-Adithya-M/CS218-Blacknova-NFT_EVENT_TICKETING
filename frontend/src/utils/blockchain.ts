import { ethers } from 'ethers';
import { config } from '../config';

/**
 * Returns a robust JSON-RPC provider for read-only operations.
 * This ensures the marketplace works even without a connected wallet.
 */
export const getReadProvider = () => {
  return new ethers.JsonRpcProvider(config.sepoliaRpcUrl);
};

/**
 * Returns a BrowserProvider if MetaMask is available, otherwise falls back to the read provider.
 */
export const getBrowserProvider = () => {
  if (typeof window !== 'undefined' && (window as any).ethereum) {
    return new ethers.BrowserProvider((window as any).ethereum);
  }
  return null;
};

/**
 * Helper to ensure we are on the correct network before performing writes.
 */
export const ensureCorrectNetwork = async (provider: ethers.BrowserProvider) => {
  const network = await provider.getNetwork();
  if (network.chainId !== BigInt(config.sepoliaChainId)) {
    try {
      await (window as any).ethereum.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: `0x${config.sepoliaChainId.toString(16)}` }],
      });
      return true;
    } catch (error) {
      console.error("Failed to switch network:", error);
      return false;
    }
  }
  return true;
};

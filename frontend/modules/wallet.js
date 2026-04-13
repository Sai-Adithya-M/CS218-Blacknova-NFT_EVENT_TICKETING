// wallet.js — MetaMask wallet connection logic
import { ethers } from 'ethers';

let provider = null;
let signer = null;
let currentAccount = null;

/**
 * Connect to MetaMask and return the signer
 */
export async function connectWallet() {
  if (!window.ethereum) {
    throw new Error('MetaMask is not installed. Please install MetaMask to use this app.');
  }

  provider = new ethers.BrowserProvider(window.ethereum);
  const accounts = await provider.send('eth_requestAccounts', []);
  currentAccount = accounts[0];
  signer = await provider.getSigner();

  return { provider, signer, account: currentAccount };
}

/**
 * Silently reconnect if already authorized (no MetaMask popup)
 */
export async function silentConnect() {
  if (!window.ethereum) return null;

  const accounts = await window.ethereum.request({ method: 'eth_accounts' });
  if (accounts.length === 0) return null;

  provider = new ethers.BrowserProvider(window.ethereum);
  currentAccount = accounts[0];
  signer = await provider.getSigner();

  return { provider, signer, account: currentAccount };
}

/**
 * Get the current provider (read-only)
 */
export function getProvider() {
  if (!provider && window.ethereum) {
    provider = new ethers.BrowserProvider(window.ethereum);
  }
  return provider;
}

/**
 * Get the current signer (requires wallet connection)
 */
export async function getSigner() {
  if (!signer) {
    await connectWallet();
  }
  return signer;
}

/**
 * Get the currently connected account address
 */
export function getCurrentAccount() {
  return currentAccount;
}

/**
 * Truncate an address for display
 */
export function truncateAddress(address) {
  if (!address) return '';
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

/**
 * Setup listeners for account and chain changes
 */
export function setupWalletListeners(onAccountChange, onChainChange) {
  if (!window.ethereum) return;

  window.ethereum.on('accountsChanged', (accounts) => {
    if (accounts.length === 0) {
      currentAccount = null;
      signer = null;
      if (onAccountChange) onAccountChange(null);
    } else {
      currentAccount = accounts[0];
      // Re-create signer
      provider = new ethers.BrowserProvider(window.ethereum);
      provider.getSigner().then((s) => {
        signer = s;
        if (onAccountChange) onAccountChange(currentAccount);
      });
    }
  });

  window.ethereum.on('chainChanged', () => {
    if (onChainChange) onChainChange();
    // Recommended: reload the page on chain change
    window.location.reload();
  });
}

/**
 * Switch MetaMask to Sepolia network for this dApp
 */
export async function switchToSepolia() {
  if (!window.ethereum) return;

  const SEPOLIA_CHAIN_ID = '0xaa36a7'; // 11155111 in hex

  try {
    await window.ethereum.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: SEPOLIA_CHAIN_ID }],
    });
  } catch (switchError) {
    // If Sepolia is not added to MetaMask, add it
    if (switchError.code === 4902) {
      await window.ethereum.request({
        method: 'wallet_addEthereumChain',
        params: [{
          chainId: SEPOLIA_CHAIN_ID,
          chainName: 'Sepolia Testnet',
          nativeCurrency: { name: 'SepoliaETH', symbol: 'ETH', decimals: 18 },
          rpcUrls: ['https://rpc.sepolia.org'],
          blockExplorerUrls: ['https://sepolia.etherscan.io'],
        }],
      });
    } else {
      throw switchError;
    }
  }
}

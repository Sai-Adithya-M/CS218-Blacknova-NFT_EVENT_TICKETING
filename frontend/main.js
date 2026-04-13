// main.js — App entry point
import { ethers } from 'ethers';
import { connectWallet, silentConnect, switchToSepolia, getCurrentAccount, truncateAddress, setupWalletListeners, getProvider, getSigner } from './modules/wallet.js';
import { createEvent, loadEvents, renderEvents } from './modules/events.js';
import { loadMyTickets, renderMyTickets } from './modules/tickets.js';
import { loadResaleListings, renderMarketplace } from './modules/marketplace.js';
import contractABI from './contracts/NFTTicket.json';

// ============================
// CONFIGURATION
// ============================
// TODO: Replace with your deployed contract address
const CONTRACT_ADDRESS = '0x5c8240dab6D9CE54935af13128df2C6DE598eB50';

// Supported chain IDs
const SUPPORTED_CHAINS = {
  11155111: 'Sepolia',
  31337: 'Localhost',
};

// ============================
// CONTRACT INSTANCES
// ============================
let readContract = null;
let writeContract = null;

/**
 * Get a read-only contract instance (no signer needed)
 */
export function getReadContract() {
  if (!readContract) {
    const provider = getProvider();
    if (provider) {
      readContract = new ethers.Contract(CONTRACT_ADDRESS, contractABI, provider);
    }
  }
  return readContract;
}

/**
 * Get a writable contract instance (requires signer)
 */
export async function getContract() {
  const signer = await getSigner();
  writeContract = new ethers.Contract(CONTRACT_ADDRESS, contractABI, signer);
  return writeContract;
}

// ============================
// UI HELPERS
// ============================
export function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 4000);
}

export function showLoading(text = 'Processing transaction...') {
  const overlay = document.getElementById('loading-overlay');
  const loadingText = document.getElementById('loading-text');
  loadingText.textContent = text;
  overlay.classList.add('active');
}

export function hideLoading() {
  const overlay = document.getElementById('loading-overlay');
  overlay.classList.remove('active');
}

// ============================
// TAB NAVIGATION
// ============================
function setupTabs() {
  const tabs = document.querySelectorAll('.nav-tab');
  const panels = document.querySelectorAll('.tab-panel');

  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      const target = tab.dataset.tab;

      // Update active tab
      tabs.forEach((t) => t.classList.remove('active'));
      tab.classList.add('active');

      // Show target panel
      panels.forEach((p) => p.classList.remove('active'));
      const panel = document.getElementById(`panel-${target}`);
      if (panel) panel.classList.add('active');

      // Load data for the tab
      loadTabData(target);
    });
  });
}

async function loadTabData(tab) {
  if (!getCurrentAccount()) return;

  try {
    switch (tab) {
      case 'events':
        await refreshEvents();
        break;
      case 'tickets':
        await refreshTickets();
        break;
      case 'marketplace':
        await refreshMarketplace();
        break;
    }
  } catch (err) {
    console.error(`Error loading ${tab}:`, err);
  }
}

// ============================
// DATA REFRESH FUNCTIONS
// ============================
async function refreshEvents() {
  const container = document.getElementById('events-container');
  container.innerHTML = '<div class="empty-state"><div class="spinner" style="margin: 0 auto;"></div><p style="margin-top:16px;">Loading events...</p></div>';
  const events = await loadEvents();
  renderEvents(events, container);
}

async function refreshTickets() {
  const container = document.getElementById('tickets-container');
  container.innerHTML = '<div class="empty-state"><div class="spinner" style="margin: 0 auto;"></div><p style="margin-top:16px;">Loading tickets...</p></div>';
  const tickets = await loadMyTickets();
  renderMyTickets(tickets, container, refreshTickets);
}

async function refreshMarketplace() {
  const container = document.getElementById('marketplace-container');
  container.innerHTML = '<div class="empty-state"><div class="spinner" style="margin: 0 auto;"></div><p style="margin-top:16px;">Loading marketplace...</p></div>';
  const listings = await loadResaleListings();
  renderMarketplace(listings, container, refreshMarketplace);
}

// ============================
// WALLET CONNECTION
// ============================
function updateWalletUI(account) {
  const btn = document.getElementById('connect-wallet-btn');
  const btnText = document.getElementById('wallet-btn-text');
  const networkBadge = document.getElementById('network-badge');
  const connectPrompt = document.getElementById('connect-prompt');
  const mainPanels = document.querySelectorAll('.tab-panel');

  if (account) {
    btn.classList.add('connected');
    btnText.textContent = truncateAddress(account);
    networkBadge.style.display = 'flex';
    connectPrompt.style.display = 'none';

    // Ensure active tab panel is visible
    const activeTab = document.querySelector('.nav-tab.active');
    if (activeTab) {
      const panel = document.getElementById(`panel-${activeTab.dataset.tab}`);
      if (panel) panel.style.display = '';
    }

    // Reset contract instances so they use updated provider
    readContract = null;
    writeContract = null;

    // Load initial data
    loadTabData('events');
  } else {
    btn.classList.remove('connected');
    btnText.textContent = 'Connect Wallet';
    networkBadge.style.display = 'none';

    // Show connect prompt
    document.querySelectorAll('.tab-panel').forEach((p) => (p.style.display = 'none'));
    connectPrompt.style.display = '';
  }
}

async function updateNetworkInfo() {
  try {
    const provider = getProvider();
    if (provider) {
      const network = await provider.getNetwork();
      const chainId = Number(network.chainId);
      const networkName = SUPPORTED_CHAINS[chainId] || `Chain ${chainId}`;
      document.getElementById('network-name').textContent = networkName;

      // Auto-switch to Sepolia if on wrong network
      if (chainId !== 11155111 && chainId !== 31337) {
        showToast('Switching to Sepolia network...', 'info');
        try {
          await switchToSepolia();
          // Page will reload after chain switch
        } catch (switchErr) {
          console.error('Failed to switch network:', switchErr);
          showToast('Please manually switch to Sepolia in MetaMask', 'error');
        }
      }
    }
  } catch (err) {
    console.error('Error getting network:', err);
  }
}

let isConnecting = false;

async function handleConnect() {
  if (isConnecting) return;
  isConnecting = true;
  try {
    const { account } = await connectWallet();
    updateWalletUI(account);
    await updateNetworkInfo();
    showToast('Wallet connected!', 'success');
  } catch (err) {
    console.error('Connection error:', err);
    showToast(err.reason || err.message || 'Failed to connect wallet', 'error');
  } finally {
    isConnecting = false;
  }
}

// ============================
// CREATE EVENT FORM
// ============================
function setupCreateEventForm() {
  const form = document.getElementById('create-event-form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const name = document.getElementById('event-name').value.trim();
    const maxTickets = parseInt(document.getElementById('event-max-tickets').value, 10);
    const priceEth = document.getElementById('event-price').value;
    const royaltyPercent = parseFloat(document.getElementById('event-royalty').value);

    if (!name || !maxTickets || !priceEth || isNaN(royaltyPercent)) {
      showToast('Please fill in all fields', 'error');
      return;
    }

    const success = await createEvent(name, maxTickets, priceEth, royaltyPercent);
    if (success) {
      form.reset();
      await refreshEvents();
    }
  });
}

// ============================
// INIT
// ============================
async function init() {
  setupTabs();
  setupCreateEventForm();

  // Wallet connection buttons
  document.getElementById('connect-wallet-btn').addEventListener('click', handleConnect);
  document.getElementById('connect-prompt-btn').addEventListener('click', handleConnect);

  // Refresh buttons
  document.getElementById('refresh-events-btn').addEventListener('click', refreshEvents);
  document.getElementById('refresh-tickets-btn').addEventListener('click', refreshTickets);
  document.getElementById('refresh-marketplace-btn').addEventListener('click', refreshMarketplace);

  // Wallet listeners
  setupWalletListeners(
    (account) => {
      updateWalletUI(account);
      if (account) updateNetworkInfo();
    },
    () => {
      updateNetworkInfo();
    }
  );

  // Auto-connect if already authorized (silent — no popup)
  if (window.ethereum) {
    try {
      const result = await silentConnect();
      if (result) {
        updateWalletUI(result.account);
        await updateNetworkInfo();
      } else {
        updateWalletUI(null);
      }
    } catch (err) {
      updateWalletUI(null);
    }
  } else {
    updateWalletUI(null);
  }
}

// Start the app
init();

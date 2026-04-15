// main.js — App entry point
import { ethers } from 'ethers';
import { connectWallet, disconnectWallet, silentConnect, switchToSepolia, getCurrentAccount, truncateAddress, setupWalletListeners, getProvider, getSigner } from './modules/wallet.js';
import { createEvent, loadEvents, renderEvents } from './modules/events.js';
import { loadMyTickets, renderMyTickets } from './modules/tickets.js';
import { loadResaleListings, renderMarketplace } from './modules/marketplace.js';
import contractABI from './contracts/NFTTicket.json';

// ============================
// CONFIGURATION
// ============================
// TODO: Replace with your deployed contract address
const CONTRACT_ADDRESS = '0x74eFFE12e70e99e4CC9D2703433eFcF87A35BdE3';

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
const loadedTabs = {
  events: false,
  tickets: false,
  marketplace: false,
  dashboard: false
};

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
        if (!loadedTabs.events) await refreshEvents();
        break;
      case 'tickets':
        if (!loadedTabs.tickets) await refreshTickets();
        break;
      case 'marketplace':
        if (!loadedTabs.marketplace) await refreshMarketplace();
        break;
      case 'dashboard':
        if (!loadedTabs.dashboard) await refreshDashboard();
        break;
      case 'create':
        // No async data to load for the create form
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
  loadedTabs.events = true;

  // Smart design: Show Dashboard tab only if user owns at least one event
  const account = getCurrentAccount();
  const hasOwnEvents = account && events.some(evt => evt.organiser.toLowerCase() === account.toLowerCase());
  const dashboardTab = document.getElementById('tab-dashboard');
  if (dashboardTab) {
    dashboardTab.style.display = hasOwnEvents ? 'block' : 'none';
  }
}

async function refreshTickets() {
  const container = document.getElementById('tickets-container');
  container.innerHTML = '<div class="empty-state"><div class="spinner" style="margin: 0 auto;"></div><p style="margin-top:16px;">Loading tickets...</p></div>';
  const tickets = await loadMyTickets();
  renderMyTickets(tickets, container, refreshTickets);
  loadedTabs.tickets = true;
}

async function refreshMarketplace() {
  const container = document.getElementById('marketplace-container');
  container.className = 'cards-grid';
  container.innerHTML = '<div class="empty-state"><div class="spinner" style="margin: 0 auto;"></div><p style="margin-top:16px;">Loading marketplace...</p></div>';
  const listings = await loadResaleListings();
  renderMarketplace(listings, container, refreshMarketplace);
  loadedTabs.marketplace = true;
}

async function refreshDashboard() {
  const container = document.getElementById('dashboard-container');
  container.innerHTML = '<div class="empty-state"><div class="spinner" style="margin: 0 auto;"></div><p style="margin-top:16px;">Loading dashboard...</p></div>';
  const allEvents = await loadEvents();
  const account = getCurrentAccount();
  const myEvents = allEvents.filter(evt => account && evt.organiser.toLowerCase() === account.toLowerCase());
  
  // Reuse renderEvents but pass a flag to style them as dashboard cards
  renderEvents(myEvents, container, true);
  loadedTabs.dashboard = true;
}

// ============================
// WALLET CONNECTION
// ============================
function updateWalletUI(account) {
  const loginBtn = document.getElementById('connect-wallet-btn');
  const addressDisplay = document.getElementById('wallet-address-display');
  const addressText = document.getElementById('wallet-address-text');
  const logoutBtn = document.getElementById('logout-btn');
  const networkBadge = document.getElementById('network-badge');
  const connectPrompt = document.getElementById('connect-prompt');
  const mainPanels = document.querySelectorAll('.tab-panel');

  if (account) {
    loginBtn.style.display = 'none';
    addressDisplay.style.display = 'flex';
    addressText.textContent = truncateAddress(account);
    logoutBtn.style.display = 'flex';
    networkBadge.style.display = 'flex';
    connectPrompt.style.display = 'none';

    // Remove inline 'display: none' from ALL panels so CSS classes control visibility again
    mainPanels.forEach((p) => (p.style.display = ''));

    // Reset contract instances so they use updated provider
    readContract = null;
    writeContract = null;

    // Load initial data
    const activeTab = document.querySelector('.nav-tab.active');
    if (activeTab) {
      loadTabData(activeTab.dataset.tab);
    } else {
      loadTabData('events');
    }
  } else {
    loginBtn.style.display = 'flex';
    addressDisplay.style.display = 'none';
    logoutBtn.style.display = 'none';
    networkBadge.style.display = 'none';

    // Show connect prompt
    mainPanels.forEach((p) => (p.style.display = 'none'));
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
      if (chainId !== 11155111) {
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
    showToast('Login successful!', 'success');
  } catch (err) {
    console.error('Connection error:', err);
    showToast(err.reason || err.message || 'Failed to login', 'error');
  } finally {
    isConnecting = false;
  }
}

function handleLogout() {
  if (getCurrentAccount()) {
    disconnectWallet();
    
    // Clear cache upon manual logout
    loadedTabs.events = false;
    loadedTabs.tickets = false;
    loadedTabs.marketplace = false;
    loadedTabs.dashboard = false;
    
    updateWalletUI(null);
    showToast('Logged out successfully', 'info');
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
      // Auto-navigate to dashboard so they can see their new event
      const dashBtn = document.querySelector('[data-tab="dashboard"]');
      if (dashBtn && dashBtn.style.display !== 'none') {
        dashBtn.click();
      } else {
        document.querySelector('[data-tab="events"]').click();
      }
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
  document.getElementById('logout-btn').addEventListener('click', handleLogout);

  // Refresh buttons
  document.getElementById('refresh-events-btn').addEventListener('click', refreshEvents);
  document.getElementById('refresh-tickets-btn').addEventListener('click', refreshTickets);
  document.getElementById('refresh-marketplace-btn').addEventListener('click', refreshMarketplace);
  document.getElementById('refresh-dashboard-btn').addEventListener('click', refreshDashboard);

  // Wallet listeners
  setupWalletListeners(
    (account) => {
      // Clear cache on wallet change
      loadedTabs.events = false;
      loadedTabs.tickets = false;
      loadedTabs.marketplace = false;
      loadedTabs.dashboard = false;
      
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

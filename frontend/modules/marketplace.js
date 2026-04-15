// marketplace.js — Two-level marketplace: Event list → Ticket list
import { ethers } from 'ethers';
import { getCurrentAccount } from './wallet.js';
import { getContract, getReadContract } from '../main.js';
import { showToast, showLoading, hideLoading } from '../main.js';

/**
 * Load all active resale listings along with full event data
 */
export async function loadResaleListings() {
  const contract = getReadContract();
  const nextTokenId = await contract.nextTokenId();
  const listings = [];

  for (let i = 1; i < Number(nextTokenId); i++) {
    try {
      const listing = await contract.getResaleListing(i);
      if (listing.active) {
        const eventId = await contract.tokenToEvent(i);
        const evt = await contract.fetchEventData(eventId);
        listings.push({
          tokenId: i,
          seller: listing.seller,
          priceWei: listing.priceWei,
          eventName: evt.name,
          eventId: Number(eventId),
          originalPriceWei: evt.priceWei,
          maxTickets: Number(evt.maxTickets),
          ticketsSold: Number(evt.ticketsSold),
          royaltyBps: Number(evt.royaltyBps),
          organiser: evt.organiser,
        });
      }
    } catch (err) {
      // Skip
    }
  }

  return listings;
}

/**
 * Buy a resale ticket
 */
export async function buyResaleTicket(tokenId, priceWei) {
  const contract = await getContract();

  showLoading('Purchasing resale ticket...');
  try {
    const tx = await contract.buyResaleTicket(tokenId, { value: priceWei });
    showLoading('Waiting for confirmation...');
    await tx.wait();
    showToast('Resale ticket purchased! 🎉', 'success');
    return true;
  } catch (err) {
    console.error('buyResaleTicket error:', err);
    showToast(err.reason || err.message || 'Failed to buy resale ticket', 'error');
    return false;
  } finally {
    hideLoading();
  }
}

/**
 * Cancel a resale listing
 */
export async function cancelListing(tokenId) {
  const contract = await getContract();

  showLoading('Cancelling listing...');
  try {
    const tx = await contract.cancelResaleListing(tokenId);
    showLoading('Waiting for confirmation...');
    await tx.wait();
    showToast('Listing cancelled', 'success');
    return true;
  } catch (err) {
    console.error('cancelListing error:', err);
    showToast(err.reason || err.message || 'Failed to cancel listing', 'error');
    return false;
  } finally {
    hideLoading();
  }
}

/**
 * Group listings by eventId
 */
function groupByEvent(listings) {
  const groups = {};
  listings.forEach((listing) => {
    if (!groups[listing.eventId]) {
      groups[listing.eventId] = {
        eventId: listing.eventId,
        eventName: listing.eventName,
        originalPriceWei: listing.originalPriceWei,
        maxTickets: listing.maxTickets,
        ticketsSold: listing.ticketsSold,
        royaltyBps: listing.royaltyBps,
        organiser: listing.organiser,
        tickets: [],
      };
    }
    groups[listing.eventId].tickets.push(listing);
  });
  return Object.values(groups);
}

/**
 * Render the marketplace into the given container.
 * Level 1: Event cards showing resale availability.
 * Level 2: Opened on click — shows individual tickets for that event.
 */
export function renderMarketplace(listings, container, onRefresh) {
  // Store listings and callbacks so drill-down / back can reuse them
  container._mpListings = listings;
  container._mpRefresh = onRefresh;

  // Always start at Level 1 (event list)
  renderEventList(listings, container, onRefresh);
}

// ============================================================
// LEVEL 1 — Event cards
// ============================================================
function renderEventList(listings, container, onRefresh) {
  container.className = 'marketplace-layout';
  container.innerHTML = '';

  if (listings.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <span class="empty-icon">🏪</span>
        <p>No tickets listed for resale</p>
        <p class="empty-sub">Check back later or list your own!</p>
      </div>
    `;
    return;
  }

  const eventGroups = groupByEvent(listings);

  eventGroups.forEach((group) => {
    const originalPriceEth = ethers.formatEther(group.originalPriceWei);
    const royaltyPercent = group.royaltyBps / 100;
    const ticketCount = group.tickets.length;

    // Find lowest and highest resale price
    let lowestWei = BigInt(group.tickets[0].priceWei);
    let highestWei = BigInt(group.tickets[0].priceWei);
    for (const t of group.tickets) {
      const p = BigInt(t.priceWei);
      if (p < lowestWei) lowestWei = p;
      if (p > highestWei) highestWei = p;
    }
    const lowestEth = ethers.formatEther(lowestWei);
    const highestEth = ethers.formatEther(highestWei);
    const priceRange = lowestWei === highestWei
      ? `${lowestEth} ETH`
      : `${lowestEth} — ${highestEth} ETH`;

    const card = document.createElement('div');
    card.className = 'card mp-event-card';
    card.dataset.eventId = group.eventId;

    card.innerHTML = `
      <div class="mp-event-card-top">
        <div class="mp-event-card-header">
          <h3 class="mp-event-card-name">${escapeHtml(group.eventName)}</h3>
          <span class="mp-event-ticket-badge">${ticketCount} ticket${ticketCount > 1 ? 's' : ''}</span>
        </div>
        <div class="mp-event-card-body">
          <div class="card-stat">
            <span class="stat-label">Resale Price</span>
            <span class="stat-value price-highlight">${priceRange}</span>
          </div>
          <div class="card-stat">
            <span class="stat-label">Original Price</span>
            <span class="stat-value">${originalPriceEth} ETH</span>
          </div>
          <div class="card-stat">
            <span class="stat-label">Royalty</span>
            <span class="stat-value">${royaltyPercent}%</span>
          </div>
          <div class="card-stat">
            <span class="stat-label">Tickets Sold</span>
            <span class="stat-value">${group.ticketsSold} / ${group.maxTickets}</span>
          </div>
        </div>
      </div>
      <div class="mp-event-card-footer">
        <span class="mp-event-cta">View Tickets →</span>
      </div>
    `;
    container.appendChild(card);
  });

  // Attach click listeners to open Level 2
  container.querySelectorAll('.mp-event-card').forEach((card) => {
    card.addEventListener('click', () => {
      const eventId = Number(card.dataset.eventId);
      const group = eventGroups.find((g) => g.eventId === eventId);
      if (group) {
        renderTicketList(group, container, listings, onRefresh);
      }
    });
  });
}

// ============================================================
// LEVEL 2 — Individual tickets for a selected event
// ============================================================
function renderTicketList(group, container, allListings, onRefresh) {
  container.className = 'marketplace-layout';
  container.innerHTML = '';

  const account = getCurrentAccount();
  const originalPriceEth = ethers.formatEther(group.originalPriceWei);
  const royaltyPercent = group.royaltyBps / 100;

  // Back button + event header
  const header = document.createElement('div');
  header.className = 'mp-detail-header';
  header.innerHTML = `
    <button class="mp-back-btn" id="mp-back-btn">
      <span class="mp-back-arrow">←</span>
      <span>Back to Events</span>
    </button>
    <div class="mp-detail-event-info">
      <h2 class="mp-detail-event-name">${escapeHtml(group.eventName)}</h2>
      <div class="mp-detail-meta">
        <span class="mp-detail-meta-item">
          <span class="meta-label">Original:</span>
          <span class="meta-value">${originalPriceEth} ETH</span>
        </span>
        <span class="mp-detail-meta-divider">•</span>
        <span class="mp-detail-meta-item">
          <span class="meta-label">Royalty:</span>
          <span class="meta-value">${royaltyPercent}%</span>
        </span>
        <span class="mp-detail-meta-divider">•</span>
        <span class="mp-detail-meta-item">
          <span class="meta-label">Available:</span>
          <span class="meta-value">${group.tickets.length} ticket${group.tickets.length > 1 ? 's' : ''}</span>
        </span>
      </div>
    </div>
  `;
  container.appendChild(header);

  // Ticket grid
  const grid = document.createElement('div');
  grid.className = 'mp-tickets-grid';

  group.tickets.forEach((listing) => {
    const priceEth = ethers.formatEther(listing.priceWei);
    const isSeller = account && listing.seller.toLowerCase() === account.toLowerCase();

    const card = document.createElement('div');
    card.className = 'card marketplace-card';
    card.innerHTML = `
      <div class="card-header">
        <h3 class="card-title">Ticket #${listing.tokenId}</h3>
        <span class="card-badge badge-resale">RESALE</span>
      </div>
      <div class="card-body">
        <div class="card-stat">
          <span class="stat-label">Price</span>
          <span class="stat-value price-highlight">${priceEth} ETH</span>
        </div>
        <div class="card-stat">
          <span class="stat-label">Seller</span>
          <span class="stat-value address-text">${isSeller ? 'You' : truncAddr(listing.seller)}</span>
        </div>
        <div class="card-stat">
          <span class="stat-label">vs Original</span>
          <span class="stat-value ${comparePrices(listing.priceWei, group.originalPriceWei)}">${getPriceDiffLabel(listing.priceWei, group.originalPriceWei)}</span>
        </div>
      </div>
      <div class="card-footer">
        ${isSeller
          ? `<button class="btn btn-danger cancel-listing-btn" data-token-id="${listing.tokenId}">✕ Cancel Listing</button>`
          : `<button class="btn btn-primary buy-resale-btn" data-token-id="${listing.tokenId}" data-price="${listing.priceWei}">Buy — ${priceEth} ETH</button>`
        }
      </div>
    `;
    grid.appendChild(card);
  });

  container.appendChild(grid);

  // --- Event listeners ---

  // Back button
  document.getElementById('mp-back-btn').addEventListener('click', () => {
    renderEventList(allListings, container, onRefresh);
  });

  // Buy resale
  grid.querySelectorAll('.buy-resale-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const tokenId = btn.dataset.tokenId;
      const priceWei = btn.dataset.price;
      const success = await buyResaleTicket(tokenId, priceWei);
      if (success && onRefresh) onRefresh();
    });
  });

  // Cancel listing
  grid.querySelectorAll('.cancel-listing-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const tokenId = btn.dataset.tokenId;
      const success = await cancelListing(tokenId);
      if (success && onRefresh) onRefresh();
    });
  });
}

// ============================================================
// Helpers
// ============================================================
function comparePrices(listingPriceWei, originalPriceWei) {
  const listing = BigInt(listingPriceWei);
  const original = BigInt(originalPriceWei);
  if (listing > original) return 'price-up';
  if (listing < original) return 'price-down';
  return 'price-same';
}

function getPriceDiffLabel(listingPriceWei, originalPriceWei) {
  const listing = BigInt(listingPriceWei);
  const original = BigInt(originalPriceWei);

  if (original === 0n) return 'N/A';
  if (listing === original) return 'Same price';

  const diff = listing > original ? listing - original : original - listing;
  const percentBig = (diff * 10000n) / original;
  const percent = Number(percentBig) / 100;

  if (listing > original) {
    return `↑ ${percent.toFixed(1)}% above`;
  } else {
    return `↓ ${percent.toFixed(1)}% below`;
  }
}

function truncAddr(addr) {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

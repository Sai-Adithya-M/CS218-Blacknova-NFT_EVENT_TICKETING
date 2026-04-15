// tickets.js — View owned tickets, list for resale
import { ethers } from 'ethers';
import { getCurrentAccount } from './wallet.js';
import { getContract, getReadContract } from '../main.js';
import { showToast, showLoading, hideLoading } from '../main.js';

/**
 * Load all tickets owned by the current user
 */
export async function loadMyTickets() {
  const contract = getReadContract();
  const account = getCurrentAccount();
  if (!account) return [];

  const nextTokenId = await contract.nextTokenId();
  const tickets = [];

  for (let i = 1; i < Number(nextTokenId); i++) {
    try {
      const owner = await contract.ownerOf(i);
      if (owner.toLowerCase() === account.toLowerCase()) {
        const eventId = await contract.tokenToEvent(i);
        const evt = await contract.fetchEventData(eventId);
        const listing = await contract.getResaleListing(i);

        tickets.push({
          tokenId: i,
          eventId: Number(eventId),
          eventName: evt.name,
          originalPriceWei: evt.priceWei,
          royaltyBps: Number(evt.royaltyBps),
          isListed: listing.active,
          listingPrice: listing.active ? listing.priceWei : null,
        });
      }
    } catch (err) {
      // Token may not exist or ownerOf may revert; skip
    }
  }

  return tickets;
}

/**
 * List a ticket for resale
 */
export async function listForResale(tokenId, priceEth) {
  const contract = await getContract();
  const priceWei = ethers.parseEther(priceEth);

  showLoading('Listing ticket for resale...');
  try {
    const tx = await contract.listForResale(tokenId, priceWei);
    showLoading('Waiting for confirmation...');
    await tx.wait();
    showToast('Ticket listed for resale!', 'success');
    return true;
  } catch (err) {
    console.error('listForResale error:', err);
    showToast(err.reason || err.message || 'Failed to list ticket', 'error');
    return false;
  } finally {
    hideLoading();
  }
}

/**
 * Cancel a resale listing (also available from My Tickets)
 */
async function cancelListingFromTickets(tokenId) {
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
 * Render the user's tickets into the given container
 */
export function renderMyTickets(tickets, container, onRefresh) {
  container.innerHTML = '';

  if (tickets.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <span class="empty-icon">🎫</span>
        <p>You don't own any tickets yet</p>
        <p class="empty-sub">Head to Events to purchase one!</p>
      </div>
    `;
    return;
  }

  tickets.forEach((ticket) => {
    const card = document.createElement('div');

    if (ticket.isListed) {
      // ===== RESALE THEME =====
      const listingPriceEth = ethers.formatEther(ticket.listingPrice);
      const originalPriceEth = ethers.formatEther(ticket.originalPriceWei);
      const royaltyPercent = ticket.royaltyBps / 100;

      card.className = 'card ticket-card ticket-resale';
      card.innerHTML = `
        <div class="resale-banner">
          <span class="resale-banner-icon">🔄</span>
          <span>ON RESALE</span>
        </div>
        <div class="card-header">
          <h3 class="card-title">${escapeHtml(ticket.eventName)}</h3>
          <span class="card-badge badge-listed">LISTED</span>
        </div>
        <div class="card-body">
          <div class="card-stat">
            <span class="stat-label">Token ID</span>
            <span class="stat-value">#${ticket.tokenId}</span>
          </div>
          <div class="card-stat">
            <span class="stat-label">Event ID</span>
            <span class="stat-value">#${ticket.eventId}</span>
          </div>
          <div class="resale-price-box">
            <div class="resale-price-row">
              <span class="resale-price-label">Listing Price</span>
              <span class="resale-price-value">${listingPriceEth} ETH</span>
            </div>
            <div class="resale-price-detail">
              <span>Original: ${originalPriceEth} ETH</span>
              <span>Royalty: ${royaltyPercent}%</span>
            </div>
          </div>
          <div class="resale-status-bar">
            <span class="resale-pulse"></span>
            <span class="resale-status-text">Live on marketplace</span>
          </div>
        </div>
        <div class="card-footer">
          <button class="btn btn-danger cancel-listing-btn" data-token-id="${ticket.tokenId}">✕ Cancel Listing</button>
        </div>
      `;
    } else {
      // ===== NORMAL OWNED TICKET =====
      card.className = 'card ticket-card';
      card.innerHTML = `
        <div class="card-header">
          <h3 class="card-title">${escapeHtml(ticket.eventName)}</h3>
          <span class="card-badge badge-owned">OWNED</span>
        </div>
        <div class="card-body">
          <div class="card-stat">
            <span class="stat-label">Token ID</span>
            <span class="stat-value">#${ticket.tokenId}</span>
          </div>
          <div class="card-stat">
            <span class="stat-label">Event ID</span>
            <span class="stat-value">#${ticket.eventId}</span>
          </div>
        </div>
        <div class="card-footer resale-form-container">
          <div class="resale-form">
            <input type="number" step="0.001" min="0.001" placeholder="Price in ETH" class="input resale-price-input" id="resale-price-${ticket.tokenId}" />
            <button class="btn btn-accent list-resale-btn" data-token-id="${ticket.tokenId}">List for Resale</button>
          </div>
        </div>
      `;
    }

    container.appendChild(card);
  });

  // Attach list for resale listeners
  container.querySelectorAll('.list-resale-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const tokenId = btn.dataset.tokenId;
      const input = document.getElementById(`resale-price-${tokenId}`);
      const priceEth = input.value;

      if (!priceEth || parseFloat(priceEth) <= 0) {
        showToast('Please enter a valid price', 'error');
        return;
      }

      const success = await listForResale(tokenId, priceEth);
      if (success && onRefresh) {
        onRefresh();
      }
    });
  });

  // Attach cancel listing listeners
  container.querySelectorAll('.cancel-listing-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const tokenId = btn.dataset.tokenId;
      const success = await cancelListingFromTickets(tokenId);
      if (success && onRefresh) {
        onRefresh();
      }
    });
  });
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

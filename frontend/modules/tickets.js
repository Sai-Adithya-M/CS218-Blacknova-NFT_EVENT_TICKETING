// tickets.js — View owned tickets, list for resale
import { ethers } from 'ethers';
import { getCurrentAccount } from './wallet.js';
import { getContract, getReadContract } from '../main.js';
import { showToast, showLoading, hideLoading } from '../main.js';

/**
 * Load all tickets owned by the current user
 */
export async function fetchData() {
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
        const purchasePrice = await contract.getTokenPurchasePrice(i);

        tickets.push({
          tokenId: i,
          eventId: Number(eventId),
          eventName: evt.ipfsHash || `Event #${Number(eventId)}`,
          isListed: listing.active,
          listingPrice: listing.active ? listing.priceWei : null,
          purchasePrice: purchasePrice.toString(),
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
  // Contract stores resale price in gwei (uint48), so convert ETH -> gwei
  const priceWei = ethers.parseUnits(priceEth, 'gwei');

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
    card.className = 'card ticket-card';
    card.innerHTML = `
      <div class="card-header">
        <h3 class="card-title">${escapeHtml(ticket.eventName)}</h3>
        <span class="card-badge ${ticket.isListed ? 'badge-listed' : 'badge-owned'}">
          ${ticket.isListed ? '📢 LISTED' : '✅ OWNED'}
        </span>
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
        <div class="card-stat">
          <span class="stat-label">Purchase Price</span>
          <span class="stat-value">${ethers.formatEther(BigInt(ticket.purchasePrice) * BigInt(1e9))} ETH</span>
        </div>
        ${ticket.isListed ? `
          <div class="card-stat">
            <span class="stat-label">Listed Price</span>
            <span class="stat-value">${ethers.formatEther(BigInt(ticket.listingPrice) * BigInt(1e9))} ETH</span>
          </div>
        ` : ''}
      </div>
      ${!ticket.isListed ? `
        <div class="card-footer resale-form-container">
          <div class="resale-form">
            <input type="number" step="0.001" min="0.001" placeholder="Price in ETH" class="input resale-price-input" id="resale-price-${ticket.tokenId}" />
            <button class="btn btn-accent list-resale-btn" data-token-id="${ticket.tokenId}">List for Resale</button>
          </div>
        </div>
      ` : `
        <div class="card-footer">
          <span class="listed-info">Currently listed on marketplace</span>
        </div>
      `}
    `;
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
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

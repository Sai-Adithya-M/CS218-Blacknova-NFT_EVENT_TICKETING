// marketplace.js — Browse resale listings, buy resale, cancel listings
import { ethers } from 'ethers';
import { getCurrentAccount } from './wallet.js';
import { getContract, getReadContract } from '../main.js';
import { showToast, showLoading, hideLoading } from '../main.js';

/**
 * Load all active resale listings
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
        const evt = await contract.getEvent(eventId);
        listings.push({
          tokenId: i,
          seller: listing.seller,
          priceWei: listing.priceWei,
          eventName: evt.name,
          eventId: Number(eventId),
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
 * Render marketplace listings into the given container
 */
export function renderMarketplace(listings, container, onRefresh) {
  container.innerHTML = '';

  if (listings.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <span class="empty-icon">🛒</span>
        <p>No tickets listed for resale</p>
        <p class="empty-sub">Check back later or list your own!</p>
      </div>
    `;
    return;
  }

  const account = getCurrentAccount();

  listings.forEach((listing) => {
    const priceEth = ethers.formatEther(listing.priceWei);
    const isSeller = account && listing.seller.toLowerCase() === account.toLowerCase();

    const card = document.createElement('div');
    card.className = 'card marketplace-card';
    card.innerHTML = `
      <div class="card-header">
        <h3 class="card-title">${escapeHtml(listing.eventName)}</h3>
        <span class="card-badge badge-resale">RESALE</span>
      </div>
      <div class="card-body">
        <div class="card-stat">
          <span class="stat-label">Token ID</span>
          <span class="stat-value">#${listing.tokenId}</span>
        </div>
        <div class="card-stat">
          <span class="stat-label">Price</span>
          <span class="stat-value price-highlight">${priceEth} ETH</span>
        </div>
        <div class="card-stat">
          <span class="stat-label">Seller</span>
          <span class="stat-value address-text">${isSeller ? 'You' : truncAddr(listing.seller)}</span>
        </div>
      </div>
      <div class="card-footer">
        ${isSeller 
          ? `<button class="btn btn-danger cancel-listing-btn" data-token-id="${listing.tokenId}">Cancel Listing</button>`
          : `<button class="btn btn-primary buy-resale-btn" data-token-id="${listing.tokenId}" data-price="${listing.priceWei}">Buy — ${priceEth} ETH</button>`
        }
      </div>
    `;
    container.appendChild(card);
  });

  // Attach buy resale listeners
  container.querySelectorAll('.buy-resale-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const tokenId = btn.dataset.tokenId;
      const priceWei = btn.dataset.price;
      const success = await buyResaleTicket(tokenId, priceWei);
      if (success && onRefresh) onRefresh();
    });
  });

  // Attach cancel listing listeners
  container.querySelectorAll('.cancel-listing-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const tokenId = btn.dataset.tokenId;
      const success = await cancelListing(tokenId);
      if (success && onRefresh) onRefresh();
    });
  });
}

function truncAddr(addr) {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// events.js — Create & view events, buy tickets
import { ethers } from 'ethers';
import { getSigner, getProvider, getCurrentAccount } from './wallet.js';
import { getContract, getReadContract } from '../main.js';
import { showToast, showLoading, hideLoading } from '../main.js';

/**
 * Create a new event on the contract
 */
export async function createEvent(name, maxTickets, priceEth, royaltyPercent) {
  const contract = await getContract();
  const priceWei = ethers.parseEther(priceEth);
  const royaltyBps = Math.round(royaltyPercent * 100); // e.g., 5% -> 500 bps

  showLoading('Creating event on blockchain...');
  try {
    const tx = await contract.createEvent(name, maxTickets, priceWei, royaltyBps);
    showLoading('Waiting for confirmation...');
    await tx.wait();
    showToast('Event created successfully!', 'success');
    return true;
  } catch (err) {
    console.error('createEvent error:', err);
    showToast(err.reason || err.message || 'Failed to create event', 'error');
    return false;
  } finally {
    hideLoading();
  }
}

/**
 * Load all events from the contract
 */
export async function loadEvents() {
  const contract = getReadContract();
  const nextEventId = await contract.nextEventId();
  const events = [];

  for (let i = 1; i < Number(nextEventId); i++) {
    try {
      const evt = await contract.fetchEventData(i);
      if (evt.exists) {
        events.push({
          id: i,
          name: evt.name,
          maxTickets: Number(evt.maxTickets),
          priceWei: evt.priceWei,
          ticketsSold: Number(evt.ticketsSold),
          organiser: evt.organiser,
          royaltyBps: Number(evt.royaltyBps),
        });
      }
    } catch (err) {
      console.error(`Error loading event ${i}:`, err);
    }
  }

  return events;
}

/**
 * Buy a ticket for an event
 */
export async function buyTicket(eventId, priceWei) {
  const contract = await getContract();

  showLoading('Purchasing ticket...');
  try {
    const tx = await contract.buyTicket(eventId, { value: priceWei });
    showLoading('Waiting for confirmation...');
    await tx.wait();
    showToast('Ticket purchased successfully! 🎉', 'success');
    return true;
  } catch (err) {
    console.error('buyTicket error:', err);
    showToast(err.reason || err.message || 'Failed to buy ticket', 'error');
    return false;
  } finally {
    hideLoading();
  }
}

/**
 * Render events list into the given container
 */
export function renderEvents(events, container, isDashboard = false) {
  container.innerHTML = '';

  if (events.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <span class="empty-icon">🎪</span>
        <p>No events created yet</p>
        <p class="empty-sub">Be the first to create an event!</p>
      </div>
    `;
    return;
  }

  events.forEach((evt) => {
    const priceEth = ethers.formatEther(evt.priceWei);
    const soldOut = evt.ticketsSold >= evt.maxTickets;
    const progress = (evt.ticketsSold / evt.maxTickets) * 100;
    const account = getCurrentAccount();
    const isOrganiser = account && evt.organiser.toLowerCase() === account.toLowerCase();

    const card = document.createElement('div');
    card.className = 'card event-card';
    let extraStatsHtml = '';
    let footerHtml = '';

    if (isDashboard) {
      // Dashboard view: show generated revenue instead of organiser
      const revenueEth = (evt.ticketsSold * parseFloat(priceEth)).toFixed(4);
      extraStatsHtml = `
        <div class="card-stat organiser-row">
          <span class="stat-label">Total Revenue</span>
          <span class="stat-value" style="color: var(--primary); font-weight: bold;">${revenueEth} ETH</span>
        </div>
      `;
      footerHtml = `
      <div class="card-footer">
        <div class="btn btn-disabled" style="width: 100%; text-align: center; background: var(--bg-secondary);">⭐ Your Event</div>
      </div>
      `;
    } else {
      // Public view: show organiser and buy button
      extraStatsHtml = `
        <div class="card-stat organiser-row">
          <span class="stat-label">Organiser</span>
          <span class="stat-value address-text">${isOrganiser ? 'You' : truncAddr(evt.organiser)}</span>
        </div>
      `;
      footerHtml = `
      <div class="card-footer">
        ${!soldOut ? `<button class="btn btn-primary buy-ticket-btn" data-event-id="${evt.id}" data-price="${evt.priceWei.toString()}">Buy Ticket — ${priceEth} ETH</button>` : `<button class="btn btn-disabled" disabled>Sold Out</button>`}
      </div>
      `;
    }

    card.innerHTML = `
      <div class="card-header">
        <h3 class="card-title">${escapeHtml(evt.name)}</h3>
        <span class="card-badge ${soldOut ? 'badge-sold-out' : 'badge-available'}">
          ${soldOut ? 'SOLD OUT' : 'AVAILABLE'}
        </span>
      </div>
      <div class="card-body">
        <div class="card-stat">
          <span class="stat-label">Price</span>
          <span class="stat-value">${priceEth} ETH</span>
        </div>
        <div class="card-stat">
          <span class="stat-label">Tickets</span>
          <span class="stat-value">${evt.ticketsSold} / ${evt.maxTickets}</span>
        </div>
        <div class="card-stat">
          <span class="stat-label">Royalty</span>
          <span class="stat-value">${evt.royaltyBps / 100}%</span>
        </div>
        <div class="progress-bar">
          <div class="progress-fill" style="width: ${progress}%"></div>
        </div>
        ${extraStatsHtml}
      </div>
      ${footerHtml}

      </div>
      ${footerHtml}
    `;
    container.appendChild(card);
  });

  // Attach buy listeners
  container.querySelectorAll('.buy-ticket-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const eventId = Number(btn.dataset.eventId); // dataset is always a string; contract expects uint256
      const priceWei = BigInt(btn.dataset.price);  // ethers v6 requires BigInt for value field
      const success = await buyTicket(eventId, priceWei);
      if (success) {
        // Refresh events
        const updatedEvents = await loadEvents();
        renderEvents(updatedEvents, container);
      }
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

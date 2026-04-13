import React from 'react';
import { useTicketStore } from '../store/useTicketStore';
import { useEventStore } from '../store/useEventStore';
import { useAuthStore } from '../store/useAuthStore';
import { Ticket, Share2, Ban } from 'lucide-react';

export const MyTickets: React.FC = () => {
  const { tickets, listForResale, cancelResale } = useTicketStore();
  const { events } = useEventStore();
  const { user } = useAuthStore();

  if (!user) return null;

  const myTickets = tickets.filter(t => t.ownerId === user.id);

  const handleResale = (ticketId: string) => {
    const priceStr = prompt("Enter resale price ($):");
    if (priceStr) {
      const price = parseFloat(priceStr);
      if (!isNaN(price) && price > 0) {
        listForResale(ticketId, price);
        alert(`Ticket listed for resale at $${price.toFixed(2)}`);
      }
    }
  };

  const copyToClipboard = (link: string) => {
    navigator.clipboard.writeText(link);
    alert('Resale link copied to clipboard!');
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 style={{ fontSize: '2rem', margin: 0 }}>My Tickets</h1>
          <p className="text-muted">Manage your tickets and resales.</p>
        </div>
      </div>

      <div style={{ display: 'grid', gap: '1rem' }}>
        {myTickets.map(ticket => {
          const event = events.find(e => e.id === ticket.eventId);
          if (!event) return null;
          const date = new Date(event.date);

          return (
            <div key={ticket.id} className="glass" style={{ padding: '1.5rem', borderRadius: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'center' }}>
                <div style={{ background: 'rgba(140, 59, 254, 0.1)', padding: '1rem', borderRadius: '8px', color: 'var(--accent-primary)' }}>
                  <Ticket size={32} />
                </div>
                <div>
                  <h3 style={{ fontSize: '1.2rem', marginBottom: '0.25rem' }}>{event.title}</h3>
                  <div className="text-muted" style={{ fontSize: '0.9rem', marginBottom: '0.5rem' }}>
                    {date.toLocaleDateString()} at {date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})} • {event.location}
                  </div>
                  <div className={`ticket-status status-${ticket.status}`} style={{ display: 'inline-block' }}>
                    {ticket.status}
                  </div>
                </div>
              </div>

              {ticket.status === 'active' && (
                <button className="btn btn-outline" onClick={() => handleResale(ticket.id)}>
                  <Share2 size={16} /> Resell Ticket
                </button>
              )}

              {ticket.status === 'resale' && (
                <div style={{ textAlign: 'right' }}>
                  <div className="text-accent" style={{ fontWeight: 600, marginBottom: '0.5rem' }}>
                    Listed for ${ticket.resalePrice?.toFixed(2)}
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button className="btn btn-primary" style={{ padding: '0.5rem 1rem', fontSize: '0.85rem' }} onClick={() => copyToClipboard(ticket.resaleLink || '')}>
                      Copy Link
                    </button>
                    <button className="btn btn-danger" style={{ padding: '0.5rem 1rem', fontSize: '0.85rem' }} onClick={() => cancelResale(ticket.id)}>
                      <Ban size={16} /> Cancel Resale
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
        {myTickets.length === 0 && (
          <p className="text-muted">You have no tickets currently.</p>
        )}
      </div>
    </div>
  );
};

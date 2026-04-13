import React, { useState } from 'react';
import { useEventStore } from '../store/useEventStore';
import { useTicketStore } from '../store/useTicketStore';
import { useAuthStore } from '../store/useAuthStore';
import { MapPin, Calendar, Clock, Image as ImageIcon } from 'lucide-react';

export const BrowseEvents: React.FC = () => {
  const { events } = useEventStore();
  const { buyTicket } = useTicketStore();
  const { user, updateWallet } = useAuthStore();
  const [purchasingId, setPurchasingId] = useState<string | null>(null);

  const activeEvents = events.filter(e => e.status === 'active');

  const handleBuy = (eventId: string, price: number) => {
    if (!user) return;
    
    if (user.walletBalance < price) {
      alert("Insufficient Balance in Wallet!");
      return;
    }

    setPurchasingId(eventId);
    // Simulate API call
    setTimeout(() => {
      updateWallet(-price);
      buyTicket(eventId, user.id);
      setPurchasingId(null);
      alert("Ticket Purchased Successfully!");
    }, 800);
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 style={{ fontSize: '2rem', margin: 0 }}>Browse Events</h1>
          <p className="text-muted">Discover and book the best experiences.</p>
        </div>
      </div>

      <div className="event-grid">
        {activeEvents.map(event => {
          const date = new Date(event.date);
          return (
            <div key={event.id} className="event-card glass">
              <div className="event-image-placeholder">
                <ImageIcon size={48} opacity={0.2} />
              </div>
              <div className="event-details">
                <h3 className="event-title">{event.title}</h3>
                <p className="text-muted" style={{ fontSize: '0.9rem', marginBottom: '1rem', height: '40px', overflow: 'hidden' }}>
                  {event.description}
                </p>
                
                <div className="event-meta">
                  <div className="event-meta-item">
                    <Calendar size={14} className="text-accent" />
                    <span>{date.toLocaleDateString()}</span>
                  </div>
                  <div className="event-meta-item">
                    <Clock size={14} className="text-accent" />
                    <span>{date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                  </div>
                </div>
                
                <div className="event-meta">
                  <div className="event-meta-item">
                    <MapPin size={14} className="text-accent" />
                    <span>{event.location}</span>
                  </div>
                </div>

                <div className="event-footer">
                  <div className="event-price">${event.price.toFixed(2)}</div>
                  <button 
                    className="btn btn-primary"
                    onClick={() => handleBuy(event.id, event.price)}
                    disabled={purchasingId === event.id}
                  >
                    {purchasingId === event.id ? 'Processing...' : 'Buy Ticket'}
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

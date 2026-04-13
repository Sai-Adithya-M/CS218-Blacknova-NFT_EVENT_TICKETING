import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useEventStore } from '../store/useEventStore';
import { useAuthStore } from '../store/useAuthStore';
import { MapPin, Calendar, Clock, Image as ImageIcon, Sparkles, User, PlusCircle } from 'lucide-react';

export const Home: React.FC = () => {
  const { events } = useEventStore();
  const { isAuthenticated } = useAuthStore();
  const navigate = useNavigate();

  const activeEvents = events.filter(e => e.status === 'active');

  return (
    <div className="home-page" style={{ minHeight: '100vh', background: 'var(--bg-main)' }}>
      {/* Public Header */}
      <header style={{ padding: '1.5rem 3rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-light)', background: 'var(--bg-panel)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1.5rem', fontWeight: 700 }}>
          <Sparkles className="text-accent" size={24} />
          <span><span className="text-accent">Black</span>Nova</span>
        </div>
        
        <div style={{ display: 'flex', gap: '1rem' }}>
          {isAuthenticated ? (
            <button className="btn btn-primary" onClick={() => navigate('/dashboard')}>
              Go to Dashboard
            </button>
          ) : (
            <>
              <button className="btn btn-outline" onClick={() => navigate('/login?role=buyer')}>
                <User size={18} /> Login
              </button>
              <button className="btn btn-primary" onClick={() => navigate('/login?role=organizer')}>
                <PlusCircle size={18} /> Create Event
              </button>
            </>
          )}
        </div>
      </header>

      {/* Main Content */}
      <main className="page-container">
        <div style={{ textAlign: 'center', margin: '3rem 0 4rem' }}>
          <h1 className="text-gradient" style={{ fontSize: '3rem', marginBottom: '1rem' }}>Immerse in the Future</h1>
          <p className="text-muted" style={{ fontSize: '1.25rem' }}>Browse and book phenomenal events built on the BlackNova network.</p>
        </div>

        <h2 style={{ fontSize: '1.5rem', marginBottom: '1.5rem' }}>Upcoming Highlights</h2>

        <div className="event-grid">
          {activeEvents.map(event => {
            const date = new Date(event.date);
            return (
              <div key={event.id} className="event-card glass">
                <div className="event-image-placeholder" style={{ height: '220px' }}>
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
                      onClick={() => navigate('/login?role=buyer')}
                    >
                      Book Now
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </main>
    </div>
  );
};

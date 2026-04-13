import React from 'react';
import { useAuthStore } from '../store/useAuthStore';
import { useEventStore } from '../store/useEventStore';
import { useTicketStore } from '../store/useTicketStore';
import { Ticket, CalendarDays, TrendingUp, Wallet } from 'lucide-react';

export const Dashboard: React.FC = () => {
  const { user } = useAuthStore();
  const { events } = useEventStore();
  const { tickets } = useTicketStore();

  if (!user) return null;

  // Derived stats based on role
  const userTickets = tickets.filter(t => t.ownerId === user.id);
  const activeTickets = userTickets.filter(t => t.status === 'active' || t.status === 'resale');
  
  const userEvents = events.filter(e => e.organizerId === user.id);
  const activeEvents = userEvents.filter(e => e.status === 'active');
  const pastEvents = userEvents.filter(e => e.status === 'past');

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 style={{ fontSize: '2rem', margin: 0 }}>Dashboard</h1>
          <p className="text-muted">Welcome back, {user.name}</p>
        </div>
      </div>

      <div className="dashboard-grid">
        <div className="stat-card glass">
          <Wallet className="stat-icon" size={24} />
          <div className="stat-value">${user.walletBalance.toFixed(2)}</div>
          <div className="stat-label">Available Balance</div>
        </div>

        {user.role === 'buyer' && (
          <>
            <div className="stat-card glass">
              <Ticket className="stat-icon" size={24} />
              <div className="stat-value">{activeTickets.length}</div>
              <div className="stat-label">Active Tickets</div>
            </div>
            <div className="stat-card glass">
              <TrendingUp className="stat-icon" size={24} />
              <div className="stat-value">{userTickets.filter(t => t.status === 'resale').length}</div>
              <div className="stat-label">Tickets on Resale</div>
            </div>
          </>
        )}

        {user.role === 'organizer' && (
          <>
            <div className="stat-card glass">
              <CalendarDays className="stat-icon" size={24} />
              <div className="stat-value">{activeEvents.length}</div>
              <div className="stat-label">Active Events</div>
            </div>
            <div className="stat-card glass">
              <TrendingUp className="stat-icon" size={24} />
              <div className="stat-value">{pastEvents.length}</div>
              <div className="stat-label">Past Events</div>
            </div>
          </>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '2rem' }}>
        <div className="glass" style={{ padding: '2rem', borderRadius: '12px' }}>
          <h2 style={{ marginBottom: '1.5rem', fontSize: '1.25rem' }}>Recent Activity</h2>
          {user.role === 'buyer' ? (
            userTickets.length > 0 ? (
              <div className="ticket-list">
                {userTickets.slice(0, 3).map(ticket => {
                  const event = events.find(e => e.id === ticket.eventId);
                  if (!event) return null;
                  const date = new Date(event.date);
                  return (
                    <div key={ticket.id} className="ticket-item glass" style={{ background: 'rgba(0,0,0,0.2)' }}>
                      <div className="ticket-info">
                        <div className="ticket-date-block">
                          <div className="ticket-date-month">{date.toLocaleString('default', { month: 'short' })}</div>
                          <div className="ticket-date-day">{date.getDate()}</div>
                        </div>
                        <div>
                          <div style={{ fontWeight: 600, fontSize: '1.1rem' }}>{event.title}</div>
                          <div className="text-muted" style={{ fontSize: '0.85rem' }}>Ticket ID: {ticket.id}</div>
                        </div>
                      </div>
                      <div className={`ticket-status status-${ticket.status}`}>
                        {ticket.status}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-muted">No tickets found. Time to browse some events!</p>
            )
          ) : (
            userEvents.length > 0 ? (
                 <div className="ticket-list">
                 {userEvents.slice(0, 3).map(event => {
                   const date = new Date(event.date);
                   return (
                     <div key={event.id} className="ticket-item glass" style={{ background: 'rgba(0,0,0,0.2)' }}>
                       <div className="ticket-info">
                         <div className="ticket-date-block">
                           <div className="ticket-date-month">{date.toLocaleString('default', { month: 'short' })}</div>
                           <div className="ticket-date-day">{date.getDate()}</div>
                         </div>
                         <div>
                           <div style={{ fontWeight: 600, fontSize: '1.1rem' }}>{event.title}</div>
                           <div className="text-muted" style={{ fontSize: '0.85rem' }}>{event.location}</div>
                         </div>
                       </div>
                       <div className={`ticket-status status-${event.status}`}>
                         {event.status}
                       </div>
                     </div>
                   );
                 })}
               </div>
            ) : (
              <p className="text-muted">No events created yet.</p>
            )
          )}
        </div>
      </div>
    </div>
  );
};

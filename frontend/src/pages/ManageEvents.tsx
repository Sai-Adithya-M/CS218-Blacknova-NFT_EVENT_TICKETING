import React, { useState } from 'react';
import { useEventStore } from '../store/useEventStore';
import { useAuthStore } from '../store/useAuthStore';
import { Calendar, MapPin, DollarSign, Plus } from 'lucide-react';

export const ManageEvents: React.FC = () => {
  const { events, createEvent } = useEventStore();
  const { user } = useAuthStore();
  const [isCreating, setIsCreating] = useState(false);
  
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    date: '',
    price: '',
    location: ''
  });

  const myEvents = events.filter(e => e.organizerId === user?.id);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    
    createEvent({
      title: formData.title,
      description: formData.description,
      date: new Date(formData.date).toISOString(),
      price: parseFloat(formData.price),
      location: formData.location,
      organizerId: user.id
    });
    
    setIsCreating(false);
    setFormData({ title: '', description: '', date: '', price: '', location: '' });
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 style={{ fontSize: '2rem', margin: 0 }}>Manage Events</h1>
          <p className="text-muted">Create and manage your organized events.</p>
        </div>
        <button className="btn btn-primary" onClick={() => setIsCreating(!isCreating)}>
          <Plus size={18} /> {isCreating ? 'View Events' : 'Create New Event'}
        </button>
      </div>

      {isCreating ? (
        <div className="glass" style={{ padding: '2rem', borderRadius: '16px', maxWidth: '600px', margin: '0 auto' }}>
          <h2 style={{ marginBottom: '1.5rem' }}>Create New Event</h2>
          <form onSubmit={handleSubmit}>
            <div className="input-group">
              <label className="input-label">Event Title</label>
              <input 
                required 
                className="input-field" 
                value={formData.title}
                onChange={e => setFormData({...formData, title: e.target.value})}
              />
            </div>
            
            <div className="input-group">
              <label className="input-label">Description</label>
              <textarea 
                required 
                rows={3}
                className="input-field" 
                value={formData.description}
                onChange={e => setFormData({...formData, description: e.target.value})}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div className="input-group">
                <label className="input-label">Date & Time</label>
                <input 
                  type="datetime-local" 
                  required 
                  className="input-field" 
                  value={formData.date}
                  onChange={e => setFormData({...formData, date: e.target.value})}
                />
              </div>
              <div className="input-group">
                <label className="input-label">Ticket Price ($)</label>
                <div style={{ position: 'relative' }}>
                  <DollarSign size={16} style={{ position: 'absolute', left: '10px', top: '12px', color: 'var(--text-muted)' }} />
                  <input 
                    type="number" 
                    step="0.01"
                    min="0"
                    required 
                    className="input-field" 
                    style={{ paddingLeft: '2rem', width: '100%' }}
                    value={formData.price}
                    onChange={e => setFormData({...formData, price: e.target.value})}
                  />
                </div>
              </div>
            </div>

            <div className="input-group">
              <label className="input-label">Location</label>
              <input 
                required 
                className="input-field" 
                value={formData.location}
                onChange={e => setFormData({...formData, location: e.target.value})}
              />
            </div>
            
            <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: '1rem' }}>
              Launch Event
            </button>
          </form>
        </div>
      ) : (
        <div className="event-grid">
          {myEvents.map(event => {
            const date = new Date(event.date);
            return (
              <div key={event.id} className="event-card glass">
                <div className="event-details">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <h3 className="event-title">{event.title}</h3>
                    <div className={`ticket-status status-${event.status}`}>
                      {event.status}
                    </div>
                  </div>
                  <p className="text-muted" style={{ fontSize: '0.9rem', marginBottom: '1rem' }}>{event.description}</p>
                  
                  <div className="event-meta">
                    <div className="event-meta-item">
                      <Calendar size={14} className="text-accent" />
                      <span>{date.toLocaleDateString()}</span>
                    </div>
                    <div className="event-meta-item">
                      <MapPin size={14} className="text-accent" />
                      <span>{event.location}</span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
          {myEvents.length === 0 && (
            <p className="text-muted">You haven't created any events yet.</p>
          )}
        </div>
      )}
    </div>
  );
};

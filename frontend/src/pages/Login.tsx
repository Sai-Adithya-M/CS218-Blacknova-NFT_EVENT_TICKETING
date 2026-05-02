import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../store/useAuthStore';

type UserRole = 'buyer' | 'organizer';
import { Store, Ticket, CalendarDays } from 'lucide-react';

export const Login: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const login = useAuthStore((state) => state.login);
  
  const [roleSelect, setRoleSelect] = useState<UserRole>('buyer');

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const roleParam = params.get('role');
    if (roleParam === 'organizer' || roleParam === 'buyer') {
      setRoleSelect(roleParam);
    }
  }, [location]);

  const onMockLogin = () => {
    login({
      id: `mock_${Date.now()}`,
      name: roleSelect === 'buyer' ? 'Alex (Buyer)' : 'Sarah (Organizer)',
      email: `${roleSelect}@nova.io`,
      role: roleSelect
    });
    navigate('/dashboard');
  };

  return (
    <div className="auth-page">
      <div className="auth-blob"></div>
      
      <div className="auth-card glass" style={{ maxWidth: '540px' }}>
        <div className="auth-logo">
          <Store className="text-accent" size={32} />
          <span><span className="text-accent">NET</span>IX</span>
        </div>
        
        <h1 style={{ fontSize: '1.75rem', marginBottom: '0.5rem' }}>Welcome to the Future</h1>
        <p className="text-muted" style={{ marginBottom: '2rem' }}>Connect your MetaMask wallet to manage your immersive event experiences.</p>
        
        <div className="input-group" style={{ marginBottom: '2rem', textAlign: 'left' }}>
          <label className="input-label" style={{ marginBottom: '1rem', display: 'block', textAlign: 'center' }}>How do you want to use NETIX?</label>
          <div className="role-grid">
            <div 
              className={`role-box ${roleSelect === 'buyer' ? 'active' : ''}`}
              onClick={() => setRoleSelect('buyer')}
            >
              <Ticket size={32} />
              <div style={{ fontWeight: 600, fontSize: '1.1rem' }}>Buy Tickets</div>
              <div style={{ fontSize: '0.85rem', textAlign: 'center' }}>Browse and attend events globally</div>
            </div>
            
            <div 
              className={`role-box ${roleSelect === 'organizer' ? 'active' : ''}`}
              onClick={() => setRoleSelect('organizer')}
            >
              <CalendarDays size={32} />
              <div style={{ fontWeight: 600, fontSize: '1.1rem' }}>Organize</div>
              <div style={{ fontSize: '0.85rem', textAlign: 'center' }}>Create and manage your own events</div>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', alignItems: 'center' }}>
          {/* Mock Login button for dev/testing */}
          <button 
            className="btn btn-outline" 
            style={{ width: '100%' }}
            onClick={onMockLogin}
          >
            Developer Mock Login ({roleSelect === 'buyer' ? 'Buyer' : 'Organizer'})
          </button>
        </div>
      </div>
    </div>
  );
};

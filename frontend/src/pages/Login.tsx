import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../store/useAuthStore';

type UserRole = 'buyer' | 'organizer';
import { GoogleLogin } from '@react-oauth/google';
import { jwtDecode } from "jwt-decode";
import { Sparkles, Ticket, CalendarDays } from 'lucide-react';

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

  const onGoogleSuccess = (credentialResponse: any) => {
    if (credentialResponse.credential) {
      const decoded: any = jwtDecode(credentialResponse.credential);
      login({
        id: decoded.sub,
        name: decoded.name || 'Google User',
        email: decoded.email,
        role: roleSelect
      });
      navigate('/dashboard');
    }
  };

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
          <Sparkles className="text-accent" size={32} />
          <span><span className="text-accent">Nex</span>ting</span>
        </div>
        
        <h1 style={{ fontSize: '1.75rem', marginBottom: '0.5rem' }}>Welcome to the Future</h1>
        <p className="text-muted" style={{ marginBottom: '2rem' }}>Sign in to manage your immersive event experiences.</p>
        
        <div className="input-group" style={{ marginBottom: '2rem', textAlign: 'left' }}>
          <label className="input-label" style={{ marginBottom: '1rem', display: 'block', textAlign: 'center' }}>How do you want to use Nexting?</label>
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
          {/* Actual Google Button */}
          <div style={{ width: '100%', display: 'flex', justifyContent: 'center' }}>
            <GoogleLogin
              onSuccess={onGoogleSuccess}
              onError={() => {
                console.log('Login Failed');
              }}
              shape="pill"
              theme="filled_black"
            />
          </div>
          
          <div style={{ width: '100%', position: 'relative', margin: '1rem 0' }}>
            <hr style={{ border: 'none', borderTop: '1px solid var(--border-light)' }} />
            <span style={{ position: 'absolute', top: '-10px', left: '50%', transform: 'translateX(-50%)', background: 'var(--bg-card)', padding: '0 10px', fontSize: '0.85rem', color: 'var(--text-muted)' }}>OR</span>
          </div>

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

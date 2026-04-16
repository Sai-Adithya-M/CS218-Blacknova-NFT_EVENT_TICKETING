import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Home, Ticket, CalendarDays, Wallet, PlusCircle, LogOut } from 'lucide-react';
import { useAuthStore } from '../../store/useAuthStore';

export const Sidebar: React.FC = () => {
  const location = useLocation();
  const { user, logout } = useAuthStore();
  
  if (!user) return null;

  return (
    <div className="sidebar">
      <div className="sidebar-logo">
        <span className="text-accent">Black</span>Nova
      </div>
      
      <div className="sidebar-nav">
        <Link to="/dashboard" className={`nav-item ${location.pathname === '/dashboard' ? 'active' : ''}`}>
          <Home size={20} /> Dashboard
        </Link>
        
        {user.role === 'buyer' ? (
          <>
            <Link to="/events" className={`nav-item ${location.pathname === '/events' ? 'active' : ''}`}>
              <CalendarDays size={20} /> Browse Events
            </Link>
            <Link to="/tickets" className={`nav-item ${location.pathname === '/tickets' ? 'active' : ''}`}>
              <Ticket size={20} /> My Tickets
            </Link>
          </>
        ) : (
          <>
            <Link to="/manage" className={`nav-item ${location.pathname === '/manage' ? 'active' : ''}`}>
              <CalendarDays size={20} /> Manage Events
            </Link>
            <Link to="/manage/create" className={`nav-item ${location.pathname === '/manage/create' ? 'active' : ''}`}>
              <PlusCircle size={20} /> Create Event
            </Link>
          </>
        )}
        
        <Link to="/wallet" className={`nav-item ${location.pathname === '/wallet' ? 'active' : ''}`}>
          <Wallet size={20} /> Wallet
        </Link>
      </div>

      <div className="sidebar-footer">
        <div className="nav-item" style={{cursor: 'pointer'}} onClick={logout}>
          <LogOut size={20} /> Logout
        </div>
      </div>
    </div>
  );
};

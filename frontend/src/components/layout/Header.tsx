import React from 'react';
import { useAuthStore } from '../../store/useAuthStore';
import { Wallet } from 'lucide-react';

export const Header: React.FC = () => {
  const { user } = useAuthStore();
  
  if (!user) return null;
  
  // Format balance to ETH
  const formattedBalance = `${user.walletBalance.toFixed(4)} ETH`;

  return (
    <header className="top-header">
      <div className="header-search">
        {/* Placeholder for future global search if needed */}
      </div>
      <div className="header-user">
        <div className="btn btn-outline" style={{ border: 'none', background: 'rgba(255,255,255,0.05)', fontSize: '0.85rem' }}>
          <Wallet size={16} className="text-accent" /> 
          <span style={{ fontWeight: 600 }}>{formattedBalance}</span>
        </div>
        
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', marginLeft: '10px' }}>
          <span style={{ fontSize: '0.9rem', fontWeight: 600 }}>{user.name}</span>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'capitalize' }}>{user.role}</span>
        </div>
        <div className="user-avatar">
          {user.name.charAt(0).toUpperCase()}
        </div>
      </div>
    </header>
  );
};

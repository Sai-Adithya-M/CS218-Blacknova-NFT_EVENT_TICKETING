import React from 'react';
import { useAuthStore } from '../store/useAuthStore';
import { Wallet as WalletIcon, ArrowUpRight, ArrowDownLeft } from 'lucide-react';

export const Wallet: React.FC = () => {
  const { user } = useAuthStore();

  if (!user) return null;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 style={{ fontSize: '2rem', margin: 0 }}>Wallet</h1>
          <p className="text-muted">Manage your funds and transactions.</p>
        </div>
      </div>

      <div className="glass" style={{ padding: '3rem', borderRadius: '16px', textAlign: 'center', maxWidth: '500px', margin: '0 auto 2rem' }}>
        <div style={{ display: 'inline-flex', padding: '1rem', background: 'rgba(140, 59, 254, 0.1)', borderRadius: '50%', marginBottom: '1.5rem' }}>
          <WalletIcon size={48} className="text-accent" />
        </div>
        <div className="text-muted" style={{ marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '2px', fontSize: '0.85rem' }}>Total Balance</div>
        <div style={{ fontSize: '3.5rem', fontWeight: 700, margin: '0 0 2rem' }}>
          ${user.walletBalance.toFixed(2)}
        </div>

        <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
          <button className="btn btn-primary">
            <ArrowDownLeft size={18} /> Deposit Funds
          </button>
          <button className="btn btn-outline">
            <ArrowUpRight size={18} /> Withdraw
          </button>
        </div>
      </div>

      <div style={{ maxWidth: '800px', margin: '0 auto' }}>
        <h3 style={{ marginBottom: '1rem' }}>Transaction History</h3>
        <div className="glass" style={{ padding: '2rem', borderRadius: '12px' }}>
          <p className="text-muted" style={{ textAlign: 'center' }}>No recent transactions found.</p>
          {/* Note: A real app would map over a transactions array here */}
        </div>
      </div>
    </div>
  );
};

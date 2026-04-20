import React, { useEffect, useState } from 'react';
import { useAuthStore } from '../store/useAuthStore';
import { useTicketStore } from '../store/useTicketStore';
import { useEventStore } from '../store/useEventStore';
import { Wallet as WalletIcon, ArrowUpRight, ArrowDownLeft, Activity, Zap, ShieldCheck } from 'lucide-react';
import { motion } from 'framer-motion';
import { AuthFallback } from '../components/ui/AuthFallback';
import { ethers } from 'ethers';

export const Wallet: React.FC = () => {
  const { user, setBalance } = useAuthStore();
  const { tickets } = useTicketStore();
  const { events } = useEventStore();
  const [gasEstimate, setGasEstimate] = useState<string>('--');
  const [realBalance, setRealBalance] = useState<number>(user?.walletBalance || 0);

  useEffect(() => {
    let mounted = true;
    const fetchBlockchainData = async () => {
      try {
        if ((window as any).ethereum && user?.walletAddress) {
          const provider = new ethers.BrowserProvider((window as any).ethereum);
          
          // Fetch Gas
          const feeData = await provider.getFeeData();
          if (feeData.gasPrice && mounted) {
            setGasEstimate(ethers.formatUnits(feeData.gasPrice, 'gwei').split('.')[0]);
          }

          // Fetch real balance
          const balanceWei = await provider.getBalance(user.walletAddress);
          const balanceEth = parseFloat(ethers.formatEther(balanceWei));
          if (mounted) {
            setRealBalance(balanceEth);
            setBalance(balanceEth); // Sync with store
          }
        }
      } catch (e) {
        console.error("Wallet fetch error:", e);
      }
    };

    fetchBlockchainData();
    const interval = setInterval(fetchBlockchainData, 10000); // More frequent updates
    return () => { mounted = false; clearInterval(interval); };
  }, [user?.walletAddress, setBalance]);

  if (!user) return <AuthFallback />;

  const userTickets = tickets.filter(t => t.ownerId?.toLowerCase() === user.id?.toLowerCase());
  const userEvents = events.filter(e => e.organizerId?.toLowerCase() === user.id?.toLowerCase());

  const transactions = user.role === 'buyer' 
    ? userTickets.map(t => ({
        id: t.id,
        type: 'NFT Ticket Purchase',
        amount: `-${t.tierPrice.toFixed(4)} ETH`,
        date: new Date(t.purchasedAt).toLocaleDateString(),
        status: 'CONFIRMED',
        isNegative: true,
      }))
    : userEvents.map(e => ({
        id: e.id,
        type: 'Event Deployment',
        amount: '0.0000 ETH',
        date: new Date(e.date).toLocaleDateString(),
        status: 'CONFIRMED',
        isNegative: true,
      }));

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: { opacity: 1, transition: { staggerChildren: 0.1 } }
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.5 } }
  };

  return (
    <motion.div 
      initial="hidden"
      animate="visible"
      variants={containerVariants}
      className="px-12 pt-32 pb-12"
    >
      <motion.div variants={itemVariants} className="flex items-end justify-between mb-16">
        <div>
          <h2 className="text-[10px] font-black tracking-[0.4em] uppercase text-[var(--accent-teal)] mb-4 italic">Financial Assets</h2>
          <h1 className="text-4xl font-black uppercase tracking-tighter italic">Secured Wallet</h1>
        </div>
        <div className="hidden sm:flex items-center gap-3 px-6 py-3 rounded-2xl bg-white/5 border border-white/10">
          <div className="w-2 h-2 rounded-full bg-[var(--status-success)] animate-pulse" />
          <span className="text-[10px] font-black uppercase tracking-widest text-[var(--text-secondary)] italic">Connected: Ethereum Sepolia</span>
        </div>
      </motion.div>

      <div className="grid lg:grid-cols-3 gap-12">
        {/* Main Balance Card */}
        <motion.div variants={itemVariants} className="lg:col-span-1">
          <div className="glass-panel p-12 rounded-[3.5rem] border border-white/10 relative overflow-hidden text-center sticky top-32">
            <div className="absolute top-0 right-0 w-32 h-32 bg-[var(--accent-purple)]/10 rounded-full blur-3xl" />
            
            <div className="w-20 h-20 rounded-3xl bg-white/5 border border-white/10 flex items-center justify-center mx-auto mb-10 group-hover:scale-110 transition-transform shadow-inner">
              <WalletIcon size={36} className="text-[var(--accent-purple)]" />
            </div>

            <p className="text-[10px] font-black uppercase tracking-[0.3em] text-[var(--text-secondary)] mb-4 italic">Total Available Balance</p>
            <h2 className="text-6xl font-black uppercase italic tracking-tighter mb-12">
              {realBalance.toFixed(4)} <span className="text-[var(--accent-teal)]">ETH</span>
            </h2>

            <div className="grid gap-4">
              <motion.button 
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className="w-full py-5 rounded-2xl bg-white text-black text-xs font-black uppercase tracking-[0.2em] shadow-2xl flex items-center justify-center gap-3 italic"
              >
                <ArrowDownLeft size={16} />
                Deposit Funds
              </motion.button>
              <motion.button 
                whileHover={{ scale: 1.02, backgroundColor: 'rgba(255,255,255,0.05)' }}
                whileTap={{ scale: 0.98 }}
                className="w-full py-5 rounded-2xl glass-panel border border-white/10 text-white text-xs font-black uppercase tracking-[0.2em] flex items-center justify-center gap-3 italic"
              >
                <ArrowUpRight size={16} />
                Withdraw
              </motion.button>
            </div>

            <div className="mt-12 pt-8 border-t border-white/5 flex items-center justify-center gap-2 text-[10px] font-black uppercase tracking-widest text-[var(--text-secondary)] italic">
              <ShieldCheck size={12} className="text-[var(--accent-teal)]" />
              On-Chain Assets Protected
            </div>
          </div>
        </motion.div>

        {/* History & Analytics */}
        <div className="lg:col-span-2 space-y-8">
          <motion.div variants={itemVariants} className="glass-panel p-10 rounded-[2.5rem] border border-white/5">
            <div className="flex items-center justify-between mb-10">
              <h2 className="text-xl font-black uppercase italic tracking-tight flex items-center gap-4">
                <Activity className="text-[var(--accent-purple)]" />
                Asset History
              </h2>
            </div>
            
            <div className="space-y-6">
              {transactions.length > 0 ? transactions.map((tx) => (
                <div key={tx.id} className="flex items-center justify-between p-6 rounded-3xl bg-white/[0.02] border border-white/5 hover:border-white/20 transition-all group">
                  <div className="flex items-center gap-6">
                    <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${
                      !tx.isNegative ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'
                    }`}>
                      {!tx.isNegative ? <ArrowDownLeft size={20} /> : <ArrowUpRight size={20} />}
                    </div>
                    <div>
                      <p className="font-black uppercase italic tracking-tight mb-1">{tx.type}</p>
                      <p className="text-[10px] font-black uppercase tracking-widest text-[var(--text-secondary)]">{tx.date}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className={`font-black uppercase italic tracking-tight mb-1 ${
                      !tx.isNegative ? 'text-[var(--status-success)]' : 'text-white'
                    }`}>{tx.amount}</p>
                    <p className="text-[8px] font-black tracking-widest text-[var(--text-secondary)]">{tx.status}</p>
                  </div>
                </div>
              )) : (
                <div className="py-12 text-center text-white/40 text-sm font-bold uppercase tracking-widest">
                  No Past Transactions found locally via Provider
                </div>
              )}
            </div>
          </motion.div>

          {/* Quick Stats */}
          <div className="grid grid-cols-2 gap-6">
            <motion.div variants={itemVariants} className="glass-panel p-8 rounded-[2rem] border border-white/5">
              <div className="flex items-center gap-4 mb-4">
                <div className="w-10 h-10 rounded-xl bg-[var(--accent-teal)]/10 flex items-center justify-center text-[var(--accent-teal)]">
                  <Zap size={20} />
                </div>
                <h4 className="text-[10px] font-black uppercase tracking-widest text-[var(--text-secondary)] italic">Gas Estimates</h4>
              </div>
              <p className="text-2xl font-black uppercase italic tracking-tight">{gasEstimate} <span className="text-xs text-[var(--text-secondary)]">GWEI</span></p>
            </motion.div>
            <motion.div variants={itemVariants} className="glass-panel p-8 rounded-[2rem] border border-white/5">
              <div className="flex items-center gap-4 mb-4">
                <div className="w-10 h-10 rounded-xl bg-[var(--accent-purple)]/10 flex items-center justify-center text-[var(--accent-purple)]">
                  <Activity size={20} />
                </div>
                <h4 className="text-[10px] font-black uppercase tracking-widest text-[var(--text-secondary)] italic">Owned Assets Count</h4>
              </div>
              <p className="text-2xl font-black uppercase italic tracking-tight text-[var(--status-success)]">{userTickets.length + userEvents.length}</p>
            </motion.div>
          </div>
        </div>
      </div>
    </motion.div>
  );
};

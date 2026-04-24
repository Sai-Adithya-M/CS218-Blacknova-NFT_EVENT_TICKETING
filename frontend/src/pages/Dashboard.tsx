import React, { useEffect, useState } from 'react';
import { useAuthStore } from '../store/useAuthStore';
import { useEventStore } from '../store/useEventStore';
import { useTicketStore } from '../store/useTicketStore';
import { Ticket, CalendarDays, TrendingUp, Wallet, ArrowUpRight, ArrowDownRight, Activity, Zap } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { AuthFallback } from '../components/ui/AuthFallback';
import { ethers } from 'ethers';
import { config } from '../config';


const AnimatedCounter = ({ value, prefix = '', suffix = '' }: { value: number | string, prefix?: string, suffix?: string }) => {
  const [displayValue, setDisplayValue] = useState(0);
  const targetValue = typeof value === 'string' 
    ? (parseFloat(value.replace(/[^0-9.]/g, '')) || 0) 
    : (Number(value) || 0);

  useEffect(() => {
    if (isNaN(targetValue)) return;
    const duration = 1500;
    const startTime = performance.now();

    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const current = Math.floor(progress * targetValue);
      setDisplayValue(current);

      if (progress < 1) {
        requestAnimationFrame(animate);
      } else {
        setDisplayValue(targetValue);
      }
    };

    requestAnimationFrame(animate);
  }, [targetValue]);

  if (value === '--' || value === 0 || !value) return <span>{prefix}NaN{suffix}</span>;
  return <span>{prefix}{displayValue.toLocaleString()}{suffix}</span>;
};


export const Dashboard: React.FC = () => {
  const { user } = useAuthStore();
  const { events, fetchEventsFromChain, isLoading: eventsLoading } = useEventStore();
  const { tickets, fetchTicketsFromChain, isLoading: ticketsLoading } = useTicketStore();

  const handleRefresh = async () => {
    if (user?.walletAddress) {
      console.log("Dashboard: Manual refresh triggered...");
      await Promise.all([
        fetchEventsFromChain(),
        fetchTicketsFromChain(user.walletAddress)
      ]);
    }
  };

  useEffect(() => {
    if (events.length === 0) fetchEventsFromChain();
    if (tickets.length === 0 && user?.walletAddress) fetchTicketsFromChain(user.walletAddress);
  }, [user?.walletAddress]);

  if (!user) return <AuthFallback />;

  const userTickets = tickets.filter(t => t.ownerId?.toLowerCase() === user.id?.toLowerCase());
  const userEvents = events.filter(e => e.organizerId?.toLowerCase() === user.id?.toLowerCase());

  // Assets = Owned Tickets + Created Events
  const totalAssets = userTickets.length + (user.role === 'organizer' ? userEvents.length : 0);
  console.log(`Dashboard: User Assets - Tickets: ${userTickets.length}, Events: ${userEvents.length}, Total: ${totalAssets}`);

  const marketVolume = events.reduce((acc, event) =>
    acc + event.tiers.reduce((tierAcc, tier) => tierAcc + (tier.price * tier.sold), 0)
    , 0);

  const [networkSpeed, setNetworkSpeed] = useState<number>(0);

  useEffect(() => {
    let mounted = true;
    const measurePing = async () => {
      try {
        const provider = new ethers.JsonRpcProvider(config.sepoliaRpcUrl);
        const start = performance.now();
        await provider.getBlockNumber();
        const end = performance.now();
        if (mounted) {
          const basePing = Math.floor(end - start);
          // Add small random jitter to show it's alive
          const jitter = Math.floor(Math.random() * 5);
          setNetworkSpeed(basePing > 0 ? basePing + jitter : 25 + jitter);
        }
      } catch (e) {
        if (mounted) setNetworkSpeed(0);
      }
    };
    measurePing();
    const interval = setInterval(measurePing, 5000); // Faster updates
    return () => { mounted = false; clearInterval(interval); };
  }, []);

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1
      }
    }
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { duration: 0.5, ease: [0.23, 1, 0.32, 1] }
    }
  };

  const isSyncing = eventsLoading || ticketsLoading;

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="px-12 pt-32 pb-12"
    >
      <motion.div variants={itemVariants} className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-12">
        <div>
          <h1 className="text-4xl font-black tracking-tight mb-2">Portfolio Overview</h1>
          <p className="text-[var(--text-secondary)]">Welcome back, <span className="text-white font-bold">{user.name}</span>. Your assets are performing well.</p>
        </div>
        <div className="flex items-center gap-4">
          <button 
            onClick={handleRefresh}
            disabled={isSyncing}
            className={`px-6 py-3 rounded-2xl bg-white/5 border border-[var(--border-glass)] text-[10px] font-black uppercase tracking-widest hover:bg-white/10 transition-all flex items-center gap-2 ${isSyncing ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            {isSyncing ? <Activity size={14} className="animate-spin" /> : <TrendingUp size={14} />}
            {isSyncing ? 'Syncing...' : 'Refresh Data'}
          </button>
          <div className="flex items-center gap-3 px-6 py-3 rounded-2xl bg-white/5 border border-[var(--border-glass)]">
            <div className="w-2 h-2 rounded-full bg-[var(--status-success)] animate-pulse" />
            <span className="text-xs font-bold uppercase tracking-widest text-[var(--text-secondary)]">Network: Sepolia</span>
          </div>
        </div>
      </motion.div>

      {/* Primary Stats */}
      <motion.div variants={containerVariants} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
        {[
          { label: 'Total Balance', value: user.walletBalance, icon: Wallet, color: 'text-[var(--accent-teal)]', trend: '+12.5%', isUp: true, suffix: ' ETH' },
          { label: 'Active Assets', value: totalAssets, icon: Ticket, color: 'text-[var(--accent-purple)]', trend: `+${totalAssets}`, isUp: true },
          { label: 'Market Volume', value: marketVolume, icon: TrendingUp, color: 'text-white', trend: marketVolume > 0 ? '+Active' : 'Neutral', isUp: marketVolume > 0, suffix: ' ETH' },
          { label: 'Network Speed', value: networkSpeed || 0, icon: Zap, iconColor: 'text-yellow-400', trend: 'Live Ping', isUp: true, suffix: 'ms' }
        ].map((stat, i) => (
          <motion.div
            key={i}
            variants={itemVariants}
            whileHover={{ y: -5, transition: { duration: 0.2 } }}
            className="glass-panel p-8 rounded-[2rem] border border-[var(--border-glass)] relative overflow-hidden group hover:border-[var(--accent-purple)]/30 transition-all shadow-xl hover:shadow-[var(--accent-purple)]/5"
          >


            <div className="relative z-10">
              <div className="flex items-center justify-between mb-4">
                <div className={`w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center`}>
                  <stat.icon size={24} className={stat.iconColor || stat.color} />
                </div>
                <div className={`flex items-center gap-1 text-xs font-bold ${stat.isUp ? 'text-[var(--status-success)]' : 'text-red-400'}`}>
                  {stat.isUp ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
                  {stat.trend}
                </div>
              </div>
              <p className="text-[10px] font-black uppercase tracking-widest text-[var(--text-secondary)] mb-1">{stat.label}</p>
              <div className={`text-3xl font-black ${stat.color}`}>
                <AnimatedCounter value={stat.value} suffix={stat.suffix} />
              </div>
            </div>
            <div className="absolute -bottom-4 -right-4 w-24 h-24 bg-white/[0.02] rounded-full blur-2xl group-hover:bg-[var(--accent-purple)]/5 transition-all" />
          </motion.div>
        ))}
      </motion.div>

      <div className="grid lg:grid-cols-3 gap-8">
        {/* Activity Chart Placeholder */}
        <motion.div variants={itemVariants} className="lg:col-span-2 space-y-8">
          <div className="glass-panel p-10 rounded-[2.5rem] border border-[var(--border-glass)] h-full min-h-[400px]">
            <div className="flex items-center justify-between mb-10">
              <h2 className="text-xl font-bold flex items-center gap-3">
                <Activity className="text-[var(--accent-purple)]" />
                Performance Analytics
              </h2>
              <div className="flex gap-2">
                {['1D', '1W', '1M', 'ALL'].map(t => (
                  <button key={t} className={`px-4 py-2 rounded-xl text-[10px] font-black ${t === '1W' ? 'bg-[var(--accent-purple)]' : 'hover:bg-white/5 text-[var(--text-secondary)]'} transition-all`}>
                    {t}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-end justify-between h-48 gap-2 px-4">
              {[40, 70, 45, 90, 65, 80, 50, 85, 60, 95, 75, 100].map((h, i) => (
                <div key={i} className="flex-1 group relative">
                  <motion.div
                    initial={{ height: 0 }}
                    animate={{ height: `${h}%` }}
                    transition={{ duration: 1, delay: 0.5 + i * 0.05, ease: "easeOut" }}
                    className={`w-full rounded-t-lg bg-gradient-to-t ${i % 2 === 0 ? 'from-[var(--accent-purple)]/20 to-[var(--accent-purple)]' : 'from-[var(--accent-teal)]/20 to-[var(--accent-teal)]'} opacity-40 group-hover:opacity-100 transition-all cursor-pointer`}
                  />
                  <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-white text-black text-[10px] font-black px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                    {h} ETH
                  </div>
                </div>
              ))}
            </div>
            <div className="flex justify-between mt-6 px-4 text-[10px] font-black uppercase tracking-widest text-[var(--text-secondary)]">
              <span>Mon</span><span>Tue</span><span>Wed</span><span>Thu</span><span>Fri</span><span>Sat</span><span>Sun</span>
            </div>
          </div>
        </motion.div>

        {/* Recent Activity List */}
        <motion.div variants={itemVariants} className="space-y-8">
          <div className="glass-panel p-8 rounded-[2.5rem] border border-[var(--border-glass)]">
            <h2 className="text-xl font-bold mb-8">Recent Operations</h2>
            <div className="space-y-6">
              <AnimatePresence>
                {(user.role === 'buyer' ? userTickets : userEvents).slice(0, 4).map((item) => {
                  const date = new Date(item.date);
                  return (
                    <motion.div
                      key={item.id}
                      variants={itemVariants}
                      className="flex items-center gap-4 group"
                    >
                      <div className="w-12 h-12 rounded-2xl bg-white/5 border border-[var(--border-glass)] flex items-center justify-center group-hover:border-[var(--accent-purple)]/50 transition-colors">
                        <CalendarDays size={20} className="text-[var(--text-secondary)] group-hover:text-[var(--accent-purple)]" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-sm truncate uppercase tracking-tight">{item.title}</p>
                        <p className="text-[10px] text-[var(--text-secondary)] font-black uppercase tracking-widest">{date.toLocaleDateString()}</p>
                      </div>
                      <div className="text-right">
                        <div className="text-xs font-black text-[var(--accent-teal)]">SUCCESS</div>
                        <div className="text-[9px] text-[var(--text-secondary)] font-mono">0x...{item.id.slice(-4).toUpperCase()}</div>
                      </div>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
              {(user.role === 'buyer' ? userTickets : userEvents).length === 0 && (
                <div className="py-12 text-center">
                  <p className="text-sm font-bold text-[var(--text-secondary)]">No recent data</p>
                </div>
              )}
            </div>
            <button className="w-full mt-8 py-4 rounded-2xl border border-[var(--border-glass)] text-[var(--text-secondary)] text-xs font-black uppercase tracking-widest hover:bg-white/5 transition-all">
              View All History
            </button>
          </div>
        </motion.div>
      </div>
    </motion.div>
  );
};


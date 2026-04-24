import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { X, TrendingUp, Ticket, PieChart, Info, ArrowUpRight } from 'lucide-react';
import type { Event } from '../../store/useEventStore';
import { config } from '../../config';

interface EventFinancialsModalProps {
  event: Event;
  onClose: () => void;
}

export const EventFinancialsModal: React.FC<EventFinancialsModalProps> = ({ event, onClose }) => {
  const [showFiat, setShowFiat] = useState(false);
  const ETH_PRICE = 3500; // Mock ETH price

  // On-Chain Data from EventStore
  const totalRevenueEth = parseFloat(event.totalRevenue || "0");
  const totalRoyaltyEth = parseFloat(event.totalRoyaltyEarned || "0");
  
  const tiers = Array.isArray(event.tiers) ? event.tiers : [];
  
  const tierRevenue = tiers.map(tier => ({
    ...tier,
    revenue: (Number(tier.sold) || 0) * (Number(tier.price) || 0)
  }));

  const totalTicketsSold = tiers.reduce((acc, t) => acc + (Number(t.sold) || 0), 0);
  const netProfitEth = totalRevenueEth + totalRoyaltyEth; // Net earnings for organiser

  const formatValue = (ethValue: number) => {
    if (isNaN(ethValue)) return "0.00";
    if (showFiat) {
      return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(ethValue * ETH_PRICE);
    }
    return `${ethValue.toFixed(4)} ETH`;
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/90 backdrop-blur-md"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.95, opacity: 0, y: 20 }}
        className="bg-zinc-900 border border-white/10 rounded-[2.5rem] w-full max-w-4xl overflow-hidden shadow-[0_0_50px_rgba(0,0,0,0.5)]"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-8 border-b border-white/5 flex items-center justify-between bg-gradient-to-br from-white/[0.03] to-transparent">
          <div>
            <div className="flex items-center gap-3 mb-1">
               <div className="p-2 bg-blue-500/20 rounded-xl">
                 <PieChart className="w-5 h-5 text-blue-400" />
               </div>
               <h2 className="text-2xl font-black uppercase italic tracking-tight text-white">
                 Event Financials
               </h2>
            </div>
            <p className="text-zinc-500 text-[10px] font-bold uppercase tracking-widest">{event.title} • Revenue Analytics</p>
          </div>
          <div className="flex items-center gap-4">
            <button
              onClick={() => setShowFiat(!showFiat)}
              className="px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-[10px] font-black uppercase tracking-widest text-white hover:bg-white/10 transition-all active:scale-95"
            >
              {showFiat ? 'Show ETH' : 'Show USD'}
            </button>
            <button onClick={onClose} className="p-3 hover:bg-white/10 rounded-full transition-all active:scale-90 bg-white/5 border border-white/10">
              <X className="w-5 h-5 text-zinc-400" />
            </button>
          </div>
        </div>

        <div className="p-8 space-y-8 max-h-[70vh] overflow-y-auto custom-scrollbar">
          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="glass-panel bg-white/[0.03] border border-white/10 p-6 rounded-3xl relative overflow-hidden group">
              <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                <TrendingUp size={48} />
              </div>
              <p className="text-zinc-500 text-[10px] font-black uppercase tracking-[0.2em] mb-4">Total Revenue</p>
              <h3 className="text-3xl font-black text-white italic">{formatValue(totalRevenueEth)}</h3>
              <div className="mt-4 flex items-center gap-2">
                <span className="px-2 py-0.5 rounded-md bg-green-500/10 text-green-400 text-[10px] font-bold">{totalTicketsSold} Sold</span>
              </div>
            </div>

            <div className="glass-panel bg-white/[0.03] border border-white/10 p-6 rounded-3xl relative overflow-hidden group">
              <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                <ShieldCheck className="w-12 h-12" />
              </div>
              <p className="text-zinc-500 text-[10px] font-black uppercase tracking-[0.2em] mb-4">Royalty Earned</p>
              <h3 className="text-3xl font-black text-white italic">{formatValue(totalRoyaltyEth)}</h3>
              <div className="mt-4 flex items-center gap-2">
                <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-tighter">From Secondary Resales</span>
              </div>
            </div>

            <div className={`glass-panel border p-6 rounded-3xl relative overflow-hidden group ${netProfitEth >= 0 ? 'bg-blue-500/5 border-blue-500/20' : 'bg-red-500/5 border-red-500/20'}`}>
              <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                <ArrowUpRight size={48} />
              </div>
              <p className="text-zinc-500 text-[10px] font-black uppercase tracking-[0.2em] mb-4">Net Profit</p>
              <h3 className={`text-3xl font-black italic ${netProfitEth >= 0 ? 'text-white' : 'text-red-400'}`}>
                {formatValue(netProfitEth)}
              </h3>
              <div className="mt-4">
                 <div className="w-full h-1 bg-white/5 rounded-full overflow-hidden">
                    <div className={`h-full ${netProfitEth >= 0 ? 'bg-blue-500' : 'bg-red-500'}`} style={{ width: `${Math.min(100, Math.max(0, (netProfitEth / (totalRevenueEth || 1)) * 100))}%` }} />
                 </div>
              </div>
            </div>
          </div>

          {/* Ticket Tiers Breakdown */}
          <div className="space-y-4">
            <h4 className="text-[10px] font-black uppercase tracking-[0.3em] text-white/40 italic flex items-center gap-2 px-2">
              <Ticket className="w-3 h-3 text-blue-400" />
              Ticket Tiers Breakdown
            </h4>
            <div className="bg-white/[0.02] border border-white/10 rounded-3xl overflow-hidden">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-white/5 text-[9px] font-black text-zinc-500 uppercase tracking-[0.2em]">
                    <th className="px-8 py-5">Tier Name</th>
                    <th className="px-8 py-5">Price</th>
                    <th className="px-8 py-5">Sold</th>
                    <th className="px-8 py-5">Revenue</th>
                    <th className="px-8 py-5 text-right">Progress</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {tierRevenue.length > 0 ? tierRevenue.map((tier, idx) => (
                    <tr key={idx} className="text-xs hover:bg-white/[0.03] transition-all group">
                      <td className="px-8 py-6 font-black text-white uppercase tracking-wider">{tier.name}</td>
                      <td className="px-8 py-6 text-zinc-400 font-mono">{formatValue(tier.price)}</td>
                      <td className="px-8 py-6 text-zinc-400 font-bold">{tier.sold} <span className="text-zinc-600 font-normal">/ {tier.supply}</span></td>
                      <td className="px-8 py-6 text-[var(--accent-teal)] font-black italic">{formatValue(tier.revenue)}</td>
                      <td className="px-8 py-6">
                        <div className="flex items-center justify-end gap-4">
                          <div className="w-20 h-1.5 bg-white/5 rounded-full overflow-hidden">
                            <motion.div
                              initial={{ width: 0 }}
                              animate={{ width: `${(tier.sold / tier.supply) * 100}%` }}
                              className="h-full bg-[var(--accent-teal)] shadow-[0_0_10px_rgba(45,212,191,0.5)]"
                            />
                          </div>
                          <span className="text-[9px] font-black text-zinc-600">{Math.round((tier.sold / tier.supply) * 100)}%</span>
                        </div>
                      </td>
                    </tr>
                  )) : (
                    <tr>
                      <td colSpan={5} className="px-8 py-12 text-center text-zinc-600 text-[10px] font-black uppercase tracking-widest italic">
                        No sales data available for this event
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Royalty & Additional Info */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="glass-panel bg-purple-500/5 border border-purple-500/20 p-8 rounded-[2.5rem] space-y-4">
              <div className="flex items-center gap-2 text-white font-black text-[10px] uppercase tracking-widest italic">
                <ShieldCheck className="w-4 h-4 text-purple-400" />
                Secondary Market Royalty
              </div>
              <div className="flex justify-between items-end">
                <div>
                  <p className="text-4xl font-black text-white italic">{(event.royaltyBps / 100).toFixed(1)}%</p>
                  <p className="text-zinc-500 text-[9px] font-bold uppercase tracking-widest mt-2">Continuous Revenue</p>
                </div>
                <div className="text-right">
                  <p className="text-xs font-black text-purple-400 italic">{event.royaltyBps} BPS</p>
                </div>
              </div>
              <div className="p-4 bg-black/40 border border-white/5 rounded-2xl text-[9px] font-medium text-zinc-500 leading-relaxed uppercase tracking-tighter">
                You will receive this percentage of every ticket resale value automatically on the secondary market.
              </div>
            </div>

            <div className="glass-panel bg-white/[0.03] border border-white/10 p-8 rounded-[2.5rem] space-y-6">
              <div className="flex items-center gap-2 text-white font-black text-[10px] uppercase tracking-widest italic">
                <Info className="w-4 h-4 text-zinc-500" />
                Contract Details
              </div>
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-[9px] font-black text-zinc-600 uppercase tracking-widest">Network</span>
                  <span className="px-2 py-1 bg-blue-500/10 text-blue-400 rounded-md text-[8px] font-black uppercase tracking-widest">Sepolia Testnet</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-[9px] font-black text-zinc-600 uppercase tracking-widest">Contract</span>
                  <span className="text-[10px] font-mono font-bold text-zinc-400">{config.contractAddress.slice(0, 8)}...{config.contractAddress.slice(-6)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-[9px] font-black text-zinc-600 uppercase tracking-widest">Event Status</span>
                  <span className="px-2 py-1 bg-white/5 text-white rounded-md text-[8px] font-black uppercase tracking-widest italic">{event.status}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
};

function ShieldCheck({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}

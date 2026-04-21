import React from 'react';
import { useTicketStore } from '../store/useTicketStore';
import { useEventStore } from '../store/useEventStore';
import { useAuthStore } from '../store/useAuthStore';
import { Ticket as TicketIcon, Share2, Ban, ExternalLink, Calendar, MapPin, Hash, Clock, Tag, TrendingUp, TrendingDown, ArrowRight } from 'lucide-react';
import { AuthFallback } from '../components/ui/AuthFallback';
import { motion } from 'framer-motion';
import { ethers } from 'ethers';
import { config } from '../config';

const CONTRACT_ABI = [
  "function listForResale(uint tokenId, uint priceWei) public",
  "function cancelResaleListing(uint tokenId) public"
];

export const MyTickets: React.FC = () => {
  const { tickets, isLoading: isTicketsLoading, listForResale, cancelResale, fetchAllResaleListings } = useTicketStore();
  const { events, isLoading: isEventsLoading } = useEventStore();
  const { user } = useAuthStore();
  const [resaleInputs, setResaleInputs] = React.useState<Record<string, string>>({});
  const [activeResaleId, setActiveResaleId] = React.useState<string | null>(null);
  const [activeTab, setActiveTab] = React.useState<'active' | 'history'>('active');

  if (!user) return <AuthFallback />;

  const myTickets = tickets.filter(t => t.ownerId?.toLowerCase() === user.id?.toLowerCase());

  const filteredTickets = myTickets.filter(ticket => {
    const event = events.find(e => e.id === ticket.eventId);
    // Fallback: If event hasn't loaded, don't hide the ticket; assume it's active so the user can see it.
    const isPast = event ? new Date(event.date) < new Date() : false;
    return activeTab === 'active' ? !isPast : isPast;
  });

  const handleResale = async (ticket: any) => {
    const priceStr = resaleInputs[ticket.id];
    if (!priceStr) return;

    const price = parseFloat(priceStr);
    if (isNaN(price) || price <= 0) {
      alert("Invalid price.");
      return;
    }

    try {
      const provider = new ethers.BrowserProvider((window as any).ethereum);
      const signer = await provider.getSigner();
      const contract = new ethers.Contract(config.contractAddress, CONTRACT_ABI, signer);

      const priceWei = ethers.parseEther(price.toString());
      const tx = await contract.listForResale(ticket.tokenId, priceWei);
      await tx.wait();

      listForResale(ticket.id, price);
      fetchAllResaleListings();
      setActiveResaleId(null);
      setResaleInputs(prev => {
        const next = { ...prev };
        delete next[ticket.id];
        return next;
      });
      alert("Ticket listed for resale on-chain!");
    } catch (err: any) {
      console.error("Resale listing failed:", err);
      // User rejected in MetaMask — no alert needed
      if (err?.code === 4001 || err?.code === 'ACTION_REJECTED' || err?.info?.error?.code === 4001) return;
      alert(err?.reason || err?.shortMessage || "Failed to list for resale.");
    }
  };

  const handleCancelResale = async (ticket: any) => {
    try {
      const provider = new ethers.BrowserProvider((window as any).ethereum);
      const signer = await provider.getSigner();
      const contract = new ethers.Contract(config.contractAddress, CONTRACT_ABI, signer);

      const tx = await contract.cancelResaleListing(ticket.tokenId);
      await tx.wait();

      cancelResale(ticket.id);
      fetchAllResaleListings();
      alert("Resale listing cancelled on-chain!");
    } catch (err: any) {
      console.error("Cancellation failed:", err);
      if (err?.code === 4001 || err?.code === 'ACTION_REJECTED' || err?.info?.error?.code === 4001) return;
      alert(err?.reason || err?.shortMessage || "Failed to cancel listing.");
    }
  };

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: { opacity: 1, transition: { staggerChildren: 0.1 } }
  };

  const itemVariants = {
    hidden: { opacity: 0, x: -20 },
    visible: { opacity: 1, x: 0, transition: { duration: 0.5, ease: "easeOut" } }
  };

  return (
    <motion.div
      initial="hidden"
      animate="visible"
      variants={containerVariants}
      className="px-12 pt-32 pb-12"
    >
      <motion.div variants={itemVariants} className="flex flex-col md:flex-row items-start md:items-center justify-between gap-8 mb-16">
        <div>
          <h2 className="text-[10px] font-black tracking-[0.4em] uppercase text-[var(--accent-teal)] mb-4 italic">Your Assets</h2>
          <h1 className="text-4xl font-black uppercase tracking-tighter italic">My Tickets</h1>
        </div>

        <div className="flex flex-col sm:flex-row items-center gap-6">
          <div className="flex p-1.5 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-xl">
            <button
              onClick={() => setActiveTab('active')}
              className={`px-8 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
                activeTab === 'active' 
                  ? 'bg-white text-black shadow-2xl' 
                  : 'text-white/40 hover:text-white hover:bg-white/5'
              }`}
            >
              Active Tickets
            </button>
            <button
              onClick={() => setActiveTab('history')}
              className={`px-8 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
                activeTab === 'history' 
                  ? 'bg-white text-black shadow-2xl' 
                  : 'text-white/40 hover:text-white hover:bg-white/5'
              }`}
            >
              History
            </button>
          </div>
          <div className="hidden sm:flex items-center gap-3 px-6 py-3 rounded-2xl bg-white/5 border border-white/10">
            <div className="w-2 h-2 rounded-full bg-[var(--status-success)] animate-pulse" />
            <span className="text-[10px] font-black uppercase tracking-widest text-[var(--text-secondary)] italic">Secure On-Chain Storage</span>
          </div>
        </div>
      </motion.div>

      <div className="grid gap-6">
        {isTicketsLoading || isEventsLoading ? (
          <div className="h-64 flex flex-col items-center justify-center glass-panel rounded-[2.5rem] border border-white/5 bg-white/[0.02]">
            <div className="w-10 h-10 border-4 border-[var(--accent-teal)]/20 border-t-[var(--accent-teal)] rounded-full animate-spin mb-4" />
            <p className="text-[9px] font-black uppercase tracking-[0.4em] text-[var(--accent-teal)] italic animate-pulse">
              {isTicketsLoading ? 'Discovering Tickets...' : 'Fetching Event Details...'}
            </p>
          </div>
        ) : filteredTickets.length > 0 ? (
          filteredTickets.map(ticket => {
            const event = events.find(e => e.id === ticket.eventId);
            const eventTitle = event?.title || 'Unknown Event';
            const eventDate = event ? new Date(event.date) : null;
            const isPast = eventDate ? eventDate < new Date() : false;
            const eventLocation = event?.location || '';
            const purchaseDate = new Date(ticket.purchasedAt);

            return (
              <motion.div
                key={ticket.id}
                variants={itemVariants}
                whileHover={{ x: 10 }}
                className="glass-panel p-8 rounded-[2.5rem] border border-white/5 hover:border-white/20 transition-all relative overflow-hidden group"
              >
                <div className="absolute inset-0 bg-gradient-to-r from-[var(--accent-purple)]/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />

                <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6 relative z-10">
                  {/* Left: ticket info */}
                  <div className="flex flex-col md:flex-row items-start md:items-center gap-6 flex-1">
                    <div className="w-16 h-16 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-[var(--accent-purple)] shrink-0 group-hover:scale-110 transition-transform">
                      <TicketIcon size={28} />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-3 mb-2">
                        <span className={`px-3 py-1 rounded-full text-[8px] font-black uppercase tracking-widest italic ${
                            isPast 
                              ? 'bg-white/5 text-white/40' 
                              : (ticket.status === 'active' ? 'bg-[var(--status-success)]/10 text-[var(--status-success)]' : 'bg-[var(--accent-teal)]/10 text-[var(--accent-teal)]')
                          }`}>
                          {isPast ? 'not active' : ticket.status}
                        </span>
                        <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-[var(--accent-purple)]/10 text-[var(--accent-purple)] text-[8px] font-black uppercase tracking-widest">
                          <Tag size={8} />{ticket.tierName}
                        </span>
                      </div>

                      <h3 className="text-xl font-black uppercase tracking-tight italic mb-3">{eventTitle}</h3>

                      {/* Token ID */}
                      <div className="flex items-center gap-2 mb-3 p-3 rounded-xl bg-white/[0.03] border border-white/5">
                        <Hash size={12} className="text-[var(--accent-teal)] shrink-0" />
                        <span className="text-[10px] font-bold text-white/40 shrink-0">Token ID:</span>
                        <span className="text-[10px] font-mono font-bold text-white/80 truncate">{ticket.tokenId}</span>
                      </div>

                      <div className="flex flex-wrap items-center gap-4 text-[10px] font-bold text-white/40">
                        {eventDate && (
                          <span className="flex items-center gap-1.5">
                            <Calendar size={11} className="text-[var(--accent-purple)]" />
                            {eventDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                          </span>
                        )}
                        {eventLocation && (
                          <span className="flex items-center gap-1.5">
                            <MapPin size={11} className="text-[var(--accent-teal)]" />
                            {eventLocation}
                          </span>
                        )}
                        <span className="flex items-center gap-1.5">
                          <Clock size={11} />
                          Purchased {purchaseDate.toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Right: price + actions */}
                  <div className="flex flex-col items-end gap-3 shrink-0">
                    <div className="w-24 h-24 bg-white p-2 mb-2 rounded-xl shadow-[0_0_15px_rgba(var(--accent-teal),0.2)]">
                      <img
                        src={`https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(`https://sepolia.etherscan.io/nft/${config.contractAddress}/${ticket.tokenId}`)}`}
                        alt="Ticket Gate QR Code"
                        className="w-full h-full object-contain"
                      />
                    </div>

                    {/* Resale Analytics Panel */}
                    {ticket.status === 'resale' && ticket.resalePrice != null ? (() => {
                      const buyPrice = ticket.tierPrice;
                      const salePrice = ticket.resalePrice;
                      const diff = salePrice - buyPrice;
                      const pctChange = buyPrice > 0 ? ((diff / buyPrice) * 100) : 0;
                      const isProfit = diff >= 0;

                      return (
                        <div className="w-full min-w-[220px] p-4 rounded-2xl bg-white/[0.03] border border-white/10 space-y-3">
                          {/* Price comparison */}
                          <div className="flex items-center justify-between gap-3">
                            <div className="text-center">
                              <p className="text-[8px] font-black uppercase tracking-widest text-white/30 mb-1">Bought</p>
                              <p className="text-sm font-black text-white/60">{buyPrice} ETH</p>
                            </div>
                            <ArrowRight size={14} className="text-white/20 shrink-0" />
                            <div className="text-center">
                              <p className="text-[8px] font-black uppercase tracking-widest text-white/30 mb-1">Listed</p>
                              <p className="text-sm font-black text-[var(--accent-teal)]">{salePrice} ETH</p>
                            </div>
                          </div>

                          {/* Gain/Loss indicator */}
                          <div className={`flex items-center justify-center gap-2 py-2 px-3 rounded-xl ${
                            isProfit 
                              ? 'bg-[var(--status-success)]/10 border border-[var(--status-success)]/20' 
                              : 'bg-red-500/10 border border-red-500/20'
                          }`}>
                            {isProfit 
                              ? <TrendingUp size={14} className="text-[var(--status-success)]" />
                              : <TrendingDown size={14} className="text-red-400" />
                            }
                            <span className={`text-[10px] font-black uppercase tracking-widest ${
                              isProfit ? 'text-[var(--status-success)]' : 'text-red-400'
                            }`}>
                              {isProfit ? '+' : ''}{diff.toFixed(4)} ETH ({isProfit ? '+' : ''}{pctChange.toFixed(1)}%)
                            </span>
                          </div>

                          <p className="text-[8px] text-center font-bold text-white/20 uppercase tracking-widest italic">Listed on Marketplace</p>
                        </div>
                      );
                    })() : (
                      <p className="text-xl font-black text-transparent bg-clip-text bg-gradient-to-r from-[var(--accent-purple)] to-[var(--accent-teal)]">
                        {ticket.tierPrice} ETH
                      </p>
                    )}

                    <div className="flex flex-col gap-2">
                      {activeResaleId === ticket.id ? (
                        <div className="flex items-center gap-2 p-2 rounded-2xl bg-white/5 border border-white/10 animate-in fade-in slide-in-from-right-4 duration-300">
                          <input
                            type="number"
                            step="0.001"
                            min="0"
                            placeholder="Price (ETH)"
                            className="w-24 bg-transparent outline-none text-xs font-black text-[var(--accent-teal)] placeholder:text-white/20 px-2"
                            value={resaleInputs[ticket.id] || ''}
                            onChange={(e) => setResaleInputs({ ...resaleInputs, [ticket.id]: e.target.value })}
                          />
                          <button
                            onClick={() => handleResale(ticket)}
                            className="px-4 py-1.5 rounded-xl bg-[var(--accent-teal)] text-black text-[9px] font-black uppercase tracking-widest hover:scale-105 transition-all"
                          >
                            List
                          </button>
                          <button
                            onClick={() => setActiveResaleId(null)}
                            className="p-1.5 rounded-xl hover:bg-white/5 text-white/30"
                          >
                            <Ban size={14} />
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          {/* Etherscan link */}
                          <a
                            href={`https://sepolia.etherscan.io/nft/${config.contractAddress}/${ticket.tokenId}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-[var(--accent-teal)]/20 bg-[var(--accent-teal)]/5 text-[var(--accent-teal)] text-[9px] font-black uppercase tracking-widest hover:bg-[var(--accent-teal)]/10 transition-all"
                          >
                            <ExternalLink size={12} /> Etherscan
                          </a>

                          {!isPast && ticket.status === 'active' && (
                            <button
                              onClick={() => setActiveResaleId(ticket.id)}
                              className="flex items-center gap-2 px-4 py-2.5 rounded-xl glass-panel border border-white/10 text-[9px] font-black uppercase tracking-widest hover:bg-white hover:text-black transition-all italic"
                            >
                              <Share2 size={12} /> Resell
                            </button>
                          )}

                          {!isPast && ticket.status === 'resale' && (
                            <button
                              onClick={() => handleCancelResale(ticket)}
                              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-[9px] font-black uppercase tracking-widest hover:bg-red-500 hover:text-white transition-all italic"
                            >
                              <Ban size={12} /> Cancel
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </motion.div>
            );
          })
        ) : (
          <motion.div variants={itemVariants} className="glass-panel p-20 rounded-[3rem] border border-white/5 text-center">
            <div className="w-16 h-16 rounded-2xl bg-white/5 flex items-center justify-center mx-auto mb-6">
              <TicketIcon size={32} className="text-white/10" />
            </div>
            <p className="text-lg font-black uppercase tracking-widest italic text-white/30 mb-2">
              {activeTab === 'active' ? 'No Active Tickets' : 'No Past Experience'}
            </p>
            <p className="text-sm text-white/20">
              {activeTab === 'active' 
                ? 'Visit the Marketplace to purchase your first NFT ticket.' 
                : 'Your attended events will appear here as historic records.'}
            </p>
          </motion.div>
        )}
      </div>
    </motion.div>
  );
};

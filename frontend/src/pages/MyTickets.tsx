import React from 'react';
import { useTicketStore } from '../store/useTicketStore';
import { useEventStore } from '../store/useEventStore';
import { useAuthStore } from '../store/useAuthStore';
import { Ticket as TicketIcon, Share2, Ban, ExternalLink, Calendar, MapPin, Hash, Clock, Tag, Loader2 } from 'lucide-react';
import { AuthFallback } from '../components/ui/AuthFallback';
import { motion, AnimatePresence } from 'framer-motion';
import { ethers } from 'ethers';
import { config } from '../config';
import { useIPFSImage } from '../hooks/useIPFSImage';

const BannerImage: React.FC<{ src?: string; alt: string; className?: string }> = ({ src, alt, className }) => {
  const { src: currentSrc, loading } = useIPFSImage(src);

  return (
    <img
      src={currentSrc}
      alt={alt}
      className={`${className} transition-all duration-700 ${loading ? 'blur-sm grayscale' : 'blur-0 grayscale-0'}`}
    />
  );
};

const CONTRACT_ABI = [
  "function listForResale(uint256 tokenId, uint256 priceWei) external",
  "function cancelResaleListing(uint256 tokenId) external"
];

export const MyTickets: React.FC = () => {
  const { tickets, isLoading: isTicketsLoading, listTicketForResale, cancelResale } = useTicketStore();
  const { events, isLoading: isEventsLoading } = useEventStore();
  const { user } = useAuthStore();
  const [resaleInputs, setResaleInputs] = React.useState<Record<string, string>>({});
  const [activeResaleId, setActiveResaleId] = React.useState<string | null>(null);
  const [activeTab, setActiveTab] = React.useState<'active' | 'history'>('active');
  const [processingId, setProcessingId] = React.useState<string | null>(null);

  if (!user) return <AuthFallback />;

  const myTickets = tickets.filter(t => t.ownerId?.toLowerCase() === user.id?.toLowerCase());

  const filteredTickets = myTickets.filter(ticket => {
    const event = events.find(e => e.id === ticket.eventId);
    if (!event) return activeTab === 'active'; // Don't hide if event is still loading
    
    const eventDate = new Date(event.date);
    const isPast = !isNaN(eventDate.getTime()) && eventDate < new Date();
    
    return activeTab === 'active' ? !isPast : isPast;
  });

  const handleResale = async (ticket: any) => {
    const priceStr = resaleInputs[ticket.id];
    if (!priceStr) return;
    const price = parseFloat(priceStr);
    if (isNaN(price) || price <= 0) { alert("Invalid price."); return; }
    setProcessingId(ticket.id);
    try {
      const provider = new ethers.BrowserProvider((window as any).ethereum);
      const signer = await provider.getSigner();
      const contract = new ethers.Contract(config.contractAddress, CONTRACT_ABI, signer);
      const priceWei = ethers.parseEther(price.toString());
      const tx = await contract.listForResale(ticket.tokenId, priceWei);
      await tx.wait();
      listTicketForResale(ticket.id, price);
      setActiveResaleId(null);
      setResaleInputs(prev => { const next = { ...prev }; delete next[ticket.id]; return next; });
    } catch (err: any) {
      console.error("Resale listing failed:", err);
      alert(err.message || "Failed to list for resale.");
    } finally {
      setProcessingId(null);
    }
  };

  const handleCancelResale = async (ticket: any) => {
    setProcessingId(ticket.id);
    try {
      const provider = new ethers.BrowserProvider((window as any).ethereum);
      const signer = await provider.getSigner();
      const contract = new ethers.Contract(config.contractAddress, CONTRACT_ABI, signer);
      const tx = await contract.cancelResaleListing(ticket.tokenId);
      await tx.wait();
      cancelResale(ticket.id);
    } catch (err: any) {
      console.error("Cancellation failed:", err);
      alert(err.message || "Failed to cancel listing.");
    } finally {
      setProcessingId(null);
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
      <AnimatePresence>
        {processingId && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.92, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.92, y: 20 }}
              className="relative w-full max-w-md rounded-3xl border border-white/10 bg-[#0a0a0f]/98 backdrop-blur-2xl shadow-2xl p-10 text-center"
            >
              <div className="w-16 h-16 rounded-2xl bg-[var(--accent-purple)]/10 border border-[var(--accent-purple)]/30 flex items-center justify-center mx-auto mb-6">
                <Loader2 size={32} className="text-[var(--accent-purple)] animate-spin" />
              </div>
              <h3 className="text-xl font-black uppercase tracking-tight italic mb-3">Processing Ticket…</h3>
              <p className="text-white/50 text-sm font-medium">Updating marketplace listing on Sepolia Testnet.</p>
              <div className="mt-6 flex items-center justify-center gap-2 text-[11px] font-bold uppercase tracking-widest text-white/30">
                <span className="w-2 h-2 rounded-full bg-[var(--accent-purple)] animate-pulse" />
                Processing on-chain
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
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
                whileHover={{ x: 6 }}
                className="glass-panel rounded-[2rem] border border-white/5 hover:border-white/20 transition-all relative overflow-hidden group"
              >
                {/* Hover glow */}
                <div className="absolute inset-0 bg-gradient-to-r from-[var(--accent-purple)]/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />

                <div className="flex flex-col md:flex-row items-stretch relative z-10">
                  {/* ── Banner Panel (left) ── */}
                  <div className="relative w-full md:w-48 h-48 md:h-auto shrink-0 overflow-hidden rounded-t-[2rem] md:rounded-l-[2rem] md:rounded-tr-none">
                    <BannerImage
                      src={event?.imageUrl}
                      alt={eventTitle}
                      className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    />
                    {/* Gradient overlay only */}
                    <div className="absolute inset-0 bg-gradient-to-t md:bg-gradient-to-r from-black/80 via-black/30 to-transparent" />
                  </div>

                  {/* ── Right: info + price + actions ── */}
                  <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6 flex-1 p-6">

                    {/* Ticket info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-3 mb-2">
                        <span className={`px-3 py-1 rounded-full text-[8px] font-black uppercase tracking-widest italic ${
                          isPast
                            ? 'bg-white/5 text-white/40'
                            : ticket.status === 'active'
                            ? 'bg-[var(--status-success)]/10 text-[var(--status-success)]'
                            : 'bg-[var(--accent-teal)]/10 text-[var(--accent-teal)]'
                        }`}>
                          {isPast ? 'Past' : ticket.status}
                        </span>
                        <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-[var(--accent-purple)]/10 text-[var(--accent-purple)] text-[8px] font-black uppercase tracking-widest">
                          <Tag size={8} />{ticket.tierName}
                        </span>
                      </div>

                      <h3 className="text-xl font-black tracking-tight italic mb-3">{eventTitle}</h3>

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
                      {event?.description && (
                        <p className="mt-3 text-xs text-white/60 line-clamp-2 leading-relaxed">
                          {event.description}
                        </p>
                      )}
                    </div>

                    {/* Price + QR + actions */}
                    <div className="flex flex-col items-end gap-3 shrink-0">
                      <div className="w-24 h-24 bg-white p-2 mb-2 rounded-xl shadow-[0_0_15px_rgba(var(--accent-teal),0.2)]">
                        <img
                          src={`https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(`https://sepolia.etherscan.io/nft/${config.contractAddress}/${ticket.tokenId}`)}`}
                          alt="Ticket Gate QR Code"
                          className="w-full h-full object-contain"
                        />
                      </div>

                      <div className="flex flex-col items-end">
                        {ticket.status === 'resale' && ticket.resalePrice ? (
                          <div className="flex items-center gap-4 text-right">
                            <div className="flex flex-col">
                              <span className="text-[8px] font-black uppercase tracking-widest text-white/20">Original</span>
                              <span className="text-sm font-bold text-white/30 line-through">{ticket.tierPrice} ETH</span>
                            </div>
                            <div className="w-px h-8 bg-white/10" />
                            <div className="flex flex-col">
                              <span className="text-[8px] font-black uppercase tracking-widest text-[var(--accent-teal)]">Resale Price</span>
                              <span className="text-xl font-black text-transparent bg-clip-text bg-gradient-to-r from-[var(--accent-purple)] to-[var(--accent-teal)]">
                                {ticket.resalePrice} ETH
                              </span>
                            </div>
                          </div>
                        ) : (
                          <p className="text-xl font-black text-transparent bg-clip-text bg-gradient-to-r from-[var(--accent-purple)] to-[var(--accent-teal)]">
                            {ticket.tierPrice} ETH
                          </p>
                        )}
                      </div>

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
                              disabled={processingId === ticket.id}
                              className="px-4 py-1.5 rounded-xl bg-[var(--accent-teal)] text-black text-[9px] font-black uppercase tracking-widest hover:scale-105 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                            >
                              {processingId === ticket.id ? <Loader2 size={10} className="animate-spin" /> : null}
                              {processingId === ticket.id ? 'Processing' : 'List'}
                            </button>
                            <button
                              onClick={() => setActiveResaleId(null)}
                              disabled={processingId === ticket.id}
                              className="p-1.5 rounded-xl hover:bg-white/5 text-white/30 disabled:opacity-20"
                            >
                              <Ban size={14} />
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
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
                                disabled={processingId === ticket.id}
                                className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-[9px] font-black uppercase tracking-widest hover:bg-red-500 hover:text-white transition-all italic disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                {processingId === ticket.id ? <Loader2 size={12} className="animate-spin" /> : <Ban size={12} />}
                                {processingId === ticket.id ? 'Cancelling...' : 'Cancel'}
                              </button>
                            )}
                          </div>
                        )}
                      </div>
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

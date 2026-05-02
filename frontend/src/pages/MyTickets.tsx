import React from 'react';
import { toast } from 'react-hot-toast';
import { useTicketStore } from '../store/useTicketStore';
import { useEventStore } from '../store/useEventStore';
import { useAuthStore } from '../store/useAuthStore';
import { Ticket as TicketIcon, Share2, Ban, ExternalLink, Calendar, MapPin, Hash, Clock, Tag, Loader2, ShieldCheck, Users } from 'lucide-react';
import { AuthFallback } from '../components/ui/AuthFallback';
import { ResaleModal } from '../components/events/ResaleModal';
import { motion } from 'framer-motion';
import { ethers } from 'ethers';
import { config } from '../config';
import { FALLBACK_IMG, IPFS_GATEWAYS, extractCid } from '../utils/ipfs';

// Tries each IPFS gateway in turn before falling back to FALLBACK_IMG
const BannerImage: React.FC<{ src?: string; alt: string; className?: string }> = ({ src, alt, className }) => {
  const cid = src ? extractCid(src) : null;
  const urls = cid
    ? IPFS_GATEWAYS.map(gw => `${gw}/${cid}`)
    : src ? [src] : [];
  const [idx, setIdx] = React.useState(0);
  const currentSrc = urls[idx] || FALLBACK_IMG;

  const handleError = () => {
    if (idx < urls.length - 1) {
      setIdx(i => i + 1);
    } else {
      // All gateways exhausted, show fallback
      setIdx(urls.length); // sentinel so we don't retry
    }
  };

  return (
    <img
      src={idx >= urls.length ? FALLBACK_IMG : currentSrc}
      alt={alt}
      className={className}
      onError={handleError}
    />
  );
};

const CONTRACT_ABI = [
  "function listForResale(uint256 tokenId, uint256 priceWei) external",
  "function cancelResaleListing(uint256 tokenId) external",
  "function claimRefund(uint256 tokenId) external"
];

export const MyTickets: React.FC = () => {
  const { tickets, isLoading: isTicketsLoading, listTicketForResale, cancelResale, markTicketRefunded } = useTicketStore();
  const { events, isLoading: isEventsLoading } = useEventStore();
  const { user } = useAuthStore();
  const [selectedTicketForResale, setSelectedTicketForResale] = React.useState<any | null>(null);
  const [isResaleModalOpen, setIsResaleModalOpen] = React.useState(false);
  const [activeTab, setActiveTab] = React.useState<'active' | 'history'>('active');
  const [processingId, setProcessingId] = React.useState<string | null>(null);
  const [secureQRs, setSecureQRs] = React.useState<Record<string, { data: string; expiresAt: number }>>({});
  const [, setTick] = React.useState(0);
  
  React.useEffect(() => {
    const timer = setInterval(() => {
      setTick(t => t + 1);
      // Clean up expired QRs
      setSecureQRs(prev => {
        const next = { ...prev };
        let changed = false;
        const now = Math.floor(Date.now() / 1000);
        Object.keys(next).forEach(id => {
          if (next[id].expiresAt < now) {
            delete next[id];
            changed = true;
          }
        });
        return changed ? next : prev;
      });
    }, 30000); // Check every 30s
    return () => clearInterval(timer);
  }, []);
  const [isGeneratingQR, setIsGeneratingQR] = React.useState<string | null>(null);

  if (!user) return <AuthFallback />;

  const myTickets = tickets.filter(t => t.ownerId?.toLowerCase() === user.id?.toLowerCase());

  const filteredTickets = myTickets.filter(ticket => {
    const event = events.find(e => e.id === ticket.eventId);
    const isPast = event ? new Date(event.date) < new Date() : false;
    const isHistory = isPast || ticket.isRefunded || ticket.isUsed || ticket.status === 'used';
    return activeTab === 'active' ? !isHistory : isHistory;
  });

  const handleResale = async (ticket: any, price: number) => {
    setProcessingId(ticket.id);
    try {
      const provider = new ethers.BrowserProvider((window as any).ethereum);
      const signer = await provider.getSigner();
      const contract = new ethers.Contract(config.contractAddress, CONTRACT_ABI, signer);
      // Contract stores resale price in wei
      const priceWei = ethers.parseUnits(price.toString(), "ether");
      const tx = await contract.listForResale(ticket.tokenId, priceWei);
      await tx.wait();
      listTicketForResale(ticket.id, price);
      setIsResaleModalOpen(false);
      toast.success("Ticket listed for resale successfully!");
    } catch (err: any) {
      console.error("Resale listing failed:", err);
      if (err.code === 4001 || err.message?.toLowerCase().includes("user rejected")) {
        toast.error("Transaction cancelled in MetaMask.");
      } else {
        toast.error(err.reason || err.message || "Failed to list for resale.");
      }
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
      toast.error(err.message || "Failed to cancel listing.");
    } finally {
      setProcessingId(null);
    }
  };

  const generateSecureQR = async (ticket: any) => {
    setIsGeneratingQR(ticket.id);
    try {
      if (!(window as any).ethereum) throw new Error("Wallet not connected");
      
      const provider = new ethers.BrowserProvider((window as any).ethereum);
      const signer = await provider.getSigner();
      const contract = new ethers.Contract(config.contractAddress, [
        "function getTokenNonce(uint256 tokenId) public view returns (uint256)"
      ], provider);

      // Ensure tokenId is a clean numeric string or BigInt
      const cleanTokenId = ticket.tokenId.toString().replace(/\D/g, '');
      console.log("Fetching nonce for Token ID:", cleanTokenId);
      
      const nonce = await contract.getTokenNonce(BigInt(cleanTokenId));
      const owner = await signer.getAddress();
      const timestamp = Math.floor(Date.now() / 1000);
      
      const message = `Authorize Entry\nToken ID: ${cleanTokenId}\nEvent ID: ${ticket.eventId}\nNonce: ${nonce.toString()}\nTimestamp: ${timestamp}`;
      console.log("Signing message:", message);
      
      const signature = await signer.signMessage(message);

      const qrData = JSON.stringify({
        t: cleanTokenId,
        e: ticket.eventId,
        o: owner,
        n: nonce.toString(),
        ts: timestamp,
        s: signature
      });

      setSecureQRs(prev => ({ 
        ...prev, 
        [ticket.id]: {
          data: qrData,
          expiresAt: timestamp + 300 // 5 minutes
        }
      }));
    } catch (err: any) {
      console.error("Detailed QR Error:", err);
      const msg = err.reason || err.message || "Unknown error";
      toast.error(`Failed to generate secure QR: ${msg}`);
    } finally {
      setIsGeneratingQR(null);
    }
  };

  const handleClaimRefund = async (ticket: any) => {
    setProcessingId(ticket.id);
    try {
      const provider = new ethers.BrowserProvider((window as any).ethereum);
      const signer = await provider.getSigner();
      const contract = new ethers.Contract(config.contractAddress, CONTRACT_ABI, signer);
      const tx = await contract.claimRefund(ticket.tokenId);
      await tx.wait();
      markTicketRefunded(ticket.id);
    } catch (err: any) {
      console.error("Claim refund failed:", err);
      toast.error(err.message || "Failed to claim refund.");
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
            const eventLocation = event?.venueName ? `${event.venueName}, ${event.location}` : (event?.location || '');
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
                          event?.status === 'cancelled'
                            ? 'bg-red-500/10 text-red-500'
                          : isPast
                            ? 'bg-white/5 text-white/40'
                            : ticket.status === 'active'
                            ? 'bg-[var(--status-success)]/10 text-[var(--status-success)]'
                            : 'bg-[var(--accent-teal)]/10 text-[var(--accent-teal)]'
                        }`}>
                          {event?.status === 'cancelled' ? 'Cancelled' : isPast ? 'Past' : ticket.status}
                        </span>
                        <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-[var(--accent-purple)]/10 text-[var(--accent-purple)] text-[8px] font-black uppercase tracking-widest">
                          <Tag size={8} />{ticket.tierName}
                        </span>
                      </div>

                      <h3 className="text-xl font-black tracking-tight italic mb-1">{eventTitle}</h3>
                      {event?.status === 'cancelled' && (
                        <p className="text-[10px] font-bold text-red-500 uppercase tracking-widest mb-3 flex items-center gap-1.5">
                          <Ban size={10} /> This event has been cancelled
                        </p>
                      )}

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
                        {event?.locationLink && (
                          <a 
                            href={event.locationLink} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="flex items-center gap-1.5 text-[var(--accent-teal)] hover:text-white transition-colors bg-[var(--accent-teal)]/5 px-2 py-0.5 rounded-md border border-[var(--accent-teal)]/10"
                          >
                            <ExternalLink size={10} /> Directions
                          </a>
                        )}
                        {event?.minAge && (
                          <span className="flex items-center gap-1.5 text-orange-400/80">
                            <Users size={11} />
                            Age: {event.minAge}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Price + QR + actions */}
                    <div className="flex flex-col items-end gap-3 shrink-0">
                      <div className="flex flex-col items-center gap-2">
                        <div className="relative w-28 h-28 bg-white p-2 rounded-xl shadow-[0_0_20px_rgba(var(--accent-teal),0.3)] overflow-hidden group/qr">
                          {secureQRs[ticket.id] ? (
                            <img
                              src={`https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(secureQRs[ticket.id].data)}`}
                              alt="Secure Ticket QR"
                              className={`w-full h-full object-contain ${event?.status === 'cancelled' || ticket.isUsed || isPast ? 'opacity-10 grayscale' : ''}`}
                            />
                          ) : (
                            <div className="w-full h-full flex flex-col items-center justify-center bg-black/5 gap-2 text-center p-2">
                               <div className="w-8 h-8 rounded-full bg-[var(--accent-teal)]/10 flex items-center justify-center">
                                  <ShieldCheck size={16} className={ticket.isUsed || isPast ? 'text-white/20' : 'text-[var(--accent-teal)]'} />
                               </div>
                               {ticket.isUsed || isPast ? (
                                 <span className="text-[9px] font-black uppercase tracking-widest text-white/30 italic">
                                   {ticket.isUsed ? 'Ticket Used' : 'Event Finished'}
                                 </span>
                               ) : (
                                 <button 
                                    onClick={() => generateSecureQR(ticket)}
                                    disabled={isGeneratingQR === ticket.id || event?.status === 'cancelled' || ticket.status === 'resale'}
                                    className="text-[8px] font-black uppercase tracking-widest text-[var(--accent-teal)] hover:underline disabled:opacity-30"
                                 >
                                    {isGeneratingQR === ticket.id ? 'Signing...' : 
                                     ticket.status === 'resale' ? 'Listed for Resale' : 'Tap to Generate Secure QR'}
                                 </button>
                               )}
                            </div>
                          )}
                          
                          {event?.status === 'cancelled' && (
                            <div className="absolute inset-0 flex items-center justify-center -rotate-12">
                               <span className="text-[10px] font-black text-red-600 border-2 border-red-600 px-1 py-0.5 rounded uppercase tracking-tighter bg-white shadow-xl">Invalid</span>
                            </div>
                          )}
                        </div>

                        {secureQRs[ticket.id] && (
                           <div className="bg-[var(--accent-teal)]/10 text-[7px] font-black uppercase text-[var(--accent-teal)] py-1.5 px-3 rounded-lg border border-[var(--accent-teal)]/20 animate-pulse whitespace-nowrap">
                              Valid for: {Math.max(0, Math.ceil((secureQRs[ticket.id].expiresAt - Math.floor(Date.now() / 1000)) / 60))}m left
                           </div>
                        )}
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
                        <div className="flex items-center gap-2">
                          <a
                            href={`https://sepolia.etherscan.io/nft/${config.contractAddress}/${ticket.tokenId}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-[var(--accent-teal)]/20 bg-[var(--accent-teal)]/5 text-[var(--accent-teal)] text-[9px] font-black uppercase tracking-widest hover:bg-[var(--accent-teal)]/10 transition-all"
                          >
                            <ExternalLink size={12} /> Etherscan
                          </a>

                          {!isPast && event?.status !== 'cancelled' && ticket.status === 'active' && (
                            <button
                              onClick={() => {
                                setSelectedTicketForResale({ ticket, event });
                                setIsResaleModalOpen(true);
                              }}
                              className="flex items-center gap-2 px-4 py-2.5 rounded-xl glass-panel border border-white/10 text-[9px] font-black uppercase tracking-widest hover:bg-white hover:text-black transition-all italic"
                            >
                              <Share2 size={12} /> Resell
                            </button>
                          )}

                          {!isPast && event?.status !== 'cancelled' && ticket.status === 'resale' && (
                            <button
                              onClick={() => handleCancelResale(ticket)}
                              disabled={processingId === ticket.id}
                              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-[9px] font-black uppercase tracking-widest hover:bg-red-500 hover:text-white transition-all italic disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              {processingId === ticket.id ? <Loader2 size={12} className="animate-spin" /> : <Ban size={12} />}
                              {processingId === ticket.id ? 'Cancelling...' : 'Cancel'}
                            </button>
                          )}

                          {event?.status === 'cancelled' && !ticket.isRefunded && (
                            <button
                              onClick={() => handleClaimRefund(ticket)}
                              disabled={processingId === ticket.id}
                              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-orange-500/10 border border-orange-500/20 text-orange-400 text-[9px] font-black uppercase tracking-widest hover:bg-orange-500 hover:text-white transition-all italic disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              {processingId === ticket.id ? <Loader2 size={12} className="animate-spin" /> : null}
                              {processingId === ticket.id ? 'Claiming...' : 'Claim Refund'}
                            </button>
                          )}

                          {event?.status === 'cancelled' && ticket.isRefunded && (
                            <span className="flex items-center px-4 py-2.5 rounded-xl bg-[var(--status-success)]/10 text-[var(--status-success)] text-[9px] font-black uppercase tracking-widest italic border border-[var(--status-success)]/20">
                              Refunded
                            </span>
                          )}
                        </div>
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

      <ResaleModal
        isOpen={isResaleModalOpen}
        onClose={() => setIsResaleModalOpen(false)}
        ticket={selectedTicketForResale?.ticket}
        event={selectedTicketForResale?.event}
        onList={(price) => handleResale(selectedTicketForResale.ticket, price)}
        processingId={processingId}
      />
    </motion.div>
  );
};

import React, { useState } from 'react';
import { toast } from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  X, Calendar, MapPin, Tag, Wallet, 
  Loader2, CheckCircle, Plus, Minus, ShoppingBag, Users
} from 'lucide-react';
import type { Event } from '../../store/useEventStore';
import { useEventStore } from '../../store/useEventStore';
import { useTicketStore } from '../../store/useTicketStore';
import { useAuthStore } from '../../store/useAuthStore';
import { config } from '../../config';
import { ethers } from 'ethers';
import { useIPFSImage } from '../../hooks/useIPFSImage';

const CONTRACT_ABI = [
  "function buyTicket(uint256 eventId, uint256 tierId) public payable",
  "function buyBatchTickets(uint256 eventId, uint256[] memory tierIds, uint24[] memory quantities) public payable",
  "function buyResaleTicket(uint256 tokenId) public payable",
  "event TicketMinted(uint256 indexed tokenId, uint256 indexed eventId, address indexed buyer, uint8 tier)",
  "event TicketResold(uint256 indexed tokenId, address indexed oldOwner, address indexed newOwner, uint256 priceWei)"
];



interface EventDetailModalProps {
  event: Event | null;
  isOpen: boolean;
  onClose: () => void;
}

type MarketType = 'primary' | 'secondary';
type Step = 'details' | 'confirming' | 'success' | 'error';

export const EventDetailModal: React.FC<EventDetailModalProps> = ({ event, isOpen, onClose }) => {
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [selectedResaleTicket, setSelectedResaleTicket] = useState<any>(null);
  const [marketType, setMarketType] = useState<MarketType>('primary');
  const [step, setStep] = useState<Step>('details');
  const [purchasedTokenId, setPurchasedTokenId] = useState('');
  const [purchasedTxHash, setPurchasedTxHash] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const { buyTicket, buyResaleTicket: storeBuyResale, tickets } = useTicketStore();
  const { incrementTierSold } = useEventStore();
  const { user, isAuthenticated } = useAuthStore();

  const { src: modalImageSrc } = useIPFSImage(event?.imageUrl);
  const resaleTickets = tickets.filter(t => t.eventId === event?.id && t.status === 'resale');

  if (!isOpen || !event) return null;

  const date = new Date(event.date);
  const isOrganizer = user?.id?.toLowerCase() === event.organizerId?.toLowerCase();

  const getTierQuantity = (tierId: string) => quantities[tierId] || 0;
  
  const updateTierQuantity = (tierId: string, delta: number, tierAvailable: number) => {
    const currentTier = getTierQuantity(tierId);
    const currentTotal = totalQuantity;
    
    // Global limit of 10 tickets total across all tiers
    if (delta > 0 && currentTotal >= 10) return;
    
    const next = Math.max(0, Math.min(tierAvailable, currentTier + delta));
    setQuantities(prev => ({ ...prev, [tierId]: next }));
  };

  const totalQuantity = Object.values(quantities).reduce((sum: number, q: number) => sum + q, 0) as number;
  const totalPrice = event.tiers.reduce((sum: number, tier) => sum + (tier.price * getTierQuantity(tier.id)), 0) as number;

  const handleClose = () => {
    setStep('details');
    setQuantities({});
    setErrorMsg('');
    onClose();
  };

  const handlePurchase = async () => {
    if (!isAuthenticated || !user) {
      toast.error("Please connect your wallet first.");
      return;
    }
    if (totalQuantity === 0) return;
    if (isOrganizer) {
      setErrorMsg("Organisers cannot purchase tickets for their own events.");
      setStep('error');
      return;
    }
    setStep('confirming');
    try {
      const provider = new ethers.BrowserProvider((window as any).ethereum);
      const signer = await provider.getSigner();
      const contract = new ethers.Contract(config.contractAddress, CONTRACT_ABI, signer);

      const totalValue = ethers.parseEther(totalPrice.toFixed(18));
      const numericEventId = parseInt(event.id.replace('evt_', ''), 10) || 1;
      
      const tierIndices: number[] = [];
      const tierQtys: number[] = [];
      
      event.tiers.forEach((tier, idx) => {
        const q = getTierQuantity(tier.id);
        if (q > 0) {
          tierIndices.push(idx);
          tierQtys.push(q);
        }
      });


      const tx = await contract.buyBatchTickets(numericEventId, tierIndices, tierQtys, { value: totalValue });
      const receipt = await tx.wait();

      const mintedIds: string[] = [];
      if (receipt && receipt.logs) {
        receipt.logs.forEach((log: any) => {
          try {
            const parsed = contract.interface.parseLog(log);
            if (parsed && parsed.name === 'TicketMinted') {
              mintedIds.push(parsed.args.tokenId.toString());
            }
          } catch (e) {}
        });
      }

      let logIdx = 0;
      event.tiers.forEach(tier => {
        const q = getTierQuantity(tier.id);
        for (let i = 0; i < q; i++) {
          const tId = mintedIds[logIdx] || Date.now().toString() + i;
          buyTicket(event.id, user.id, tier.name, tier.price, tId, receipt.hash);
          incrementTierSold(event.id, tier.id);
          logIdx++;
        }
      });

      setPurchasedTokenId(mintedIds.length > 0 ? mintedIds[0] : "Multiple");
      setPurchasedTxHash(receipt.hash);
      setStep('success');
    } catch (err: any) {
      console.error("Purchase failed:", err);
      if (err.code === 4001 || err.message?.toLowerCase().includes("user rejected")) {
        setErrorMsg("Transaction cancelled in MetaMask. Please try again when you're ready.");
      } else {
        setErrorMsg(err.reason || err.message || 'Transaction failed.');
      }
      setStep('error');
    }
  };

  const handleBuyResale = async () => {
    if (!isAuthenticated || !user) { toast.error("Please connect wallet."); return; }
    if (!selectedResaleTicket) return;
    setStep('confirming');
    try {
      const provider = new ethers.BrowserProvider((window as any).ethereum);
      const signer = await provider.getSigner();
      const contract = new ethers.Contract(config.contractAddress, CONTRACT_ABI, signer);
      // resalePrice is in ETH (already converted from gwei when read from chain)
      const priceWei = ethers.parseEther(selectedResaleTicket.resalePrice.toString());
      const tx = await contract.buyResaleTicket(selectedResaleTicket.tokenId, { value: priceWei });
      const receipt = await tx.wait();
      storeBuyResale(selectedResaleTicket.id, user.id, selectedResaleTicket.resalePrice);
      setPurchasedTokenId(selectedResaleTicket.tokenId);
      setPurchasedTxHash(receipt.hash);
      setStep('success');
    } catch (err: any) {
      setErrorMsg(err.message || 'Resale failed.');
      setStep('error');
    }
  };

  const truncate = (hash: string) => `${hash.slice(0, 10)}...${hash.slice(-8)}`;

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
          <motion.div 
            initial={{ opacity: 0 }} 
            animate={{ opacity: 1 }} 
            exit={{ opacity: 0 }} 
            className="absolute inset-0 bg-black/80 backdrop-blur-sm" 
            onClick={step === 'confirming' ? undefined : handleClose} 
          />
          <motion.div initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 20 }} className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-3xl border border-white/10 bg-[#0a0a0f] shadow-2xl" onClick={(e) => e.stopPropagation()}>
            {step !== 'confirming' && (
              <button 
                onClick={handleClose} 
                className="absolute top-5 right-5 z-10 w-8 h-8 rounded-xl flex items-center justify-center text-white/40 hover:text-white hover:bg-white/5 transition-all"
              >
                <X size={18} />
              </button>
            )}
            {step === 'details' && (
              <div className="pb-8">
                <div className="relative h-56 overflow-hidden">
                  <img src={modalImageSrc} alt={event.title} className="w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-gradient-to-t from-[#0a0a0f] to-transparent" />
                  <div className="absolute bottom-6 left-6">
                    <span className="px-3 py-1 rounded-full bg-[var(--accent-teal)]/10 border border-[var(--accent-teal)]/30 text-[9px] font-black uppercase tracking-widest text-[var(--accent-teal)] mb-3 inline-block">Verified Event</span>
                    {event.royaltyBps > 0 && (
                      <span className="ml-2 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-[9px] font-black uppercase tracking-widest text-white/50 mb-3 inline-block">
                        {event.royaltyBps}% Royalty
                      </span>
                    )}
                    <h2 className="text-3xl font-black tracking-tight italic text-white">{event.title}</h2>

                  </div>
                </div>
                <div className="p-8 space-y-8">
                  <div className="flex flex-wrap gap-6 text-[11px] font-bold text-white/40 tracking-widest">

                    <span className="flex items-center gap-2"><Calendar size={14} className="text-[var(--accent-purple)]" /> {date.toLocaleDateString()}</span>
                    <span className="flex items-center gap-2">
                      <MapPin size={14} className="text-[var(--accent-teal)]" /> 
                      {event.locationLink ? (
                        <a href={event.locationLink} target="_blank" rel="noopener noreferrer" className="hover:text-[var(--accent-teal)] transition-colors underline decoration-dotted underline-offset-4">
                          {event.venueName ? `${event.venueName}, ${event.location}` : event.location}
                        </a>
                      ) : (
                        event.venueName ? `${event.venueName}, ${event.location}` : event.location
                      )}
                    </span>
                    {event.minAge && (
                      <span className="flex items-center gap-2 text-orange-400/80"><Users size={14} /> {event.minAge}</span>
                    )}
                    <span className="flex items-center gap-2"><Tag size={14} /> {event.category}</span>
                  </div>
                  <p className="text-sm text-white/60 leading-relaxed">{event.description}</p>
                  <div className="flex p-1.5 rounded-2xl bg-white/5 border border-white/10">
                    <button onClick={() => setMarketType('primary')} className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${marketType === 'primary' ? 'bg-white text-black shadow-xl' : 'text-white/30 hover:text-white'}`}>Primary Sale</button>
                    <button onClick={() => setMarketType('secondary')} className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${marketType === 'secondary' ? 'bg-white text-black shadow-xl' : 'text-white/30 hover:text-white'}`}>Resale Market ({resaleTickets.length})</button>
                  </div>
                  {marketType === 'primary' ? (
                    <div className="space-y-4">
                      <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-[var(--accent-purple)] italic">Available Tiers</h3>
                      <div className="grid gap-3">
                        {event.tiers.map((tier) => {
                          const q = getTierQuantity(tier.id);
                          const isSoldOut = tier.sold >= tier.supply;
                          return (
                            <div key={tier.id} className={`flex flex-col p-5 rounded-2xl border transition-all ${q > 0 ? 'border-[var(--accent-purple)] bg-[var(--accent-purple)]/10 shadow-lg shadow-purple-500/10' : isSoldOut ? 'opacity-30 border-white/5' : 'border-white/10 bg-white/5'}`}>
                              <div className="flex items-center justify-between mb-4">
                                <div>
                                  <p className="font-black tracking-tight italic text-sm text-white">{tier.name}</p>

                                  <p className="text-[10px] text-white/40 font-bold mt-1 uppercase">{tier.sold} / {tier.supply} Sold</p>
                                </div>
                                <div className="text-right">
                                  <p className="text-sm font-black text-[var(--accent-teal)]">{tier.price} ETH</p>
                                  {q > 0 && <p className="text-[9px] font-black text-white/40 mt-1 uppercase tracking-widest">Sub: {(tier.price * q).toFixed(3)} ETH</p>}
                                </div>
                              </div>
                              {!isSoldOut && !isOrganizer && (
                                <div className="flex items-center justify-center gap-6 pt-2 border-t border-white/5">
                                  <button onClick={() => updateTierQuantity(tier.id, -1, tier.supply - tier.sold)} className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center text-white/40 hover:text-white hover:bg-white/10 transition-all"><Minus size={14} /></button>
                                  <span className="w-4 text-center font-black italic text-white text-base">{q}</span>
                                  <button onClick={() => updateTierQuantity(tier.id, 1, tier.supply - tier.sold)} className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center text-white/40 hover:text-white hover:bg-white/10 transition-all"><Plus size={14} /></button>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-[var(--accent-teal)] italic">Secondary Listings</h3>
                      {resaleTickets.length > 0 ? (
                        <div className="grid gap-3">
                          {resaleTickets.map((t) => (
                            <button key={t.id} onClick={() => setSelectedResaleTicket(t)} className={`flex items-center justify-between p-5 rounded-2xl border transition-all text-left ${selectedResaleTicket?.id === t.id ? 'border-[var(--accent-teal)] bg-[var(--accent-teal)]/10 shadow-lg shadow-teal-500/10' : 'border-white/10 bg-white/5 hover:bg-white/10'}`}>
                              <div>
                                <p className="font-black tracking-tight italic text-sm text-white">{t.tierName}</p>

                                <p className="text-[10px] text-white/40 font-bold mt-1 uppercase">Token #{t.tokenId.slice(-6)}</p>
                              </div>
                              <p className="text-sm font-black text-white">{t.resalePrice} ETH</p>
                            </button>
                          ))}
                        </div>
                      ) : (
                        <div className="p-10 text-center rounded-2xl bg-white/5 border border-dashed border-white/10">
                          <p className="text-[10px] font-bold text-white/20 uppercase tracking-widest italic">No active listings</p>
                        </div>
                      )}
                    </div>
                  )}
                  <div className="pt-4 space-y-4">
                    {marketType === 'primary' && totalQuantity > 0 && (
                      <div className="flex items-center justify-between p-6 rounded-2xl bg-[var(--accent-teal)]/5 border border-[var(--accent-teal)]/20">
                        <div><p className="text-[9px] font-black uppercase tracking-[0.2em] text-[var(--accent-teal)] mb-1">Total Cart Value</p><p className="text-2xl font-black text-white italic">{totalPrice.toFixed(3)} ETH</p></div>
                        <div className="text-right"><p className="text-[9px] font-black uppercase tracking-[0.2em] text-white/30 mb-1">Items</p><p className="text-lg font-black text-white/60">{totalQuantity} Tickets</p></div>
                      </div>
                    )}
                    {!isOrganizer && (
                      <motion.button whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.99 }} disabled={marketType === 'primary' ? totalQuantity === 0 : !selectedResaleTicket} onClick={marketType === 'primary' ? handlePurchase : handleBuyResale} className={`w-full py-4 rounded-xl font-black uppercase tracking-[0.2em] text-[10px] flex items-center justify-center gap-3 transition-all ${(marketType === 'primary' ? totalQuantity > 0 : selectedResaleTicket) ? 'bg-white text-black shadow-xl hover:bg-[var(--accent-teal)] hover:text-white' : 'bg-white/5 text-white/20 cursor-not-allowed border border-white/5'}`}>
                        {marketType === 'primary' ? <ShoppingBag size={16} /> : <Wallet size={16} />}
                        {marketType === 'primary' ? (totalQuantity > 0 ? `Checkout ( ${totalPrice.toFixed(3)} ETH )` : 'Select Tickets') : 'Buy Resale Ticket'}
                      </motion.button>
                    )}
                  </div>
                </div>
              </div>
            )}
            {step === 'confirming' && (
              <div className="p-24 text-center min-h-[500px] flex flex-col items-center justify-center">
                <div className="relative mb-12">
                  <div className="absolute inset-0 bg-[var(--accent-purple)]/20 blur-3xl rounded-full animate-pulse" />
                  <Loader2 size={80} className="text-[var(--accent-purple)] animate-spin relative z-10" />
                </div>
                <h3 className="text-4xl font-black uppercase tracking-tighter italic mb-4 text-white">MINTING IN PROGRESS…</h3>
                <p className="text-white/40 text-[10px] max-w-xs mx-auto leading-relaxed uppercase tracking-[0.3em] font-black">
                  DO NOT CLOSE THIS TAB OR REFRESH. 
                  <br/>Your transaction is being confirmed on the blockchain.
                </p>
              </div>
            )}
            {step === 'success' && <div className="p-20 text-center"><CheckCircle size={48} className="text-[var(--accent-teal)] mx-auto mb-8" /><h3 className="text-2xl font-black uppercase tracking-tight italic mb-3 text-white">Success!</h3><p className="text-white/40 text-sm mb-10">Your tickets have been minted on-chain.</p><div className="space-y-3 text-left max-w-sm mx-auto mb-10"><div className="p-4 rounded-xl bg-white/5 border border-white/10"><p className="text-[9px] uppercase tracking-widest font-black text-white/30 mb-1">Primary Token ID</p><p className="text-xs font-mono font-black text-white">#{purchasedTokenId}</p></div><div className="p-4 rounded-xl bg-white/5 border border-white/10"><p className="text-[9px] uppercase tracking-widest font-black text-white/30 mb-1">Tx Hash</p><p className="text-xs font-mono font-black text-white">{truncate(purchasedTxHash)}</p></div></div><button onClick={handleClose} className="w-full max-w-xs py-4 rounded-2xl bg-white text-black font-black uppercase tracking-widest text-[10px] hover:bg-[var(--accent-teal)] hover:text-white transition-all shadow-xl">Done</button></div>}
            {step === 'error' && <div className="p-20 text-center"><X size={48} className="text-red-500 mx-auto mb-8" /><h3 className="text-2xl font-black uppercase tracking-tight italic mb-3 text-red-500">Failed</h3><p className="text-white/40 text-sm mb-10 px-6">{errorMsg}</p><button onClick={() => setStep('details')} className="w-full max-w-xs py-4 rounded-2xl bg-white text-black font-black uppercase tracking-widest text-[10px] hover:bg-red-500 hover:text-white transition-all shadow-xl">Try Again</button></div>}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

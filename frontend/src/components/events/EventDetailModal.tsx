import React, { useState, useCallback } from 'react';
import { X, Calendar, MapPin, Users, Tag, ShieldCheck, ExternalLink, Loader2, CheckCircle, AlertCircle, Wallet } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import type { Event, TicketTier } from '../../store/useEventStore';
import { useEventStore } from '../../store/useEventStore';
import { useTicketStore } from '../../store/useTicketStore';
import { useAuthStore } from '../../store/useAuthStore';
import { LoginModal } from '../ui/LoginModal';
import { config } from '../../config';
import { ethers } from 'ethers';

const CONTRACT_ABI = [
  "function buyTicket(uint eventId) public payable",
  "function buyResaleTicket(uint tokenId) public payable",
  "event TicketMinted(uint indexed tokenId, uint indexed eventId, address indexed buyer)",
  "event TicketResold(uint indexed tokenId, address indexed oldOwner, address indexed newOwner, uint priceWei)"
];

interface EventDetailModalProps {
  event: Event | null;
  isOpen: boolean;
  onClose: () => void;
}

type Step = 'details' | 'confirming' | 'success' | 'error';
type MarketType = 'primary' | 'secondary';

export const EventDetailModal: React.FC<EventDetailModalProps> = ({ event, isOpen, onClose }) => {
  const [selectedTier, setSelectedTier] = useState<TicketTier | null>(null);
  const [selectedResaleTicket, setSelectedResaleTicket] = useState<any>(null);
  const [marketType, setMarketType] = useState<MarketType>('primary');
  const [step, setStep] = useState<Step>('details');
  const [purchasedTokenId, setPurchasedTokenId] = useState('');
  const [purchasedTxHash, setPurchasedTxHash] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [isLoginOpen, setIsLoginOpen] = useState(false);
  
  const { buyTicket, buyResaleTicket: storeBuyResale, tickets } = useTicketStore();
  const { incrementTierSold } = useEventStore();
  const { user, isAuthenticated, updateWallet } = useAuthStore();

  const resaleTickets = tickets.filter(t => t.eventId === event?.id && t.status === 'resale');

  if (!isOpen || !event) return null;

  const date = new Date(event.date);
  const isOrganizer = user?.id === event.organizerId;

  const FALLBACK_IMG = 'https://images.unsplash.com/photo-1492684223066-81342ee5ff30?auto=format&fit=crop&q=80';
  const extractCid = (url?: string): string | null => {
    if (!url) return null;
    const match = url.match(/\/ipfs\/(.+)$/);
    return match ? match[1] : null;
  };
  const cid = extractCid(event.imageUrl);
  const gateways = [
    'https://cloudflare-ipfs.com/ipfs',
    'https://dweb.link/ipfs',
    'https://ipfs.io/ipfs',
    'https://gateway.pinata.cloud/ipfs',
  ];
  const [modalGwIndex, setModalGwIndex] = useState(0);
  const modalImageSrc = cid
    ? `${gateways[modalGwIndex]}/${cid}`
    : (event.imageUrl || FALLBACK_IMG);
  const handleModalImgError = useCallback(() => {
    if (cid && modalGwIndex < gateways.length - 1) {
      setModalGwIndex(prev => prev + 1);
    }
  }, [cid, modalGwIndex, gateways.length]);

  const handleClose = () => {
    setStep('details');
    setSelectedTier(null);
    setErrorMsg('');
    onClose();
  };

  const handlePurchase = async () => {
    if (!isAuthenticated || !user) {
      setIsLoginOpen(true);
      return;
    }

    if (!selectedTier) return;

    // Check supply
    if (selectedTier.sold >= selectedTier.supply) {
      setErrorMsg('This tier is sold out.');
      setStep('error');
      return;
    }

    if (!config.contractAddress || config.contractAddress === "0x0000000000000000000000000000000000000000") {
      setErrorMsg('Contract not connected. Please set VITE_CONTRACT_ADDRESS.');
      setStep('error');
      return;
    }

    setStep('confirming');

    try {
      const provider = new ethers.BrowserProvider((window as any).ethereum);
      
      // Ensure correct network
      const network = await provider.getNetwork();
      if (network.chainId !== BigInt(config.sepoliaChainId)) {
        await (window as any).ethereum.request({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: '0xaa36a7' }],
        });
      }

      const signer = await provider.getSigner();
      const contract = new ethers.Contract(config.contractAddress, CONTRACT_ABI, signer);

      const priceWei = ethers.parseEther(selectedTier.price.toString());
      
      // Trigger real blockchain transaction
      // Assuming event.id is the numeric ID from the blockchain (synced in ManageEvents)
      const numericEventId = parseInt(event.id.replace('evt_', ''), 10) || 1; 
      const tx = await contract.buyTicket(numericEventId, { value: priceWei });
      const receipt = await tx.wait();

      // Find TokenID from logs
      let tokenId = `NFT_${Date.now()}`;
      if (receipt && receipt.logs) {
        try {
          const log = receipt.logs.find((l: any) => {
            try {
              return contract.interface.parseLog(l)?.name === 'TicketMinted';
            } catch { return false; }
          });
          if (log) {
            const parsed = contract.interface.parseLog(log);
            tokenId = parsed?.args?.tokenId?.toString() || tokenId;
          }
        } catch (e) {
          console.warn("Log parsing failed", e);
        }
      }

      buyTicket(event.id, user.id, selectedTier.name, selectedTier.price);
      incrementTierSold(event.id, selectedTier.id);
      updateWallet(-selectedTier.price);
      
      setPurchasedTokenId(tokenId);
      setPurchasedTxHash(receipt.hash);
      setStep('success');
    } catch (err: any) {
      console.error("Purchase failed:", err);
      setErrorMsg(err.message || 'Transaction failed. Please try again.');
      setStep('error');
    }
  };

  const handleBuyResale = async () => {
    if (!isAuthenticated || !user) {
      setIsLoginOpen(true);
      return;
    }

    if (!selectedResaleTicket) return;

    if (!config.contractAddress || config.contractAddress === "0x0000000000000000000000000000000000000000") {
      setErrorMsg('Contract not connected.');
      setStep('error');
      return;
    }

    setStep('confirming');

    try {
      const provider = new ethers.BrowserProvider((window as any).ethereum);
      const signer = await provider.getSigner();
      const contract = new ethers.Contract(config.contractAddress, CONTRACT_ABI, signer);

      const priceWei = ethers.parseEther(selectedResaleTicket.resalePrice.toString());
      
      const tx = await contract.buyResaleTicket(selectedResaleTicket.tokenId, { value: priceWei });
      const receipt = await tx.wait();

      storeBuyResale(selectedResaleTicket.id, user.id);
      
      setPurchasedTokenId(selectedResaleTicket.tokenId);
      setPurchasedTxHash(receipt.hash);
      setStep('success');
    } catch (err: any) {
      console.error("Resale purchase failed:", err);
      setErrorMsg(err.message || 'Transaction failed.');
      setStep('error');
    }
  };

  const truncate = (hash: string) => `${hash.slice(0, 10)}...${hash.slice(-8)}`;

  return (
    <>
      <AnimatePresence>
        {isOpen && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
              onClick={handleClose}
            />

            <motion.div
              initial={{ opacity: 0, scale: 0.92, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.92, y: 20 }}
              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
              className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-3xl border border-white/10 bg-[#0a0a0f]/98 backdrop-blur-2xl shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Close */}
              <button
                onClick={handleClose}
                className="absolute top-5 right-5 z-10 w-8 h-8 rounded-xl flex items-center justify-center text-white/40 hover:text-white hover:bg-white/5 transition-all"
              >
                <X size={18} />
              </button>

              {/* ── DETAILS / TIER SELECT ── */}
              {step === 'details' && (
                <div>
                  {/* Event Header */}
                  <div className="relative h-48 rounded-t-3xl overflow-hidden">
                    <img
                      src={modalImageSrc}
                      alt={event.title}
                      className="w-full h-full object-cover"
                      onError={handleModalImgError}
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-[#0a0a0f] via-[#0a0a0f]/50 to-transparent" />
                    <div className="absolute bottom-0 left-0 p-6">
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[var(--accent-teal)]/10 border border-[var(--accent-teal)]/30 text-[9px] font-black uppercase tracking-widest text-[var(--accent-teal)] mb-3">
                        <ShieldCheck size={10} /> Verified On-Chain
                      </span>
                      <h2 className="text-2xl font-black uppercase tracking-tight italic">{event.title}</h2>
                    </div>
                  </div>

                  <div className="p-6 space-y-6">
                    {/* Meta */}
                    <div className="flex flex-wrap items-center gap-4 text-[11px] font-bold text-white/50">
                      <span className="flex items-center gap-1.5"><Calendar size={12} className="text-[var(--accent-purple)]" />{date.toLocaleDateString('en-US', { weekday: 'short', month: 'long', day: 'numeric', year: 'numeric' })}</span>
                      <span className="flex items-center gap-1.5"><MapPin size={12} className="text-[var(--accent-teal)]" />{event.location}</span>
                      <span className="flex items-center gap-1.5"><Tag size={12} />{event.category}</span>
                      <span className="flex items-center gap-1.5 text-[var(--accent-teal)]"><ShieldCheck size={12} />{(event.royaltyBps / 100).toFixed(1)}% Royalty</span>
                    </div>

                    <p className="text-sm text-white/60 leading-relaxed">{event.description}</p>

                    {/* Market Type Toggle */}
                    <div className="flex p-1 rounded-xl bg-white/5 border border-white/10">
                      <button 
                        onClick={() => setMarketType('primary')}
                        className={`flex-1 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${marketType === 'primary' ? 'bg-white text-black' : 'text-white/40 hover:text-white'}`}
                      >
                        Primary Sale
                      </button>
                      <button 
                        onClick={() => setMarketType('secondary')}
                        className={`flex-1 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${marketType === 'secondary' ? 'bg-white text-black' : 'text-white/40 hover:text-white'}`}
                      >
                        Secondary Market ({resaleTickets.length})
                      </button>
                    </div>

                    {/* Contract Check Warning */}
                    {(config.contractAddress === "0x0000000000000000000000000000000000000000") && (
                      <div className="p-4 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center gap-3">
                        <AlertCircle className="text-red-400 shrink-0" size={18} />
                        <p className="text-[10px] font-bold text-red-200 uppercase tracking-widest leading-relaxed">
                          Contract not connected. Please set <code className="text-white">VITE_CONTRACT_ADDRESS</code> to enable purchases.
                        </p>
                      </div>
                    )}

                    {/* Tier Selector (Primary) */}
                    {marketType === 'primary' && (
                      <div>
                        <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-[var(--accent-purple)] mb-4 italic">Select Ticket Tier</h3>
                        <div className="space-y-3">
                          {event.tiers.map(tier => {
                            const isSoldOut = tier.sold >= tier.supply;
                            const isSelected = selectedTier?.id === tier.id;
                            return (
                              <button
                                key={tier.id}
                                disabled={isSoldOut}
                                onClick={() => setSelectedTier(tier)}
                                className={`w-full p-4 rounded-2xl border text-left transition-all flex items-center justify-between ${
                                  isSoldOut
                                    ? 'border-white/5 bg-white/[0.02] opacity-50 cursor-not-allowed'
                                    : isSelected
                                    ? 'border-[var(--accent-purple)]/50 bg-[var(--accent-purple)]/10'
                                    : 'border-white/10 bg-white/[0.03] hover:bg-white/[0.06] hover:border-white/20'
                                }`}
                              >
                                <div>
                                  <p className="font-black uppercase tracking-tight italic">{tier.name}</p>
                                  <p className="text-[11px] text-white/40 font-bold mt-0.5">
                                    <Users size={10} className="inline mr-1" />
                                    {tier.sold}/{tier.supply} sold
                                    {isSoldOut && <span className="ml-2 text-red-400">SOLD OUT</span>}
                                  </p>
                                </div>
                                <div className="text-right">
                                  <p className="text-xl font-black text-transparent bg-clip-text bg-gradient-to-r from-[var(--accent-purple)] to-[var(--accent-teal)]">
                                    {tier.price} ETH
                                  </p>
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Resale Market (Secondary) */}
                    {marketType === 'secondary' && (
                      <div>
                        <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-[var(--accent-teal)] mb-4 italic">Available Resale Tickets</h3>
                        <div className="space-y-3">
                          {resaleTickets.map(tkt => (
                            <button
                              key={tkt.id}
                              onClick={() => setSelectedResaleTicket(tkt)}
                              className={`w-full p-4 rounded-2xl border text-left transition-all flex items-center justify-between ${
                                selectedResaleTicket?.id === tkt.id
                                  ? 'border-[var(--accent-teal)]/50 bg-[var(--accent-teal)]/10'
                                  : 'border-white/10 bg-white/[0.03] hover:bg-white/[0.06] hover:border-white/20'
                              }`}
                            >
                              <div>
                                <p className="font-black uppercase tracking-tight italic">{tkt.tierName}</p>
                                <p className="text-[9px] font-mono text-white/40 font-bold mt-0.5">
                                  ID: {tkt.tokenId.slice(0, 10)}...
                                </p>
                              </div>
                              <div className="text-right">
                                <p className="text-xl font-black text-[var(--accent-teal)]">
                                  {tkt.resalePrice} ETH
                                </p>
                              </div>
                            </button>
                          ))}
                          {resaleTickets.length === 0 && (
                            <div className="py-12 text-center rounded-3xl border border-dashed border-white/5 bg-white/[0.01]">
                              <p className="text-[10px] font-black uppercase tracking-widest text-white/20 italic">No tickets listed for resale.</p>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Purchase Button */}
                    <div className="space-y-3">
                      {isOrganizer ? (
                        <div className="p-4 rounded-2xl bg-white/5 border border-white/10 text-center">
                          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/30 italic">
                            Organiser Management Mode
                          </p>
                          <p className="text-[9px] font-bold text-white/20 mt-1 uppercase tracking-widest">
                            You cannot purchase tickets for your own event
                          </p>
                        </div>
                      ) : (
                        <motion.button
                          whileHover={{ scale: 1.02 }}
                          whileTap={{ scale: 0.98 }}
                          disabled={marketType === 'primary' ? !selectedTier : !selectedResaleTicket}
                          onClick={marketType === 'primary' ? handlePurchase : handleBuyResale}
                          className={`w-full py-4 rounded-2xl font-black uppercase tracking-widest text-xs flex items-center justify-center gap-3 transition-all ${
                            (marketType === 'primary' ? selectedTier : selectedResaleTicket)
                              ? 'bg-white text-black shadow-2xl hover:shadow-white/20'
                              : 'bg-white/10 text-white/30 cursor-not-allowed'
                          }`}
                        >
                          <Wallet size={16} />
                          {marketType === 'primary' 
                            ? (selectedTier ? `Purchase ${selectedTier.name} — ${selectedTier.price} ETH` : 'Select a tier to continue')
                            : (selectedResaleTicket ? `Buy Resale Ticket — ${selectedResaleTicket.resalePrice} ETH` : 'Select a ticket to buy')
                          }
                        </motion.button>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* ── CONFIRMING ── */}
              {step === 'confirming' && (
                <div className="p-10 text-center">
                  <div className="w-16 h-16 rounded-2xl bg-[var(--accent-purple)]/10 border border-[var(--accent-purple)]/30 flex items-center justify-center mx-auto mb-6">
                    <Loader2 size={32} className="text-[var(--accent-purple)] animate-spin" />
                  </div>
                  <h3 className="text-xl font-black uppercase tracking-tight italic mb-3">Confirming Transaction…</h3>
                  <p className="text-white/50 text-sm font-medium">Minting your NFT ticket on Sepolia Testnet.</p>
                  <div className="mt-6 flex items-center justify-center gap-2 text-[11px] font-bold uppercase tracking-widest text-white/30">
                    <span className="w-2 h-2 rounded-full bg-[var(--accent-purple)] animate-pulse" />
                    Processing on-chain
                  </div>
                </div>
              )}

              {/* ── SUCCESS ── */}
              {step === 'success' && (
                <div className="p-10 text-center">
                  <div className="w-16 h-16 rounded-2xl bg-[var(--accent-teal)]/10 border border-[var(--accent-teal)]/30 flex items-center justify-center mx-auto mb-6">
                    <CheckCircle size={32} className="text-[var(--accent-teal)]" />
                  </div>
                  <h3 className="text-xl font-black uppercase tracking-tight italic mb-2">Ticket Purchased!</h3>
                  <p className="text-white/50 text-sm font-medium mb-6">Your NFT ticket has been minted successfully.</p>

                  <div className="space-y-3 text-left max-w-sm mx-auto">
                    <div className="p-4 rounded-xl bg-white/5 border border-white/10">
                      <p className="text-[9px] uppercase tracking-widest font-bold text-white/40 mb-1">Token ID</p>
                      <p className="text-xs font-mono font-bold text-white break-all">{purchasedTokenId}</p>
                    </div>
                    <div className="p-4 rounded-xl bg-white/5 border border-white/10">
                      <p className="text-[9px] uppercase tracking-widest font-bold text-white/40 mb-1">Transaction Hash</p>
                      <p className="text-xs font-mono font-bold text-white">{truncate(purchasedTxHash)}</p>
                    </div>
                    <a
                      href={`https://sepolia.etherscan.io/tx/${purchasedTxHash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-center gap-2 w-full py-3 rounded-xl border border-[var(--accent-teal)]/20 bg-[var(--accent-teal)]/5 text-[var(--accent-teal)] text-[11px] font-black uppercase tracking-widest hover:bg-[var(--accent-teal)]/10 transition-all"
                    >
                      <ExternalLink size={13} /> View on Etherscan
                    </a>
                  </div>

                  <button
                    onClick={handleClose}
                    className="mt-6 w-full max-w-sm mx-auto block py-3 rounded-xl bg-white text-black font-black uppercase tracking-widest text-xs"
                  >
                    Done
                  </button>
                </div>
              )}

              {/* ── ERROR ── */}
              {step === 'error' && (
                <div className="p-10 text-center">
                  <div className="w-16 h-16 rounded-2xl bg-red-500/10 border border-red-500/30 flex items-center justify-center mx-auto mb-6">
                    <AlertCircle size={32} className="text-red-400" />
                  </div>
                  <h3 className="text-xl font-black uppercase tracking-tight italic mb-3">Transaction Failed</h3>
                  <p className="text-white/60 text-sm font-medium mb-6">{errorMsg}</p>
                  <button
                    onClick={() => setStep('details')}
                    className="px-8 py-3 rounded-xl border border-white/10 text-white/60 font-black uppercase tracking-widest text-xs hover:bg-white/5 transition-all"
                  >
                    Try Again
                  </button>
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      <LoginModal isOpen={isLoginOpen} onClose={() => setIsLoginOpen(false)} />
    </>
  );
};

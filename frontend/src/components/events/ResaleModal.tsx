import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Tag, Info, AlertCircle, Loader2, Sparkles, TrendingUp, ShieldCheck } from 'lucide-react';

interface ResaleModalProps {
  isOpen: boolean;
  onClose: () => void;
  ticket: any;
  event: any;
  onList: (price: number) => Promise<void>;
  processingId: string | null;
}

export const ResaleModal: React.FC<ResaleModalProps> = ({ 
  isOpen, onClose, ticket, event, onList, processingId 
}) => {
  const [price, setPrice] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  const royalty = event?.royaltyBps || 0;
  const marginCap = 10;
  const totalCapPercent = royalty + marginCap;
  const maxPrice = ticket.tierPrice * (1 + totalCapPercent / 100);

  useEffect(() => {
    if (isOpen) {
      setPrice('');
      setError(null);
    }
  }, [isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const numericPrice = parseFloat(price);
    if (isNaN(numericPrice) || numericPrice <= 0) {
      setError("Please enter a valid price.");
      return;
    }

    if (numericPrice > maxPrice) {
      setError(`Price exceeds the maximum allowed resale limit of ${maxPrice.toFixed(4)} ETH.`);
      return;
    }

    await onList(numericPrice);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/90 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="relative w-full max-w-md bg-[#0a0a0f] border border-white/10 rounded-[2.5rem] shadow-2xl overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="p-8 pb-4 flex justify-between items-center">
              <div>
                <h2 className="text-2xl font-black italic tracking-tighter text-white">LIST FOR RESALE</h2>
                <div className="flex items-center gap-2 mt-1">
                   <div className="w-1.5 h-1.5 rounded-full bg-[var(--accent-teal)] animate-pulse" />
                   <p className="text-[9px] font-black uppercase tracking-[0.2em] text-white/40 italic">
                     Token ID #{ticket.tokenId}
                   </p>
                </div>
              </div>
              <button 
                onClick={onClose}
                className="w-10 h-10 rounded-full flex items-center justify-center bg-white/5 text-white/40 hover:text-white hover:bg-white/10 transition-all"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-8 pt-4 space-y-6">
              {/* Ticket Preview Card */}
              <div className="p-6 rounded-3xl bg-gradient-to-br from-white/[0.03] to-transparent border border-white/5 relative overflow-hidden group">
                <div className="absolute top-0 right-0 p-4 opacity-10">
                   <Sparkles size={40} className="text-[var(--accent-purple)]" />
                </div>
                
                <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--accent-purple)] mb-2 italic">
                   {event?.title || 'Unknown Event'}
                </h4>
                <div className="flex justify-between items-end">
                   <div>
                      <p className="text-xl font-black text-white italic">{ticket.tierName} TIER</p>
                      <p className="text-[9px] font-bold text-white/30 uppercase mt-1">
                        Original: {ticket.tierPrice} ETH
                      </p>
                   </div>
                   <div className="text-right">
                      <ShieldCheck size={20} className="text-[var(--accent-teal)] opacity-50 ml-auto mb-1" />
                      <p className="text-[8px] font-black uppercase tracking-widest text-[var(--accent-teal)] italic">Verified Asset</p>
                   </div>
                </div>
              </div>

              {/* Price Input Section */}
              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--accent-teal)] flex items-center gap-1.5">
                      <TrendingUp size={12} />
                      Set Resale Price
                    </label>
                    <span className="text-[10px] font-black text-white/30 italic">
                       MAX: {maxPrice.toFixed(4)} ETH
                    </span>
                  </div>
                  
                  <div className="relative group">
                    <input
                      type="number"
                      step="0.0001"
                      placeholder="0.00"
                      autoFocus
                      required
                      value={price}
                      onChange={e => setPrice(e.target.value)}
                      className={`w-full bg-white/5 border rounded-2xl py-4 px-6 focus:outline-none transition-all font-black text-2xl text-white placeholder:text-white/10 ${
                        error ? 'border-red-500/50' : 'border-white/10 focus:border-[var(--accent-teal)]'
                      }`}
                    />
                    <div className="absolute right-6 top-1/2 -translate-y-1/2 text-sm font-black text-white/20 italic">
                      ETH
                    </div>
                  </div>

                  {error && (
                    <div className="flex items-center gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/20 animate-in fade-in slide-in-from-top-2">
                       <AlertCircle size={14} className="text-red-400 shrink-0" />
                       <p className="text-[10px] font-bold text-red-400">{error}</p>
                    </div>
                  )}
                </div>

                {/* Economic Breakdown */}
                <div className="p-5 rounded-2xl bg-white/[0.02] border border-white/5 space-y-3">
                   <div className="flex items-start gap-3 mb-2">
                      <Info size={14} className="text-[var(--accent-purple)] mt-0.5" />
                      <p className="text-[9px] font-bold text-white/40 leading-relaxed uppercase tracking-wider">
                        To maintain a fair market, the maximum resale price is capped at {totalCapPercent}% above original cost 
                        ({royalty}% royalty + {marginCap}% margin).
                      </p>
                   </div>
                   
                   <div className="h-px bg-white/5 w-full" />
                   
                   <div className="flex justify-between items-center text-[10px] font-bold">
                      <span className="text-white/30 uppercase tracking-widest">Platform Royalty ({royalty}%)</span>
                      <span className="text-white/60">
                        {price ? (parseFloat(price) * (royalty/100)).toFixed(4) : '0.0000'} ETH
                      </span>
                   </div>
                   <div className="flex justify-between items-center text-[10px] font-black italic">
                      <span className="text-[var(--accent-teal)] uppercase tracking-widest">You Receive</span>
                      <span className="text-[var(--accent-teal)] text-sm">
                        {price ? (parseFloat(price) * (1 - royalty/100)).toFixed(4) : '0.0000'} ETH
                      </span>
                   </div>
                </div>

                <button
                  type="submit"
                  disabled={processingId !== null || !price}
                  className="w-full py-4 rounded-2xl bg-[var(--accent-teal)] text-black font-black uppercase tracking-[0.2em] italic flex items-center justify-center gap-3 hover:scale-[1.02] active:scale-95 transition-all shadow-xl shadow-[var(--accent-teal)]/10 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {processingId ? (
                    <>
                      <Loader2 size={18} className="animate-spin" />
                      Listing on chain...
                    </>
                  ) : (
                    <>
                      <Tag size={18} />
                      Confirm Listing
                    </>
                  )}
                </button>
              </form>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

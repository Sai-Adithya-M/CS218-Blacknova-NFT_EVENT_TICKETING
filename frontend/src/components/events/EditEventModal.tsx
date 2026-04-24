import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Loader2, AlertCircle, Info } from 'lucide-react';
import { ethers } from 'ethers';
import { config } from '../../config';
import { useEventStore, type Event } from '../../store/useEventStore';

// Only on-chain editable fields: maxTickets and priceWei
// ipfsHash (name, image, metadata) is immutable after creation
const ABI = [
  "function editEvent(uint256 eventId, uint24 newMaxTickets, uint40 newPriceWei) external"
];

interface EditEventModalProps {
  event: Event;
  onClose: () => void;
}

export const EditEventModal: React.FC<EditEventModalProps> = ({ event, onClose }) => {
  const { editEventLocally } = useEventStore();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const totalSold = event.tiers.reduce((sum, t) => sum + t.sold, 0);
  const totalSupply = event.tiers.reduce((sum, t) => sum + t.supply, 0);
  const currentPriceEth = event.tiers.length > 0
    ? Math.min(...event.tiers.map(t => t.price))
    : 0;

  const [maxTickets, setMaxTickets] = useState(totalSupply);
  const [priceEth, setPriceEth] = useState(currentPriceEth);

  const isValid = maxTickets >= totalSold && priceEth > 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      if (!(window as any).ethereum) throw new Error("MetaMask not found");

      const provider = new ethers.BrowserProvider((window as any).ethereum);
      const network = await provider.getNetwork();
      if (network.chainId !== BigInt(config.sepoliaChainId)) {
        throw new Error("Please switch your MetaMask network to Sepolia.");
      }

      if (maxTickets < totalSold) {
        throw new Error(`Max tickets cannot be less than tickets already sold (${totalSold}).`);
      }
      if (priceEth <= 0) throw new Error("Price must be greater than 0.");

      const signer = await provider.getSigner();
      const contract = new ethers.Contract(config.contractAddress, ABI, signer);

      const numericEventId = event.id.replace('evt_', '');
      // Contract stores price in gwei (uint40), not wei
      const newPriceWei = ethers.parseUnits(priceEth.toString(), "gwei");

      const tx = await contract.editEvent(
        numericEventId,
        maxTickets,      // uint24
        newPriceWei      // uint40 (as BigInt from parseEther)
      );
      await tx.wait();

      // Update local store — scale tier supplies proportionally, update price
      const scaleFactor = totalSupply > 0 ? maxTickets / totalSupply : 1;
      const updatedTiers = event.tiers.map(t => ({
        ...t,
        price: priceEth,
        supply: Math.max(t.sold, Math.round(t.supply * scaleFactor))
      }));

      editEventLocally(event.id, { tiers: updatedTiers });
      onClose();
    } catch (err: any) {
      console.error(err);
      setError(err.reason || err.message || "Failed to edit event");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className="bg-[#0a0a0a] border border-white/10 rounded-3xl w-full max-w-md"
        >
          {/* Header */}
          <div className="p-6 border-b border-white/5 flex justify-between items-center">
            <div>
              <h2 className="text-xl font-black italic tracking-wider text-white">EDIT EVENT</h2>
              <p className="text-[10px] text-white/30 font-bold uppercase tracking-widest mt-0.5 truncate max-w-[260px]">
                {event.title}
              </p>
            </div>
            <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition-colors text-white/50 hover:text-white">
              <X size={20} />
            </button>
          </div>

          <div className="p-6 space-y-5">
            {/* Info banner */}
            <div className="flex items-start gap-3 p-4 rounded-xl bg-[var(--accent-teal)]/5 border border-[var(--accent-teal)]/20">
              <Info size={14} className="text-[var(--accent-teal)] mt-0.5 shrink-0" />
              <p className="text-[10px] font-bold text-white/50 leading-relaxed">
                Event name, image and metadata are permanently stored on IPFS and cannot be changed.
                Only ticket supply and base price can be updated on-chain.
              </p>
            </div>

            {error && (
              <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-bold flex items-center gap-3">
                <AlertCircle size={16} />
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Max Tickets */}
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--accent-teal)]">
                  Total Ticket Supply
                </label>
                <div className="flex justify-between p-3 rounded-xl bg-white/[0.03] border border-white/5">
                  <span className="text-[10px] text-white/30 uppercase font-bold">Currently Sold</span>
                  <span className="text-[10px] font-black text-white/60">{totalSold} / {totalSupply}</span>
                </div>
                <input
                  type="number"
                  min={totalSold}
                  max={16777215}
                  step={1}
                  required
                  value={maxTickets}
                  onChange={e => setMaxTickets(Number(e.target.value))}
                  className="w-full bg-white/5 border border-white/10 rounded-xl py-3 px-4 focus:outline-none focus:border-[var(--accent-teal)] transition-all font-bold text-white"
                />
                {maxTickets < totalSold && (
                  <p className="text-[10px] text-red-400 font-bold">
                    Must be ≥ {totalSold} (tickets already sold)
                  </p>
                )}
              </div>

              {/* Base Price */}
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--accent-teal)]">
                  Base Price (ETH)
                </label>
                <div className="flex justify-between p-3 rounded-xl bg-white/[0.03] border border-white/5">
                  <span className="text-[10px] text-white/30 uppercase font-bold">Current Price</span>
                  <span className="text-[10px] font-black text-white/60">{currentPriceEth} ETH</span>
                </div>
                <input
                  type="number"
                  step="0.0001"
                  min="0.0001"
                  required
                  value={priceEth}
                  onChange={e => setPriceEth(Number(e.target.value))}
                  className="w-full bg-white/5 border border-white/10 rounded-xl py-3 px-4 focus:outline-none focus:border-[var(--accent-teal)] transition-all font-bold text-white"
                />
              </div>

              <button
                type="submit"
                disabled={isSubmitting || !isValid}
                className="w-full py-4 rounded-xl bg-[var(--accent-teal)] text-black font-black uppercase tracking-widest flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
              >
                {isSubmitting
                  ? <><Loader2 className="animate-spin" size={18} /> Saving...</>
                  : "Save Changes"}
              </button>
            </form>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

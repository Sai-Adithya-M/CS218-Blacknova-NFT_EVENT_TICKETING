import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Loader2, AlertCircle, Info, Layers } from 'lucide-react';
import { ethers } from 'ethers';
import { config } from '../../config';
import { useEventStore, type Event } from '../../store/useEventStore';

// On-chain editable: maxTickets, priceWei, and per-tier supplies
// ipfsHash (name, image, metadata) is immutable after creation
const ABI = [
  "function editEvent(uint256 eventId, uint256[] memory newPrices, uint256[] memory newSupplies) external"
];

interface EditEventModalProps {
  event: Event;
  onClose: () => void;
}

export const EditEventModal: React.FC<EditEventModalProps> = ({ event, onClose }) => {
  const { editEventLocally } = useEventStore();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Per-tier state (supply + price for each tier)
  const [tierSupplies, setTierSupplies] = useState<number[]>(
    event.tiers.map(t => t.supply)
  );
  const [tierPrices, setTierPrices] = useState<string[]>(
    event.tiers.map(t => t.price.toString())
  );

  const totalSold = event.tiers.reduce((sum, t) => sum + t.sold, 0);
  const newTotalSupply = tierSupplies.reduce((sum, s) => sum + s, 0);
  const lowestPrice = tierPrices.length > 0 ? Math.min(...tierPrices) : 0;

  // Validation: each tier supply must be >= its sold count, price must be > 0
  const tierSupplyErrors = event.tiers.map((t, i) =>
    tierSupplies[i] < t.sold ? `Must be ≥ ${t.sold} (already sold)` : null
  );
  const tierPriceErrors = tierPrices.map(p =>
    p <= 0 ? 'Must be > 0' : null
  );
  const hasErrors = tierSupplyErrors.some(e => e !== null) || tierPriceErrors.some(e => e !== null);
  const isValid = !hasErrors && newTotalSupply > 0;

  const updateTierSupply = (index: number, value: number) => {
    setTierSupplies(prev => prev.map((s, i) => i === index ? value : s));
  };

  const updateTierPrice = (index: number, value: string) => {
    setTierPrices(prev => prev.map((p, i) => i === index ? value : p));
  };

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

      if (newTotalSupply < totalSold) {
        throw new Error(`Total supply cannot be less than tickets already sold (${totalSold}).`);
      }
      if (lowestPrice <= 0) throw new Error("All tier prices must be greater than 0.");

      const signer = await provider.getSigner();
      const contract = new ethers.Contract(config.contractAddress, ABI, signer);

      const numericEventId = event.id.replace('evt_', '');
      const newPrices = tierPrices.map(p => ethers.parseUnits(p || "0", "ether"));
      const newSupplies = tierSupplies.map(s => BigInt(s));

      const tx = await contract.editEvent(
        numericEventId,
        newPrices,
        newSupplies
      );
      await tx.wait();

      // Update local store with per-tier supply + price changes
      const updatedTiers = event.tiers.map((t, i) => ({
        ...t,
        price: tierPrices[i],
        supply: tierSupplies[i]
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
                Only ticket supply and pricing can be updated on-chain.
              </p>
            </div>

            {error && (
              <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-bold flex items-center gap-3">
                <AlertCircle size={16} />
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Per-Tier Supply & Price */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--accent-teal)] flex items-center gap-1.5">
                    <Layers size={12} />
                    Ticket Tiers
                  </label>
                  <span className="text-[9px] font-black text-white/30 uppercase tracking-widest">
                    Total: {newTotalSupply}
                  </span>
                </div>

                <div className="space-y-2 max-h-[280px] overflow-y-auto pr-1 custom-scrollbar">
                  {event.tiers.map((tier, idx) => (
                    <div key={tier.id} className="p-3 rounded-xl bg-white/[0.03] border border-white/5 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-black text-white uppercase tracking-wider">{tier.name}</span>
                        <span className="text-[9px] font-bold text-white/30">
                          {tier.sold} sold
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1">
                          <span className="text-[8px] font-black uppercase tracking-widest text-white/20">Supply</span>
                          <input
                            type="number"
                            min={tier.sold}
                            max={16777215}
                            step={1}
                            required
                            value={tierSupplies[idx]}
                            onChange={e => updateTierSupply(idx, Number(e.target.value))}
                            className={`w-full bg-white/5 border rounded-lg py-2 px-3 focus:outline-none transition-all font-bold text-white text-sm ${
                              tierSupplyErrors[idx] ? 'border-red-500/50 focus:border-red-500' : 'border-white/10 focus:border-[var(--accent-teal)]'
                            }`}
                          />
                          {tierSupplyErrors[idx] && (
                            <p className="text-[8px] text-red-400 font-bold">{tierSupplyErrors[idx]}</p>
                          )}
                        </div>
                        <div className="space-y-1">
                          <span className="text-[8px] font-black uppercase tracking-widest text-white/20">Price (ETH)</span>
                          <input
                            type="number"
                            step="0.0001"
                            min="0"
                            required
                            value={tierPrices[idx]}
                            onChange={e => updateTierPrice(idx, e.target.value)}
                            className={`w-full bg-white/5 border rounded-lg py-2 px-3 focus:outline-none transition-all font-bold text-white text-sm ${
                              tierPriceErrors[idx] ? 'border-red-500/50 focus:border-red-500' : 'border-white/10 focus:border-[var(--accent-teal)]'
                            }`}
                          />
                          {tierPriceErrors[idx] && (
                            <p className="text-[8px] text-red-400 font-bold">{tierPriceErrors[idx]}</p>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
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

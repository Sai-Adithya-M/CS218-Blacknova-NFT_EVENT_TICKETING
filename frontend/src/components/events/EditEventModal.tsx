import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Upload, Loader2, AlertCircle, Trash2, Plus, Layers } from 'lucide-react';
import { ethers } from 'ethers';
import { config } from '../../config';
import { uploadJSONToIPFS, uploadToIPFS } from '../../utils/ipfs';
import { useEventStore, type Event, type TicketTier } from '../../store/useEventStore';

const ABI = [
  "function editEvent(uint256 eventId, string memory newIpfsHash, uint256 newMaxTickets, uint256 newPriceWei) external"
];

interface EditEventModalProps {
  event: Event;
  onClose: () => void;
}

export const EditEventModal: React.FC<EditEventModalProps> = ({ event, onClose }) => {
  const { editEventLocally } = useEventStore();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(event.imageUrl || null);

  const [formData, setFormData] = useState({
    title: event.title,
    description: event.description,
    date: event.date.slice(0, 16),
    location: event.location,
    category: event.category,
  });

  const [tiers, setTiers] = useState<Omit<TicketTier, 'id' | 'sold'>[]>(
    event.tiers.length > 0 
      ? event.tiers.map(t => ({ name: t.name, price: t.price, supply: t.supply }))
      : [{ name: 'General Access', price: 0, supply: 1 }]
  );

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setImageFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const addTier = () => {
    setTiers([...tiers, { name: '', price: 0, supply: 1 }]);
  };

  const removeTier = (index: number) => {
    setTiers(tiers.filter((_, i) => i !== index));
  };

  const updateTier = (index: number, field: keyof Omit<TicketTier, 'id' | 'sold'>, value: string | number) => {
    setTiers(tiers.map((t, i) => i === index ? { ...t, [field]: value } : t));
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

      // Validation
      if (tiers.length === 0) throw new Error("At least one ticket tier is required.");
      for (const tier of tiers) {
        if (!tier.name || tier.supply <= 0) throw new Error("All tiers must have a valid name and supply > 0");
      }

      const signer = await provider.getSigner();
      const contract = new ethers.Contract(config.contractAddress, ABI, signer);

      let finalImageUrl = event.imageUrl || '';
      if (imageFile) {
        const imageHash = await uploadToIPFS(imageFile);
        finalImageUrl = `ipfs://${imageHash}`;
      }

      // Ensure sold quantities are preserved for existing tiers
      const finalTiersArray = tiers.map((t, idx) => ({
        id: event.tiers[idx]?.id || `tier_${event.id}_${idx}`,
        name: t.name,
        price: Number(t.price),
        supply: Number(t.supply),
        sold: event.tiers[idx]?.sold || 0
      }));

      const metadataJSON = {
        name: formData.title,
        location: formData.location,
        date: new Date(formData.date).toISOString(),
        description: formData.description,
        category: formData.category,
        image: finalImageUrl || undefined,
        tiers: finalTiersArray
      };

      const ipfsHash = await uploadJSONToIPFS(metadataJSON);

      // Smart contract strictly needs the base price and total capacity
      const totalTickets = finalTiersArray.reduce((acc, t) => acc + t.supply, 0);
      const basePrice = Math.min(...finalTiersArray.map(t => t.price));
      const basePriceWei = ethers.parseEther(basePrice.toString());

      const numericEventId = event.id.replace('evt_', '');

      const tx = await contract.editEvent(
        numericEventId,
        ipfsHash,
        totalTickets,
        basePriceWei
      );

      await tx.wait();

      editEventLocally(event.id, {
        title: formData.title,
        description: formData.description,
        date: new Date(formData.date).toISOString(),
        location: formData.location,
        category: formData.category,
        imageUrl: finalImageUrl,
        tiers: finalTiersArray
      });

      onClose();
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Failed to edit event");
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
          className="bg-[#0a0a0a] border border-white/10 rounded-3xl w-full max-w-2xl max-h-[90vh] overflow-y-auto"
        >
          <div className="sticky top-0 bg-[#0a0a0a]/90 backdrop-blur-md p-6 border-b border-white/5 flex justify-between items-center z-10">
            <h2 className="text-xl font-black italic tracking-wider text-white">EDIT EVENT</h2>
            <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition-colors text-white/50 hover:text-white">
              <X size={20} />
            </button>
          </div>

          <div className="p-6">
            {error && (
              <div className="mb-6 p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-bold flex items-center gap-3">
                <AlertCircle size={16} />
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-4">
                <label className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--accent-teal)]">Event Title</label>
                <input
                  required
                  value={formData.title}
                  onChange={e => setFormData({ ...formData, title: e.target.value })}
                  className="w-full bg-white/5 border border-white/10 rounded-xl py-3 px-4 focus:outline-none focus:border-[var(--accent-teal)] transition-all font-bold text-white"
                />
              </div>

              <div className="space-y-4">
                <label className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--accent-teal)]">Description</label>
                <textarea
                  required
                  rows={3}
                  value={formData.description}
                  onChange={e => setFormData({ ...formData, description: e.target.value })}
                  className="w-full bg-white/5 border border-white/10 rounded-xl py-3 px-4 focus:outline-none focus:border-[var(--accent-teal)] transition-all font-medium text-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-4">
                  <label className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--accent-teal)]">Date</label>
                  <input
                    type="datetime-local"
                    required
                    value={formData.date}
                    onChange={e => setFormData({ ...formData, date: e.target.value })}
                    className="w-full bg-white/5 border border-white/10 rounded-xl py-3 px-4 focus:outline-none focus:border-[var(--accent-teal)] transition-all font-medium text-white"
                  />
                </div>
                <div className="space-y-4">
                  <label className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--accent-teal)]">Location</label>
                  <input
                    required
                    value={formData.location}
                    onChange={e => setFormData({ ...formData, location: e.target.value })}
                    className="w-full bg-white/5 border border-white/10 rounded-xl py-3 px-4 focus:outline-none focus:border-[var(--accent-teal)] transition-all font-medium text-white"
                  />
                </div>
              </div>

              {/* Tiers Section */}
              <div className="space-y-4 bg-white/[0.02] border border-white/5 p-4 rounded-2xl">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--accent-teal)] flex items-center gap-2">
                    <Layers size={14} /> Ticket Tiers
                  </label>
                  <button
                    type="button"
                    onClick={addTier}
                    className="flex items-center gap-1 text-[9px] font-black uppercase tracking-widest text-[var(--accent-teal)] bg-[var(--accent-teal)]/10 hover:bg-[var(--accent-teal)]/20 px-3 py-1.5 rounded-lg transition-colors"
                  >
                    <Plus size={12} /> Add Tier
                  </button>
                </div>

                <div className="space-y-3 max-h-[250px] overflow-y-auto pr-2">
                  {tiers.map((tier, index) => (
                    <div key={index} className="p-4 rounded-xl bg-white/[0.03] border border-white/10 space-y-3 mb-3">
                      <div className="flex items-center justify-between">
                        <span className="text-[9px] font-black uppercase tracking-widest text-white/30">
                          {index === 0 ? 'General Tier Details' : `Tier #${index + 1} Details`}
                        </span>
                        {index > 0 && (
                          <button
                            type="button"
                            onClick={() => removeTier(index)}
                            className="p-1.5 text-red-500/40 hover:text-red-500 transition-colors"
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                      <div className="grid grid-cols-3 gap-3">
                        <input
                          required
                          placeholder="Tier Name"
                          className="bg-white/5 border border-white/10 rounded-lg py-2.5 px-3 focus:outline-none focus:border-[var(--accent-teal)] transition-all text-sm font-bold text-white placeholder:text-white/20"
                          value={tier.name}
                          onChange={e => updateTier(index, 'name', e.target.value)}
                        />
                        <input
                          type="number"
                          step="0.001"
                          min="0"
                          required
                          placeholder="Price (ETH)"
                          className="bg-white/5 border border-white/10 rounded-lg py-2.5 px-3 focus:outline-none focus:border-[var(--accent-teal)] transition-all text-sm font-bold text-white placeholder:text-white/20"
                          value={tier.price}
                          onChange={e => updateTier(index, 'price', e.target.value)}
                        />
                        <input
                          type="number"
                          min="1"
                          required
                          placeholder="Supply"
                          className="bg-white/5 border border-white/10 rounded-lg py-2.5 px-3 focus:outline-none focus:border-[var(--accent-teal)] transition-all text-sm font-bold text-white placeholder:text-white/20"
                          value={tier.supply}
                          onChange={e => updateTier(index, 'supply', e.target.value)}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-4">
                <label className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--accent-teal)]">Update Banner Image</label>
                <div 
                  onClick={() => fileInputRef.current?.click()}
                  className="h-32 rounded-xl border border-dashed border-white/10 bg-white/[0.02] flex flex-col items-center justify-center gap-2 cursor-pointer relative overflow-hidden"
                >
                  {imagePreview ? (
                    <>
                      <img src={imagePreview} className="absolute inset-0 w-full h-full object-cover opacity-50" />
                      <div className="z-10 bg-black/60 px-4 py-2 rounded-lg backdrop-blur-md">
                        <span className="text-xs font-bold text-white">Click to Change Image</span>
                      </div>
                    </>
                  ) : (
                    <>
                      <Upload className="text-white/20" size={20} />
                      <span className="text-[10px] font-bold text-white/40 uppercase">Upload New Image</span>
                    </>
                  )}
                  <input type="file" ref={fileInputRef} onChange={handleImageChange} accept="image/*" className="hidden" />
                </div>
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full py-4 rounded-xl bg-[var(--accent-teal)] text-black font-black uppercase tracking-widest flex items-center justify-center disabled:opacity-50"
              >
                {isSubmitting ? <Loader2 className="animate-spin" /> : "Save Changes"}
              </button>
            </form>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

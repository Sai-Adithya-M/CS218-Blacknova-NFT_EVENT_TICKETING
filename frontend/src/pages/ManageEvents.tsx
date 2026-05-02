import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useEventStore, type Event, type TicketTier } from '../store/useEventStore';
import { useAuthStore } from '../store/useAuthStore';
import { Plus, LayoutDashboard, Upload, CheckCircle2, Layers, ShieldCheck, X as XIcon, Loader2, AlertCircle, Trash2, PieChart, ArrowUpRight, Camera, MapPin, ExternalLink } from 'lucide-react';
import { EventCard } from '../components/events/EventCard';
import { EditEventModal } from '../components/events/EditEventModal';
import { EventFinancialsModal } from '../components/events/EventFinancialsModal';
import { CancelEventModal } from '../components/events/CancelEventModal';
import { ScannerManagementModal } from '../components/events/ScannerManagementModal';
import { AuthFallback } from '../components/ui/AuthFallback';
import { motion, AnimatePresence } from 'framer-motion';
import { ethers } from 'ethers';
import { config } from '../config';
import { uploadJSONToIPFS, uploadToIPFS } from '../utils/ipfs';

const ABI = [
  "function createEvent(string memory ipfsHash, uint8 royaltyBps, uint256[] memory prices, uint256[] memory supplies) external",
  "event EventCreated(uint256 indexed eventId, address indexed organiser, string ipfsHash)"
];

interface TierFormData {
  name: string;
  price: string;
  supply: string;
}

export const ManageEvents: React.FC = () => {
  const navigate = useNavigate();
  const { events, isLoading, createEvent } = useEventStore();
  const { user } = useAuthStore();
  const [isCreating, setIsCreating] = useState(false);
  const [isMining, setIsMining] = useState(false);
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const [selectedFinancials, setSelectedFinancials] = useState<Event | null>(null);
  const [selectedScanners, setSelectedScanners] = useState<Event | null>(null);
  const [cancellingEvent, setCancellingEvent] = useState<Event | null>(null);
  const [manageTab, setManageTab] = useState<'active' | 'history'>('active');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [formData, setFormData] = useState({
    title: '',
    description: '',
    date: '',
    location: '',
    category: 'Music',
    royalty: '5',
    minAge: 'All ages',
    venueName: '',
    locationLink: '',
  });

  const [tiers, setTiers] = useState<TierFormData[]>([
    { name: 'General', price: '', supply: '100' },
  ]);

  if (!user) return <AuthFallback />;

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

  const removeImage = () => {
    setImageFile(null);
    setImagePreview(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const updateTier = (index: number, field: keyof TierFormData, value: string) => {
    setTiers(tiers.map((t, i) => i === index ? { ...t, [field]: value } : t));
  };

  const addTier = () => {
    if (tiers.length >= 3) {
      setError("Maximum 3 tiers allowed per event.");
      return;
    }
    setTiers([...tiers, { name: '', price: '', supply: '100' }]);
  };

  const removeTier = (index: number) => {
    if (tiers.length > 1) {
      setTiers(tiers.filter((_, i) => i !== index));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    const parsedTiers: TicketTier[] = tiers
      .filter(t => t.name && t.price && t.supply)
      .map((t, i) => ({
        id: `tier_${Date.now()}_${i}`,
        name: t.name,
        price: parseFloat(t.price),
        supply: parseInt(t.supply, 10),
        sold: 0,
      }));

    setError(null);

    const eventDateObj = new Date(formData.date);
    const now = new Date();

    if (eventDateObj.getTime() < now.getTime() - 60000) {
      setError("Event date cannot be in the past. Please select a future date.");
      return;
    }

    if (parsedTiers.length === 0) {
      setError("Please add at least one valid ticket tier.");
      return;
    }

    if (parsedTiers.some(t => t.price <= 0)) {
      setError("Ticket price must be greater than 0 ETH.");
      return;
    }

    setIsMining(true);
    try {
      if (!(window as any).ethereum) throw new Error("MetaMask not found");

      const provider = new ethers.BrowserProvider((window as any).ethereum);
      const network = await provider.getNetwork();
      if (network.chainId !== BigInt(config.sepoliaChainId)) {
        try {
          await (window as any).ethereum.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: '0xaa36a7' }],
          });
        } catch (switchError) {
          throw new Error("Please switch your MetaMask network to Sepolia to continue.");
        }
      }

      const signer = await provider.getSigner();
      const contract = new ethers.Contract(config.contractAddress, ABI, signer);

      const royaltyBps = Math.min(100, Math.max(0, Math.floor(parseFloat(formData.royalty || '0'))));

      let imageUrl = '';
      if (imageFile) {
        try {
          const imageHash = await uploadToIPFS(imageFile);
          imageUrl = `ipfs://${imageHash}`;
        } catch (err: any) {
          throw new Error("Failed to upload image to IPFS: " + err.message);
        }
      }

      const metadataJSON = {
        name: formData.title || 'Event',
        location: formData.location || '',
        venueName: formData.venueName || '',
        locationLink: formData.locationLink || '',
        minAge: formData.minAge || 'All ages',
        date: formData.date || new Date().toISOString(),
        description: formData.description || '',
        category: formData.category || 'Music',
        image: imageUrl || undefined,
        tiers: parsedTiers
      };

      let ipfsHash = "";
      try {
        ipfsHash = await uploadJSONToIPFS(metadataJSON);
      } catch (err: any) {
        throw new Error("Failed to upload metadata to IPFS: " + err.message);
      }

      // Build tier arrays as requested by new contract design
      const supplies = parsedTiers.map((t: any) => BigInt(t.supply));
      const prices = parsedTiers.map((t: any) => ethers.parseUnits(t.price.toString(), "ether"));

      const tx = await contract.createEvent(ipfsHash, royaltyBps, prices, supplies);
      const receipt = await tx.wait();

      let blockchainEventId = `evt_${Date.now()}`;
      if (receipt && receipt.logs) {
        try {
          const eventCreatedLog = receipt.logs.find((log: any) => {
            try {
              const parsed = contract.interface.parseLog(log);
              return parsed && parsed.name === 'EventCreated';
            } catch { return false; }
          });

          if (eventCreatedLog) {
            const parsedLog = contract.interface.parseLog(eventCreatedLog);
            if (parsedLog && parsedLog.args && (parsedLog.args.eventId || parsedLog.args[0])) {
              const id = (parsedLog.args.eventId || parsedLog.args[0]).toString();
              blockchainEventId = `evt_${id}`;
            }
          }
        } catch (err) {
          console.warn("Failed to parse eventId from log", err);
        }
      }

      const signerAddress = await signer.getAddress();
      
      let deploymentCost = "0";
      let gasUsedStr = "0";
      if (receipt) {
        const gasUsed = receipt.gasUsed;
        const gasPrice = receipt.effectiveGasPrice || tx.gasPrice || 0n;
        deploymentCost = (gasUsed * gasPrice).toString();
        gasUsedStr = gasUsed.toString();
      }

      createEvent({
        id: blockchainEventId,
        title: metadataJSON.name,
        description: metadataJSON.description,
        date: metadataJSON.date,
        location: metadataJSON.location,
        category: metadataJSON.category,
        organizerId: signerAddress,
        royaltyBps: royaltyBps,
        venueName: metadataJSON.venueName,
        minAge: metadataJSON.minAge,
        locationLink: metadataJSON.locationLink,
        status: 'active',
        deploymentCost,
        gasUsed: gasUsedStr,
        tiers: metadataJSON.tiers.map((t: any, idx: number) => ({
          id: t.id || `tier_${blockchainEventId}_${idx}`,
          name: t.name,
          price: t.price,
          supply: t.supply,
          sold: 0
        }))
      });
      
      setFormData({
        title: '',
        description: '',
        date: '',
        location: '',
        category: 'Music',
        royalty: '5',
        minAge: 'All ages',
        venueName: '',
        locationLink: '',
      });
      
      navigate('/events');
      setTiers([{ name: 'General', price: '', supply: '100' }]);
      setImageFile(null);
      setImagePreview(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (err: any) {
      console.error("Blockchain transaction failed:", err);
      if (err.code === 4001 || err.message?.toLowerCase().includes("user rejected")) {
        setError("Transaction cancelled in MetaMask.");
      } else {
        setError(err.message || "Failed to create event.");
      }
    } finally {
      setIsMining(false);
    }
  };

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: { opacity: 1, transition: { staggerChildren: 0.1 } }
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0 }
  };

  const isConfigMissing = !config.contractAddress || config.contractAddress === "0x0000000000000000000000000000000000000000";

  return (
    <motion.div
      initial="hidden"
      animate="visible"
      variants={containerVariants}
      className="px-12 pt-32 pb-12"
    >
      <AnimatePresence>
        {isMining && (
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
              <div className="w-16 h-16 rounded-2xl bg-[var(--accent-teal)]/10 border border-[var(--accent-teal)]/30 flex items-center justify-center mx-auto mb-6">
                <Loader2 size={32} className="text-[var(--accent-teal)] animate-spin" />
              </div>
              <h3 className="text-xl font-black uppercase tracking-tight italic mb-3">Minting Event…</h3>
              <p className="text-white/50 text-sm font-medium">Deploying event contract on Sepolia Testnet.</p>
              <div className="mt-6 flex items-center justify-center gap-2 text-[11px] font-bold uppercase tracking-widest text-white/30">
                <span className="w-2 h-2 rounded-full bg-[var(--accent-teal)] animate-pulse" />
                Processing on-chain
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      {isConfigMissing && (
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-12 p-6 rounded-3xl border border-red-500/20 bg-red-500/5 backdrop-blur-xl"
        >
          <div className="flex flex-col md:flex-row items-center gap-6">
            <div className="w-14 h-14 rounded-2xl bg-red-500/10 flex items-center justify-center shrink-0">
              <Plus className="text-red-400 rotate-45" size={28} />
            </div>
            <div className="flex-1 text-center md:text-left">
              <h3 className="text-lg font-black uppercase italic tracking-tight text-red-400 mb-1">Contract Not Connected</h3>
              <p className="text-sm text-white/60 font-medium leading-relaxed">
                Update VITE_CONTRACT_ADDRESS in your .env file.
              </p>
            </div>
          </div>
        </motion.div>
      )}

      <motion.div variants={itemVariants} className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6 mb-12">
        <div className="space-y-1">
          <h2 className="text-xs font-black tracking-[0.5em] uppercase text-[var(--accent-purple)] mb-3 italic opacity-80">Event Management</h2>
          <h1 className="text-6xl font-black tracking-tighter italic leading-none">CREATE EVENT</h1>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button
            className="px-8 py-4 rounded-2xl bg-white text-black font-black uppercase tracking-widest text-xs flex items-center gap-2 shadow-lg hover:shadow-white/20 transition-all"
            onClick={() => setIsCreating(!isCreating)}
          >
            {isCreating ? <LayoutDashboard size={16} /> : <Plus size={16} />}
            {isCreating ? 'View My Events' : 'Create New Event'}
          </button>
        </div>
      </motion.div>

      {isCreating ? (
        <motion.div variants={itemVariants} className="max-w-[1100px] mx-auto">
          <div className="grid lg:grid-cols-[1fr_380px] gap-12 items-start">
            <div className="glass-panel p-8 rounded-3xl border border-white/10 backdrop-blur-xl bg-white/[0.03]">
              {error && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mb-6 p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-[10px] font-bold flex items-start gap-3 break-words overflow-hidden"
                >
                  <AlertCircle size={14} className="shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="leading-relaxed line-clamp-3 hover:line-clamp-none transition-all cursor-help">
                      {error}
                    </p>
                  </div>
                </motion.div>
              )}
              <form onSubmit={handleSubmit} className="space-y-8">
                <section className="space-y-4">
                  <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-[var(--accent-purple)] italic">1. Basic Info</h3>
                  <input
                    required
                    placeholder="Event Name"
                    className="w-full bg-white/5 border border-white/10 rounded-xl py-3 px-4 focus:outline-none focus:border-[var(--accent-purple)] transition-all font-bold text-white placeholder:text-white/30"
                    value={formData.title}
                    onChange={e => setFormData({ ...formData, title: e.target.value })}
                  />
                  <textarea
                    required
                    rows={3}
                    placeholder="Describe your event..."
                    className="w-full bg-white/5 border border-white/10 rounded-xl py-3 px-4 focus:outline-none focus:border-[var(--accent-purple)] transition-all font-medium text-white placeholder:text-white/30 leading-relaxed"
                    value={formData.description}
                    onChange={e => setFormData({ ...formData, description: e.target.value })}
                  />
                </section>

                <section className="space-y-4">
                  <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-[var(--accent-purple)] italic">2. Event Details</h3>
                  <div className="grid md:grid-cols-2 gap-4">
                    <input
                      type="datetime-local"
                      required
                      min={new Date().toISOString().slice(0, 16)}
                      className="w-full bg-white/5 border border-white/10 rounded-xl py-3 px-4 focus:outline-none focus:border-[var(--accent-purple)] transition-all font-medium text-white"
                      value={formData.date}
                      onChange={e => setFormData({ ...formData, date: e.target.value })}
                    />
                  </div>
                  <select
                    className="w-full bg-white/5 border border-white/10 rounded-xl py-3 px-4 focus:outline-none focus:border-[var(--accent-purple)] transition-all font-medium text-white/70"
                    value={formData.category}
                    onChange={e => setFormData({ ...formData, category: e.target.value })}
                  >
                    <option value="Music">Music</option>
                    <option value="Tech & Crypto">Tech & Crypto</option>
                    <option value="Digital Art">Digital Art</option>
                    <option value="Sports & Gaming">Sports & Gaming</option>
                    <option value="Conference">Conference</option>
                  </select>

                  <div className="flex items-center gap-4 p-4 rounded-xl bg-white/[0.03] border border-white/10">
                    <div className="flex-1">
                      <h4 className="text-[10px] font-black uppercase tracking-widest text-[var(--accent-teal)] italic mb-1">Secondary Market Royalty (%)</h4>
                      <p className="text-[9px] text-white/30 font-medium">Whole numbers only (0-20%).</p>
                    </div>
                    <div className="w-24 relative">
                      <input
                        type="number"
                        min="0"
                        max="20"
                        step="1"
                        className={`w-full bg-white/5 border rounded-lg py-2 px-3 focus:outline-none transition-all font-bold text-white text-center ${(parseInt(formData.royalty) > 20 || parseInt(formData.royalty) < 0) ? 'border-red-500/50' : 'border-white/10 focus:border-[var(--accent-teal)]'
                          }`}
                        value={formData.royalty}
                        onChange={e => {
                          const val = e.target.value;
                          if (val === '' || /^\d+$/.test(val)) {
                            setFormData({ ...formData, royalty: val });
                          }
                        }}
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-black text-white/20">%</span>
                    </div>
                  </div>
                </section>

                <section className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-[var(--accent-purple)] italic">3. Venue Details</h3>
                    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/5 border border-white/10">
                      <div className="w-1.5 h-1.5 rounded-full bg-[var(--accent-teal)] animate-pulse" />
                      <span className="text-[8px] font-black uppercase text-white/40 tracking-widest">Off-Chain Storage</span>
                    </div>
                  </div>
                  
                  <div className="space-y-4">
                    <div className="grid md:grid-cols-2 gap-4">
                      <div className="relative group">
                        <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-white/20 group-focus-within:text-[var(--accent-teal)] transition-colors">
                          <MapPin size={16} />
                        </div>
                        <input
                          placeholder="Venue Name"
                          className="w-full bg-white/5 border border-white/10 rounded-xl py-4 pl-12 pr-4 focus:outline-none focus:border-[var(--accent-teal)] transition-all font-medium text-white placeholder:text-white/30 text-sm shadow-inner"
                          value={formData.venueName}
                          onChange={e => setFormData({ ...formData, venueName: e.target.value })}
                        />
                      </div>
                      <div className="relative group">
                         <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-white/20 group-focus-within:text-[var(--accent-teal)] transition-colors">
                          <MapPin size={16} className="opacity-40" />
                        </div>
                        <input
                          placeholder="City / Address"
                          className="w-full bg-white/5 border border-white/10 rounded-xl py-4 pl-12 pr-4 focus:outline-none focus:border-[var(--accent-teal)] transition-all font-medium text-white placeholder:text-white/30 text-sm shadow-inner"
                          value={formData.location}
                          onChange={e => setFormData({ ...formData, location: e.target.value })}
                        />
                      </div>
                    </div>

                    <div className="relative group">
                      <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-white/20 group-focus-within:text-[var(--accent-teal)] transition-colors">
                        <ExternalLink size={16} />
                      </div>
                      <input
                        placeholder="Location Link"
                        className="w-full bg-white/5 border border-white/10 rounded-xl py-4 pl-12 pr-4 focus:outline-none focus:border-[var(--accent-teal)] transition-all font-medium text-white placeholder:text-white/30 text-sm shadow-inner"
                        value={formData.locationLink}
                        onChange={e => setFormData({ ...formData, locationLink: e.target.value })}
                      />
                    </div>
                  </div>
                </section>

                <section className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-[var(--accent-purple)] italic flex items-center gap-2">
                      <Layers size={12} /> 4. Ticket Tiers
                    </h3>
                    <button
                      type="button"
                      onClick={addTier}
                      disabled={tiers.length >= 3}
                      className="px-3 py-1.5 rounded-lg bg-[var(--accent-teal)]/10 text-[var(--accent-teal)] text-[9px] font-black uppercase tracking-widest border border-[var(--accent-teal)]/20 hover:bg-[var(--accent-teal)]/20 transition-all flex items-center gap-1.5 disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      <Plus size={10} /> Add Tier
                    </button>
                  </div>

                  <div className="space-y-3 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                    {tiers.map((tier, index) => (
                      <div key={index} className="p-4 rounded-xl bg-white/[0.03] border border-white/10 space-y-3 mb-3">
                        <div className="flex items-center justify-between">
                          <span className="text-[9px] font-black uppercase tracking-widest text-white/30">
                            {index === 0 ? 'General Tier' : `Tier #${index + 1}`}
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
                            placeholder="Name"
                            className="bg-white/5 border border-white/10 rounded-lg py-2.5 px-3 focus:outline-none focus:border-[var(--accent-teal)] transition-all text-sm font-bold text-white"
                            value={tier.name}
                            onChange={e => updateTier(index, 'name', e.target.value)}
                          />
                          <input
                            type="number"
                            step="0.0001"
                            min="0"
                            required
                            placeholder="Price (ETH)"
                            className="bg-white/5 border border-white/10 rounded-lg py-2.5 px-3 focus:outline-none focus:border-[var(--accent-teal)] transition-all text-sm font-bold text-white"
                            value={tier.price}
                            onChange={e => updateTier(index, 'price', e.target.value)}
                          />
                          <input
                            type="number"
                            min="1"
                            required
                            placeholder="Supply"
                            className="bg-white/5 border border-white/10 rounded-lg py-2.5 px-3 focus:outline-none focus:border-[var(--accent-teal)] transition-all text-sm font-bold text-white"
                            value={tier.supply}
                            onChange={e => updateTier(index, 'supply', e.target.value)}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </section>

                <section className="space-y-4">
                  <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-white/40 italic">5. Media</h3>
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    className="p-6 rounded-xl border border-dashed border-white/10 bg-white/[0.02] flex flex-col items-center justify-center gap-4 cursor-pointer hover:bg-white/[0.04] transition-all relative overflow-hidden min-h-[160px]"
                  >
                    {imagePreview ? (
                      <>
                        <img src={imagePreview} alt="Preview" className="absolute inset-0 w-full h-full object-cover rounded-xl" />
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            removeImage();
                          }}
                          className="absolute top-4 right-4 p-2 bg-black/50 hover:bg-black/80 rounded-full text-white transition-all backdrop-blur-md z-10"
                        >
                          <XIcon size={16} />
                        </button>
                      </>
                    ) : (
                      <>
                        <Upload className="text-white/20" size={24} />
                        <span className="text-xs font-bold text-white/30 uppercase tracking-widest font-black">Banner Image</span>
                      </>
                    )}
                    <input
                      type="file"
                      ref={fileInputRef}
                      onChange={handleImageChange}
                      accept="image/*"
                      className="hidden"
                    />
                  </div>
                </section>

                <button
                  type="submit"
                  disabled={isMining}
                  className="w-full py-4 rounded-xl bg-white text-black font-black uppercase tracking-[0.2em] text-xs shadow-lg hover:shadow-white/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isMining ? 'Minting on Blockchain...' : 'Create Event'}
                </button>
              </form>
            </div>

            <div className="space-y-6">
              <div className="glass-panel p-8 rounded-3xl border border-white/10 bg-white/[0.03]">
                <h3 className="text-lg font-black uppercase italic tracking-tight mb-4">Launch on Web3</h3>
                <p className="text-sm text-white/50 font-medium leading-relaxed mb-6">
                  ERC-721 NFTs on Sepolia testnet.
                </p>
                <div className="space-y-3">
                  {[
                    "Anti-Scalp Protection",
                    "Secondary Market Royalties",
                    "On-Chain Provenance",
                    "Multi-Tier Pricing"
                  ].map(benefit => (
                    <div key={benefit} className="flex items-center gap-3 text-[10px] font-black uppercase tracking-widest text-[var(--accent-teal)] italic">
                      <CheckCircle2 size={14} />
                      {benefit}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      ) : (
        <div className="space-y-12">
          <motion.div variants={itemVariants} className="flex flex-col sm:flex-row items-center gap-6 mb-8">
            <div className="flex p-1.5 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-xl">
              <button
                onClick={() => setManageTab('active')}
                className={`px-8 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${manageTab === 'active'
                  ? 'bg-white text-black shadow-2xl'
                  : 'text-white/40 hover:text-white hover:bg-white/5'
                  }`}
              >
                Active Events
              </button>
              <button
                onClick={() => setManageTab('history')}
                className={`px-8 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${manageTab === 'history'
                  ? 'bg-white text-black shadow-2xl'
                  : 'text-white/40 hover:text-white hover:bg-white/5'
                  }`}
              >
                Past History
              </button>
            </div>
          </motion.div>

          <motion.div variants={itemVariants}>
            {isLoading ? (
              <div className="h-64 flex flex-col items-center justify-center glass-panel rounded-[2.5rem] border border-white/5 bg-white/[0.02]">
                <div className="w-10 h-10 border-4 border-[var(--accent-teal)]/20 border-t-[var(--accent-teal)] rounded-full animate-spin mb-4" />
                <p className="text-[9px] font-black uppercase tracking-[0.4em] text-[var(--accent-teal)] italic animate-pulse">Scanning On-Chain Records...</p>
              </div>
            ) : events
              .filter(e => e.organizerId?.toLowerCase() === (user.walletAddress || user.id)?.toLowerCase())
              .filter(event => {
                const isPast = new Date(event.date) < new Date();
                const isHistory = isPast || event.status === 'cancelled';
                return manageTab === 'active' ? !isHistory : isHistory;
              })
              .length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {events
                  .filter(e => e.organizerId?.toLowerCase() === (user.walletAddress || user.id)?.toLowerCase())
                  .filter(event => {
                    const isPast = new Date(event.date) < new Date();
                    const isHistory = isPast || event.status === 'cancelled';
                    return manageTab === 'active' ? !isHistory : isHistory;
                  })
                  .map(event => (
                    <div key={event.id} className="space-y-4">
                      <EventCard event={event} showEtherscan={true} />
                      {manageTab === 'active' && event.status !== 'cancelled' && (
                        <div className="grid grid-cols-2 gap-2 mt-2">
                          <button
                            onClick={() => setEditingEventId(event.id)}
                            className="w-full py-3 rounded-xl bg-[var(--accent-teal)]/10 border border-[var(--accent-teal)]/20 text-[var(--accent-teal)] text-[10px] font-black uppercase tracking-widest hover:bg-[var(--accent-teal)]/20 transition-all flex justify-center items-center gap-2"
                          >
                            Edit Details
                          </button>
                          <button
                            onClick={() => setCancellingEvent(event)}
                            className="w-full py-3 rounded-xl bg-orange-500/10 border border-orange-500/20 text-orange-400 text-[10px] font-black uppercase tracking-widest hover:bg-orange-500/20 transition-all flex justify-center items-center gap-2"
                          >
                            Cancel Event
                          </button>
                        </div>
                      )}
                      
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <button
                            onClick={() => setSelectedScanners(event)}
                            className="w-full flex items-center justify-between p-4 rounded-2xl bg-white/[0.03] border border-white/10 hover:bg-white/[0.06] hover:border-[var(--accent-purple)]/40 transition-all group"
                          >
                            <div className="flex items-center gap-3">
                              <div className="p-2 bg-[var(--accent-purple)]/10 rounded-xl text-[var(--accent-purple)] group-hover:scale-110 transition-transform">
                                <ShieldCheck size={16} />
                              </div>
                              <div className="text-left">
                                <p className="text-[10px] font-black uppercase tracking-widest text-white">Manage Scanners</p>
                              </div>
                            </div>
                            <ArrowUpRight size={14} className="text-white/20 group-hover:text-[var(--accent-purple)]" />
                          </button>

                          <button
                            onClick={() => setSelectedFinancials(event)}
                            className="w-full flex items-center justify-between p-4 rounded-2xl bg-white/[0.03] border border-white/10 hover:bg-white/[0.06] hover:border-[var(--accent-teal)]/40 transition-all group"
                          >
                            <div className="flex items-center gap-3">
                              <div className="p-2 bg-[var(--accent-teal)]/10 rounded-xl text-[var(--accent-teal)] group-hover:scale-110 transition-transform">
                                <PieChart size={16} />
                              </div>
                              <div className="text-left">
                                <p className="text-[10px] font-black uppercase tracking-widest text-white">Event Financials</p>
                              </div>
                            </div>
                            <ArrowUpRight size={14} className="text-white/20 group-hover:text-[var(--accent-teal)]" />
                          </button>

                          <button
                            onClick={() => navigate(`/scan/${event.id}`)}
                            className="w-full py-4 rounded-2xl bg-[var(--accent-teal)] text-black font-black uppercase tracking-widest text-[10px] shadow-[0_10px_30px_rgba(var(--accent-teal),0.3)] hover:scale-[1.02] active:scale-[0.98] transition-all flex justify-center items-center gap-2"
                          >
                            <Camera size={16} />
                            Open Gate Scanner
                          </button>
                        </div>
                    </div>
                  ))}
              </div>
            ) : (
              <div className="h-64 flex flex-col items-center justify-center glass-panel rounded-[2.5rem] border border-dashed border-white/10 text-center p-8">
                <LayoutDashboard size={48} className="mb-4 text-white/10" />
                <p className="text-lg font-black uppercase italic tracking-widest text-white/30 mb-2">
                  {manageTab === 'active' ? 'No Active Events' : 'No Past Events'}
                </p>
              </div>
            )}
          </motion.div>
        </div>
      )}

      {editingEventId && events.find(e => e.id === editingEventId) && (
        <EditEventModal
          event={events.find(e => e.id === editingEventId)!}
          onClose={() => setEditingEventId(null)}
        />
      )}

      {selectedFinancials && (
        <EventFinancialsModal
          eventId={selectedFinancials.id}
          onClose={() => setSelectedFinancials(null)}
        />
      )}

      {selectedScanners && (
        <ScannerManagementModal
          isOpen={!!selectedScanners}
          onClose={() => setSelectedScanners(null)}
          eventId={selectedScanners.id}
          eventName={selectedScanners.title}
        />
      )}

      {cancellingEvent && (
        <CancelEventModal
          event={cancellingEvent}
          onClose={() => setCancellingEvent(null)}
        />
      )}
    </motion.div>
  );
};

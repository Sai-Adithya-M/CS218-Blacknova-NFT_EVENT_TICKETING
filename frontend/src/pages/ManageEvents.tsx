import React, { useState } from 'react';
import { useEventStore } from '../store/useEventStore';
import { useAuthStore } from '../store/useAuthStore';
import { Plus, LayoutDashboard, Upload, CheckCircle2, Trash2, Layers, Copy, Hash, ShieldCheck } from 'lucide-react';
import { EventCard } from '../components/events/EventCard';
import { AuthFallback } from '../components/ui/AuthFallback';
import { motion } from 'framer-motion';
import { ethers } from 'ethers';
import type { TicketTier } from '../store/useEventStore';
import { config } from '../config';

const ABI = [
  "function createEvent(string memory name, uint maxTickets, uint priceWei, uint96 royaltyBps) public",
  "event EventCreated(uint indexed eventId, address indexed organiser, string name)"
];

interface TierFormData {
  name: string;
  price: string;
  supply: string;
}

export const ManageEvents: React.FC = () => {
  const { events, isLoading, createEvent, fetchEventsFromChain } = useEventStore();
  const { user } = useAuthStore();
  const [isCreating, setIsCreating] = useState(false);
  const [isMining, setIsMining] = useState(false);
  const [manageTab, setManageTab] = useState<'active' | 'history'>('active');

  const [formData, setFormData] = useState({
    title: '',
    description: '',
    date: '',
    location: '',
    category: 'Music & Concerts',
    royalty: '5', // Default 5%
  });

  const [tiers, setTiers] = useState<TierFormData[]>([
    { name: 'General', price: '', supply: '100' },
  ]);
  const [manualAddress, setManualAddress] = useState('');

  if (!user) return <AuthFallback />;

  const addTier = () => {
    setTiers([...tiers, { name: '', price: '', supply: '50' }]);
  };

  const removeTier = (index: number) => {
    if (tiers.length <= 1) return;
    setTiers(tiers.filter((_, i) => i !== index));
  };

  const updateTier = (index: number, field: keyof TierFormData, value: string) => {
    setTiers(tiers.map((t, i) => i === index ? { ...t, [field]: value } : t));
  };

  // Sanitize user inputs to prevent '|||' from corrupting the packed metadata format
  const sanitize = (s: string) => s.replace(/\|\|\|/g, ' — ');

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

    if (parsedTiers.length === 0) return;

    setIsMining(true);
    try {
      if (!(window as any).ethereum) throw new Error("MetaMask not found");

      const totalSupply = parsedTiers.reduce((acc, t) => acc + t.supply, 0);
      const lowestPrice = Math.min(...parsedTiers.map(t => t.price));

      const provider = new ethers.BrowserProvider((window as any).ethereum);

      // Network Check: Ensure user is on Sepolia
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

      const basePriceWei = ethers.parseEther(lowestPrice.toString());
      // Encode tier data as JSON so it survives the blockchain round-trip
      // Sanitize all user-entered fields to prevent '|||' from breaking the parser
      const tiersPayload = JSON.stringify(parsedTiers.map(t => ({ n: t.name, p: t.price, s: t.supply })));
      const packedMetadata = `${sanitize(formData.title)}|||${sanitize(formData.location)}|||${formData.date}|||${sanitize(formData.description)}|||${sanitize(formData.category)}|||${tiersPayload}`;
      const royaltyBps = Math.floor(parseFloat(formData.royalty || '0') * 100);

      console.log('Creating event with packed metadata:', packedMetadata);

      const tx = await contract.createEvent(packedMetadata, totalSupply, basePriceWei, royaltyBps);
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
            if (parsedLog && parsedLog.args && parsedLog.args.eventId) {
              // Use consistent 'evt_X' format to match fetchEventsFromChain decoder
              blockchainEventId = `evt_${parsedLog.args.eventId.toString()}`;
            }
          }
        } catch (err) {
          console.warn("Failed to parse eventId from log", err);
        }
      }

      createEvent({
        id: blockchainEventId,
        title: formData.title,
        description: formData.description,
        date: new Date(formData.date).toISOString(),
        location: formData.location,
        category: formData.category,
        organizerId: user.id,
        royaltyBps: royaltyBps,
        tiers: parsedTiers,
      });

      // Re-fetch from blockchain to ensure the store has properly decoded tier data
      // (this replaces the local store with the canonical on-chain version)
      setTimeout(() => fetchEventsFromChain(), 2000);

      setIsCreating(false);
      setFormData({ title: '', description: '', date: '', location: '', category: 'Music & Concerts', royalty: '5' });
      setTiers([{ name: 'General', price: '', supply: '100' }]);
    } catch (err: any) {
      console.error("Blockchain transaction failed:", err);
      // User rejected in MetaMask — no alert needed
      if (err?.code === 4001 || err?.code === 'ACTION_REJECTED' || err?.info?.error?.code === 4001) return;
      alert(err?.reason || err?.shortMessage || "Failed to create event.");
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
            <div className="flex flex-col gap-2 min-w-[300px]">
              <div className="p-3 rounded-xl bg-black/40 border border-white/10">
                <p className="text-[8px] font-black uppercase tracking-widest text-white/30 mb-2">Manual Connection:</p>
                <div className="flex gap-2">
                  <input
                    value={manualAddress}
                    onChange={(e) => setManualAddress(e.target.value)}
                    placeholder="0x..."
                    className="flex-1 bg-white/5 border border-white/10 rounded-lg py-1.5 px-3 text-[10px] font-mono text-white focus:border-[var(--accent-teal)] outline-none"
                  />
                  <button
                    onClick={() => alert(`Connect Address: ${manualAddress}`)}
                    className="px-3 py-1.5 rounded-lg bg-[var(--accent-teal)]/20 text-[var(--accent-teal)] text-[8px] font-black uppercase"
                  >
                    Connect
                  </button>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      )}

      <motion.div variants={itemVariants} className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6 mb-12">
        <div className="space-y-1">
          <h2 className="text-xs font-black tracking-[0.5em] uppercase text-[var(--accent-purple)] mb-3 italic opacity-80">Event Management</h2>
          <h1 className="text-6xl font-black tracking-tighter italic leading-none">CREATE EVENT</h1>
        </div>
        <button
          className="px-8 py-4 rounded-2xl bg-white text-black font-black uppercase tracking-widest text-xs flex items-center gap-2 shadow-lg hover:shadow-white/20 transition-all"
          onClick={() => setIsCreating(!isCreating)}
        >
          {isCreating ? <LayoutDashboard size={16} /> : <Plus size={16} />}
          {isCreating ? 'View My Events' : 'Create New Event'}
        </button>
      </motion.div>

      {isCreating ? (
        <motion.div variants={itemVariants} className="max-w-[1100px] mx-auto">
          <div className="grid lg:grid-cols-[1fr_380px] gap-12 items-start">
            <div className="glass-panel p-8 rounded-3xl border border-white/10 backdrop-blur-xl bg-white/[0.03]">
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
                      className="w-full bg-white/5 border border-white/10 rounded-xl py-3 px-4 focus:outline-none focus:border-[var(--accent-purple)] transition-all font-medium text-white"
                      value={formData.date}
                      onChange={e => setFormData({ ...formData, date: e.target.value })}
                    />
                    <input
                      required
                      placeholder="Location"
                      className="w-full bg-white/5 border border-white/10 rounded-xl py-3 px-4 focus:outline-none focus:border-[var(--accent-purple)] transition-all font-medium text-white placeholder:text-white/30"
                      value={formData.location}
                      onChange={e => setFormData({ ...formData, location: e.target.value })}
                    />
                  </div>
                  <select
                    className="w-full bg-white/5 border border-white/10 rounded-xl py-3 px-4 focus:outline-none focus:border-[var(--accent-purple)] transition-all font-medium text-white/70"
                    value={formData.category}
                    onChange={e => setFormData({ ...formData, category: e.target.value })}
                  >
                    <option value="Music & Concerts">Music & Concerts</option>
                    <option value="Tech & Crypto">Tech & Crypto</option>
                    <option value="Digital Art">Digital Art</option>
                    <option value="Sports & Gaming">Sports & Gaming</option>
                    <option value="Conference">Conference</option>
                  </select>

                  <div className="flex items-center gap-4 p-4 rounded-xl bg-white/[0.03] border border-white/10">
                    <div className="flex-1">
                      <h4 className="text-[10px] font-black uppercase tracking-widest text-[var(--accent-teal)] italic mb-1">Secondary Market Royalty (%)</h4>
                      <p className="text-[9px] text-white/30 font-medium">Earn a percentage of every future resale of your tickets.</p>
                    </div>
                    <div className="w-24 relative">
                      <input
                        type="number"
                        min="0"
                        max="20"
                        className="w-full bg-white/5 border border-white/10 rounded-lg py-2 px-3 focus:outline-none focus:border-[var(--accent-teal)] transition-all font-bold text-white text-center"
                        value={formData.royalty}
                        onChange={e => setFormData({ ...formData, royalty: e.target.value })}
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-black text-white/20">%</span>
                    </div>
                  </div>
                </section>

                <section className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-[var(--accent-teal)] italic flex items-center gap-2">
                      <Layers size={12} /> 3. Ticket Tiers
                    </h3>
                    <button
                      type="button"
                      onClick={addTier}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-xl border border-[var(--accent-teal)]/20 bg-[var(--accent-teal)]/5 text-[var(--accent-teal)] text-[9px] font-black uppercase tracking-widest hover:bg-[var(--accent-teal)]/10 transition-all font-bold"
                    >
                      <Plus size={12} /> Add Tier
                    </button>
                  </div>

                  <div className="space-y-3">
                    {tiers.map((tier, index) => (
                      <div key={index} className="p-4 rounded-xl bg-white/[0.03] border border-white/10 space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-[9px] font-black uppercase tracking-widest text-white/30">Tier {index + 1}</span>
                          {tiers.length > 1 && (
                            <button
                              type="button"
                              onClick={() => removeTier(index)}
                              className="p-1.5 rounded-lg hover:bg-red-500/10 text-white/20 hover:text-red-400 transition-all"
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
                </section>

                <section className="space-y-4">
                  <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-white/40 italic">4. Media Upload</h3>
                  <div className="p-6 rounded-xl border border-dashed border-white/10 bg-white/[0.02] flex items-center justify-center gap-4 cursor-pointer hover:bg-white/[0.04] transition-all">
                    <Upload className="text-white/20" size={18} />
                    <span className="text-xs font-bold text-white/30 uppercase tracking-widest font-black">Banner Image (Optional)</span>
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
                className={`px-8 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
                  manageTab === 'active' 
                    ? 'bg-white text-black shadow-2xl' 
                    : 'text-white/40 hover:text-white hover:bg-white/5'
                }`}
              >
                Active Events
              </button>
              <button
                onClick={() => setManageTab('history')}
                className={`px-8 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
                  manageTab === 'history' 
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
              .filter(e => e.organizerId?.toLowerCase() === user.id?.toLowerCase())
              .filter(event => {
                const isPast = new Date(event.date) < new Date();
                return manageTab === 'active' ? !isPast : isPast;
              })
              .length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {events
                  .filter(e => e.organizerId?.toLowerCase() === user.id?.toLowerCase())
                  .filter(event => {
                    const isPast = new Date(event.date) < new Date();
                    return manageTab === 'active' ? !isPast : isPast;
                  })
                  .map(event => (
                  <div key={event.id} className="space-y-4">
                    <EventCard event={event} showEtherscan={true} />
                    <div className="glass-panel p-5 rounded-2xl border border-white/10 bg-white/[0.02]">
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-[var(--accent-teal)] italic">
                          <ShieldCheck size={14} />
                          On-Chain Metadata
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="p-3 rounded-xl bg-black/40 border border-white/5">
                          <p className="text-[8px] font-black uppercase tracking-tight text-white/20 mb-1 flex items-center gap-1">
                            <Hash size={8} /> Event ID
                          </p>
                          <code className="text-[10px] font-mono font-bold text-white/60">{event.id}</code>
                        </div>
                        <div className="p-3 rounded-xl bg-black/40 border border-white/5">
                          <p className="text-[8px] font-black uppercase tracking-tight text-white/20 mb-1 flex items-center gap-1">
                            <ShieldCheck size={8} /> Contract
                          </p>
                          <div className="flex items-center justify-between">
                            <code className="text-[10px] font-mono font-bold text-white/60">
                              {config.contractAddress.slice(0, 6)}...
                            </code>
                            <button
                              onClick={() => {
                                navigator.clipboard.writeText(config.contractAddress);
                                alert("Copied!");
                              }}
                              className="p-1 rounded bg-white/5 text-white/30"
                            >
                              <Copy size={10} />
                            </button>
                          </div>
                        </div>
                      </div>
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
                <p className="text-sm text-white/20">
                  {manageTab === 'active' 
                    ? 'Click "Create New Event" to launch your first experience.' 
                    : 'Your concluded events will show up here as historical records.'}
                </p>
              </div>
            )}
          </motion.div>
        </div>
      )}
    </motion.div>
  );
};

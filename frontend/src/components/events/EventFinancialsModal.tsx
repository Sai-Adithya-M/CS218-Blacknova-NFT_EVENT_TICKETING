import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { X, TrendingUp, Wallet, Ticket, PieChart, Info, ArrowUpRight, Loader2, RefreshCw } from 'lucide-react';
import { ethers } from 'ethers';
import { useEventStore } from '../../store/useEventStore';
import { config } from '../../config';
import { getReadProvider } from '../../utils/blockchain';

const FINANCIALS_ABI = [
  "function fetchEventData(uint256 eventId) public view returns (address organiser, uint8 royaltyBps)",
  "function getTiers(uint256 eventId) public view returns (tuple(uint256 price, uint256 maxSupply, uint256 sold)[])",
  "function getTokenOriginalPrice(uint256 tokenId) public view returns (uint256)",
  "function tokenToTier(uint256 tokenId) public view returns (uint8)",
  "function nextTokenId() public view returns (uint256)",
  "function tokenToEvent(uint256 tokenId) public view returns (uint256)",
  "event EventCreated(uint256 indexed eventId, address indexed organiser, string ipfsHash)",
  "event TicketResold(uint256 indexed tokenId, address indexed oldOwner, address indexed newOwner, uint256 priceWei)",
];

interface ChainFinancials {
  priceWei: bigint;
  maxTickets: number;
  ticketsSold: number;
  royaltyPct: number;
  primaryRevenueWei: bigint;
  royaltyRevenueWei: bigint;
  totalRevenueWei: bigint;
  deploymentCostWei: bigint;
  tierRevenues: Record<number, bigint>;
}

interface EventFinancialsModalProps {
  eventId: string;
  onClose: () => void;
}

export const EventFinancialsModal: React.FC<EventFinancialsModalProps> = ({ eventId, onClose }) => {
  const { events } = useEventStore();
  const event = events.find(e => e.id === eventId);

  const [showFiat, setShowFiat] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [financials, setFinancials] = useState<ChainFinancials | null>(null);
  const ETH_PRICE = 3500;

  const numericId = Number(eventId.replace('evt_', ''));

  const fetchFinancials = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const provider = getReadProvider();
      const contract = new ethers.Contract(config.contractAddress, FINANCIALS_ABI, provider);

      // 1. Fetch live on-chain event struct
      const [, royaltyPct] = await contract.fetchEventData(numericId);
      
      // 1b. Fetch Tiers for totals
      const tierData = await contract.getTiers(numericId);
      const totalTickets = tierData.reduce((sum: number, t: any) => sum + Number(t.maxSupply), 0);
      const ticketsSold = tierData.reduce((sum: number, t: any) => sum + Number(t.sold), 0);
      const firstTierPrice = tierData[0]?.price || 0n;

      // 2. Find all tokens belonging to this event by scanning tokenToEvent
      const nextTokenId = Number(await contract.nextTokenId());
      const eventTokenIds: number[] = [];

      // Batch check which tokens belong to this event
      const tokenEventChecks = await Promise.all(
        Array.from({ length: nextTokenId - 1 }, (_, i) =>
          contract.tokenToEvent(i + 1).then((eid: bigint) => ({ tokenId: i + 1, eventId: Number(eid) })).catch(() => null)
        )
      );

      for (const check of tokenEventChecks) {
        if (check && check.eventId === numericId) {
          eventTokenIds.push(check.tokenId);
        }
      }

      // 3. Fetch purchase prices for event tokens
      // Only count tokens that have a recorded purchase price (> 0).
      // Pre-upgrade tokens (purchasePrice == 0) are still counted as sold but
      // their revenue is unknown — we do NOT substitute the current base price
      // because the organiser may have edited it since the sale.
      let primaryRevenueWei = 0n;
      const tierRevenues: Record<number, bigint> = {};

      if (eventTokenIds.length > 0) {
        const tokenDetails = await Promise.all(
          eventTokenIds.map(async (id) => {
            const [price, tier] = await Promise.all([
              contract.getTokenOriginalPrice(id).catch(() => 0n),
              contract.tokenToTier(id).catch(() => 0)
            ]);
            return { price, tier };
          })
        );

        for (const detail of tokenDetails) {
          const weiVal = BigInt(detail.price);
          if (weiVal > 0n) {
            primaryRevenueWei += weiVal;
            tierRevenues[detail.tier] = (tierRevenues[detail.tier] || 0n) + weiVal;
          }
        }
      }

      // 4. Calculate Royalty Revenue from secondary sales
      let royaltyRevenueWei = 0n;
      try {
        const latestBlock = await provider.getBlockNumber();
        const startBlock = config.deploymentBlock || 5700000;
        // Royalty events are fewer, so we can query in larger chunks or all at once if supported
        const resaleLogs = await contract.queryFilter(contract.filters.TicketResold(), startBlock, latestBlock);
        
        for (const log of resaleLogs) {
          const tokenId = Number((log as any).args[0]);
          const priceWei = BigInt((log as any).args[3]) * BigInt(1e9);
          
          if (eventTokenIds.includes(tokenId)) {
            const royalty = (priceWei * BigInt(royaltyPct)) / 100n;
            royaltyRevenueWei += royalty;
          }
        }
      } catch (err) {
        console.warn("Failed to fetch royalty events:", err);
      }

      // 5. Get deployment cost from EventCreated log (chunked query)
      let deploymentCostWei = 0n;
      let gasUsed = 0n;
      try {
        const latestBlock = await provider.getBlockNumber();
        const startBlock = config.deploymentBlock || 5700000;
        // Search in 10k chunks from latest going backwards
        let found = false;
        let hi = latestBlock;
        while (hi >= startBlock && !found) {
          const lo = Math.max(startBlock, hi - 9999);
          try {
            const logs = await contract.queryFilter(contract.filters.EventCreated(numericId), lo, hi);
            if (logs.length > 0) {
              const txHash = (logs[0] as any).transactionHash;
              if (txHash) {
                const receipt = await provider.getTransactionReceipt(txHash);
                if (receipt) {
                  gasUsed = receipt.gasUsed;
                  const gasPrice = receipt.gasPrice || 0n;
                  deploymentCostWei = gasUsed * gasPrice;
                }
              }
              found = true;
            }
          } catch {}
          hi = lo - 1;
        }
      } catch {}

      const totalRevenueWei = primaryRevenueWei + royaltyRevenueWei;

      setFinancials({
        priceWei: BigInt(firstTierPrice), 
        maxTickets: totalTickets, 
        ticketsSold, 
        royaltyPct: Number(royaltyPct),
        primaryRevenueWei, 
        royaltyRevenueWei, 
        totalRevenueWei,
        deploymentCostWei,
        tierRevenues
      });
    } catch (err: any) {
      console.error("Failed to fetch financials:", err);
      setError(err.message || "Failed to load financial data");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { fetchFinancials(); }, [eventId]);

  if (!event) return null;

  const tiers = Array.isArray(event.tiers) ? event.tiers : [];

  // Format helpers
  const formatEthValue = (weiValue: bigint) => {
    const eth = parseFloat(ethers.formatEther(weiValue));
    if (showFiat) {
      return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(eth * ETH_PRICE);
    }
    return `${eth.toFixed(4)} ETH`;
  };

  const formatValue = (ethValue: number) => {
    if (isNaN(ethValue)) return "0.00";
    if (showFiat) {
      return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(ethValue * ETH_PRICE);
    }
    return `${ethValue.toFixed(4)} ETH`;
  };

  // Derive display values (use chain data when available, store as fallback)
  const totalRevenueWei: bigint = financials?.totalRevenueWei ?? 0n;
  const deploymentCostWei: bigint = financials?.deploymentCostWei ?? 0n;
  const netProfitWei: bigint = totalRevenueWei - deploymentCostWei;
  const deploymentCostEth = parseFloat(ethers.formatEther(deploymentCostWei));
  const netProfitEth = parseFloat(ethers.formatEther(netProfitWei));
  const totalRevenueEth = parseFloat(ethers.formatEther(totalRevenueWei));
  const ticketsSold = financials?.ticketsSold ?? (event?.tiers?.reduce((s: number, t: any) => s + (t.sold || 0), 0) || 0);
  const totalTickets = financials?.maxTickets ?? (event?.tiers?.reduce((s: number, t: any) => s + t.supply, 0) || 0);
  const currentPriceEth = financials ? parseFloat(ethers.formatUnits(financials.priceWei, "ether")) : (event?.tiers?.[0]?.price ?? 0);
  const royaltyPct = financials?.royaltyPct ?? event.royaltyBps;

  // For the tier table we show sold counts from store (per-tier) 
  // but revenue only from the on-chain total (not sold × current price, which is wrong after edits)

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/90 backdrop-blur-md"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.95, opacity: 0, y: 20 }}
        className="bg-zinc-900 border border-white/10 rounded-[2.5rem] w-full max-w-4xl overflow-hidden shadow-[0_0_50px_rgba(0,0,0,0.5)]"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-8 border-b border-white/5 flex items-center justify-between bg-gradient-to-br from-white/[0.03] to-transparent">
          <div>
            <div className="flex items-center gap-3 mb-1">
               <div className="p-2 bg-blue-500/20 rounded-xl">
                 <PieChart className="w-5 h-5 text-blue-400" />
               </div>
               <h2 className="text-2xl font-black uppercase italic tracking-tight text-white">
                 Event Financials
               </h2>
            </div>
            <p className="text-zinc-500 text-[10px] font-bold uppercase tracking-widest">{event.title} • Revenue Analytics</p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => fetchFinancials()}
              disabled={isLoading}
              className="p-2.5 rounded-xl bg-white/5 border border-white/10 text-white/50 hover:text-white hover:bg-white/10 transition-all active:scale-95 disabled:opacity-50"
              title="Refresh from blockchain"
            >
              <RefreshCw size={16} className={isLoading ? 'animate-spin' : ''} />
            </button>
            <button
              onClick={() => setShowFiat(!showFiat)}
              className="px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-[10px] font-black uppercase tracking-widest text-white hover:bg-white/10 transition-all active:scale-95"
            >
              {showFiat ? 'Show ETH' : 'Show USD'}
            </button>
            <button onClick={onClose} className="p-3 hover:bg-white/10 rounded-full transition-all active:scale-90 bg-white/5 border border-white/10">
              <X className="w-5 h-5 text-zinc-400" />
            </button>
          </div>
        </div>

        <div className="p-8 space-y-8 max-h-[70vh] overflow-y-auto custom-scrollbar">
          {error && (
            <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-bold flex items-center gap-3">
              <Info size={16} />
              {error}
            </div>
          )}

          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="glass-panel bg-white/[0.03] border border-white/10 p-6 rounded-3xl relative overflow-hidden group">
              <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                <TrendingUp size={48} />
              </div>
              <p className="text-zinc-500 text-[10px] font-black uppercase tracking-[0.2em] mb-4">Total Revenue</p>
              <h3 className="text-3xl font-black text-white italic">
                {isLoading ? <Loader2 className="w-8 h-8 animate-spin text-[var(--accent-teal)]" /> :
                  formatEthValue(totalRevenueWei)
                }
              </h3>
              <div className="mt-4 flex items-center gap-2">
                <span className="px-2 py-0.5 rounded-md bg-green-500/10 text-green-400 text-[10px] font-bold">{ticketsSold} Sold</span>
              </div>
            </div>

            <div className="glass-panel bg-white/[0.03] border border-white/10 p-6 rounded-3xl relative overflow-hidden group">
              <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                <Wallet size={48} />
              </div>
              <p className="text-zinc-500 text-[10px] font-black uppercase tracking-[0.2em] mb-4">Deployment Cost</p>
              <h3 className="text-3xl font-black text-white italic">
                {isLoading ? <Loader2 className="w-8 h-8 animate-spin text-[var(--accent-teal)]" /> : formatValue(deploymentCostEth)}
              </h3>
              <div className="mt-4 flex items-center gap-2">
                <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-tighter">Gas: {Number(financials?.gasUsed ?? 0n).toLocaleString()} units</span>
              </div>
            </div>

            <div className={`glass-panel border p-6 rounded-3xl relative overflow-hidden group ${netProfitEth >= 0 ? 'bg-blue-500/5 border-blue-500/20' : 'bg-red-500/5 border-red-500/20'}`}>
              <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                <ArrowUpRight size={48} />
              </div>
              <p className="text-zinc-500 text-[10px] font-black uppercase tracking-[0.2em] mb-4">Net Profit</p>
              <h3 className={`text-3xl font-black italic ${netProfitEth >= 0 ? 'text-white' : 'text-red-400'}`}>
                {isLoading ? <Loader2 className="w-8 h-8 animate-spin text-[var(--accent-teal)]" /> : formatValue(netProfitEth)}
              </h3>
              <div className="mt-4">
                 <div className="w-full h-1 bg-white/5 rounded-full overflow-hidden">
                    <div className={`h-full ${netProfitEth >= 0 ? 'bg-blue-500' : 'bg-red-500'}`} style={{ width: `${Math.min(100, Math.max(0, (netProfitEth / (totalRevenueEth || 1)) * 100))}%` }} />
                 </div>
              </div>
            </div>
          </div>

          {/* Live Chain Info */}
          {financials && (
            <div className="flex flex-wrap gap-4 p-4 rounded-2xl bg-white/[0.02] border border-white/5">
              <div className="flex items-center gap-2">
                <span className="text-[8px] font-black uppercase tracking-widest text-white/30">Current Price</span>
                <span className="text-xs font-black text-[var(--accent-teal)]">{currentPriceEth} ETH</span>
              </div>
              <div className="w-px h-4 bg-white/10" />
              <div className="flex items-center gap-2">
                <span className="text-[8px] font-black uppercase tracking-widest text-white/30">Supply</span>
                <span className="text-xs font-black text-white">{ticketsSold} / {totalTickets}</span>
              </div>
              <div className="w-px h-4 bg-white/10" />
              <div className="flex items-center gap-2">
                <span className="text-[8px] font-black uppercase tracking-widest text-white/30">Royalty</span>
                <span className="text-xs font-black text-purple-400">{royaltyPct}%</span>
              </div>
            </div>
          )}

          {/* Ticket Tiers Breakdown */}
          <div className="space-y-4">
            <h4 className="text-[10px] font-black uppercase tracking-[0.3em] text-white/40 italic flex items-center gap-2 px-2">
              <Ticket className="w-3 h-3 text-blue-400" />
              Ticket Tiers Breakdown
            </h4>
            <div className="bg-white/[0.02] border border-white/10 rounded-3xl overflow-hidden">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-white/5 text-[9px] font-black text-zinc-500 uppercase tracking-[0.2em]">
                    <th className="px-8 py-5">Tier Name</th>
                    <th className="px-8 py-5">Price</th>
                    <th className="px-8 py-5">Sold</th>
                    <th className="px-8 py-5">Revenue</th>
                    <th className="px-8 py-5 text-right">Progress</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                    {tiers.length > 0 ? tiers.map((tier, idx) => {
                      const progress = tier.supply > 0 ? (tier.sold / tier.supply) * 100 : 0;
                      const tierRevenue = financials?.tierRevenues[idx] ?? 0n;
                      
                      return (
                      <tr key={idx} className="text-xs hover:bg-white/[0.03] transition-all group">
                        <td className="px-8 py-6 font-black text-white uppercase tracking-wider">{tier.name}</td>
                        <td className="px-8 py-6 text-zinc-400 font-mono">{formatValue(tier.price)}</td>
                        <td className="px-8 py-6 text-zinc-400 font-bold">{tier.sold} <span className="text-zinc-600 font-normal">/ {tier.supply}</span></td>
                        <td className="px-8 py-6 text-[var(--accent-teal)] font-bold italic">
                          {isLoading ? "..." : formatEthValue(tierRevenue)}
                        </td>
                        <td className="px-8 py-6">
                          <div className="flex items-center justify-end gap-4">
                            <div className="w-20 h-1.5 bg-white/5 rounded-full overflow-hidden">
                              <motion.div
                                initial={{ width: 0 }}
                                animate={{ width: `${progress}%` }}
                                className="h-full bg-[var(--accent-teal)] shadow-[0_0_10px_rgba(45,212,191,0.5)]"
                              />
                            </div>
                            <span className="text-[9px] font-black text-zinc-600">{Math.round(progress)}%</span>
                          </div>
                        </td>
                      </tr>
                      );
                    }) : (
                    <tr>
                      <td colSpan={5} className="px-8 py-12 text-center text-zinc-600 text-[10px] font-black uppercase tracking-widest italic">
                        No sales data available for this event
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Royalty & Additional Info */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="glass-panel bg-purple-500/5 border border-purple-500/20 p-8 rounded-[2.5rem] space-y-4">
              <div className="flex items-center gap-2 text-white font-black text-[10px] uppercase tracking-widest italic">
                <ShieldCheck className="w-4 h-4 text-purple-400" />
                Secondary Market Royalty
              </div>
              <div className="flex justify-between items-end">
                <div>
                  <p className="text-4xl font-black text-white italic">{royaltyPct}%</p>
                  <p className="text-zinc-500 text-[9px] font-bold uppercase tracking-widest mt-2">Continuous Revenue</p>
                </div>
                <div className="text-right">
                  <p className="text-xs font-black text-purple-400 italic">{royaltyPct} BPS</p>
                </div>
              </div>
              <div className="flex justify-between items-center text-[9px] font-black uppercase tracking-widest text-zinc-500">
                <span>Earned Royalties</span>
                <span className="text-[var(--accent-teal)]">{formatEthValue(financials?.royaltyRevenueWei || 0n)}</span>
              </div>
              <div className="p-4 bg-black/40 border border-white/5 rounded-2xl text-[9px] font-medium text-zinc-500 leading-relaxed uppercase tracking-tighter">
                You receive this percentage of every ticket resale value automatically on the secondary market.
              </div>
            </div>

            <div className="glass-panel bg-white/[0.03] border border-white/10 p-8 rounded-[2.5rem] space-y-6">
              <div className="flex items-center gap-2 text-white font-black text-[10px] uppercase tracking-widest italic">
                <Info className="w-4 h-4 text-zinc-500" />
                Contract Details
              </div>
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-[9px] font-black text-zinc-600 uppercase tracking-widest">Network</span>
                  <span className="px-2 py-1 bg-blue-500/10 text-blue-400 rounded-md text-[8px] font-black uppercase tracking-widest">Sepolia Testnet</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-[9px] font-black text-zinc-600 uppercase tracking-widest">Contract</span>
                  <span className="text-[10px] font-mono font-bold text-zinc-400">{config.contractAddress.slice(0, 8)}...{config.contractAddress.slice(-6)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-[9px] font-black text-zinc-600 uppercase tracking-widest">Event Status</span>
                  <span className="px-2 py-1 bg-white/5 text-white rounded-md text-[8px] font-black uppercase tracking-widest italic">{event.status}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
};

function ShieldCheck({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}

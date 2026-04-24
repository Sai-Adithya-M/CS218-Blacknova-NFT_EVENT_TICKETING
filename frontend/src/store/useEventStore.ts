import { create } from 'zustand';
import { ethers } from 'ethers';
import { config } from '../config';
import { getReadProvider } from '../utils/blockchain';
import { fetchFromIPFS } from '../utils/ipfs';

const ABI = [
  "function nextEventId() public view returns (uint256)",
  // Struct layout (single slot): address organiser, uint40 priceWei, uint24 maxTickets, uint24 ticketsSold, uint8 royaltyBps
  "function fetchEventData(uint256 eventId) public view returns (tuple(address organiser, uint40 priceWei, uint24 maxTickets, uint24 ticketsSold, uint8 royaltyBps))",
  // Per-tier sold/max from chain (no log queries needed)
  "function getTierData(uint256 eventId, uint8 tier) public view returns (uint24 sold, uint24 max)",
  "event EventCreated(uint256 indexed eventId, address indexed organiser, string ipfsHash)"
];

// ─── IPFS Metadata Cache (localStorage) ───────────────────────────────────────
// Key: CID string → Value: parsed JSON metadata (or null if known-bad)
const CACHE_PREFIX = 'ipfs_meta_v1_';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

function cacheGet(cid: string): any | undefined {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + cid);
    if (!raw) return undefined;
    const { ts, data } = JSON.parse(raw);
    if (Date.now() - ts > CACHE_TTL_MS) {
      localStorage.removeItem(CACHE_PREFIX + cid);
      return undefined;
    }
    return data; // may be null (known-bad marker)
  } catch { return undefined; }
}

function cacheSet(cid: string, data: any) {
  try {
    localStorage.setItem(CACHE_PREFIX + cid, JSON.stringify({ ts: Date.now(), data }));
  } catch { /* quota exceeded — ignore */ }
}

async function fetchMetaCached(ipfsHash: string): Promise<any> {
  const cached = cacheGet(ipfsHash);
  if (cached !== undefined) return cached; // null = known-bad, non-null = good data
  const result = await fetchFromIPFS(ipfsHash, { json: true, timeout: 20000 });
  cacheSet(ipfsHash, result ?? null); // cache null to avoid re-hitting bad CIDs
  return result;
}
// ──────────────────────────────────────────────────────────────────────────────

// ─── Tier Price Overrides (localStorage) ──────────────────────────────────────
// Per-tier prices are NOT stored on-chain (only a single lowest price is).
// When the organiser edits tier prices, we persist them here so they survive refresh.
const TIER_PRICE_PREFIX = 'tier_prices_v1_';

function getTierPriceOverrides(eventId: string): Record<number, number> | null {
  try {
    const raw = localStorage.getItem(TIER_PRICE_PREFIX + eventId);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch { return null; }
}

function setTierPriceOverrides(eventId: string, prices: Record<number, number>) {
  try {
    localStorage.setItem(TIER_PRICE_PREFIX + eventId, JSON.stringify(prices));
  } catch { /* quota exceeded — ignore */ }
}
// ──────────────────────────────────────────────────────────────────────────────

export interface TicketTier {
  id: string;
  name: string;
  price: number;
  supply: number;
  sold: number;
}

export interface Event {
  id: string;
  title: string;
  description: string;
  date: string;
  location: string;
  category: string;
  imageUrl?: string;
  organizerId: string;
  royaltyBps: number;
  status: 'active' | 'past' | 'cancelled';
  tiers: TicketTier[];
  hasIpfsError?: boolean;
  deploymentCost?: string;
  gasUsed?: string;
  txHash?: string;
  _tierSales?: Record<number, number>;
  _tierMaxSupplies?: Record<number, number>; // on-chain per-tier max (from getTierData)
  _ipfsHash?: string; // kept for retryMetadata fallback
}

interface EventState {
  events: Event[];
  isLoading: boolean;
  createEvent: (event: Event) => void;
  editEventLocally: (eventId: string, updatedData: Partial<Event>) => void;
  incrementTierSold: (eventId: string, tierId: string) => void;
  fetchEventsFromChain: () => Promise<void>;
  retryMetadata: (eventId: string, ipfsHash: string, retryCount?: number) => Promise<void>;
  loadEventGasCost: (eventId: string, txHash?: string) => Promise<void>;
}

// Helper: merge IPFS metadata into an Event object
// On-chain tier data (_tierSales + _tierMaxSupplies) takes priority over IPFS
// for supply/sold counts. Tier price overrides from localStorage take priority
// over IPFS prices (since IPFS is immutable and can't reflect edits).
function applyMetadata(e: Event, metadata: any): Event {
  if (!metadata) return { ...e, hasIpfsError: true };
  const tierSales = e._tierSales || {};
  const tierMaxSupplies = e._tierMaxSupplies || {};
  const priceOverrides = getTierPriceOverrides(e.id);
  const tiers = (metadata.tiers && Array.isArray(metadata.tiers) && metadata.tiers.length > 0)
    ? metadata.tiers.map((t: any, tidx: number) => {
        // On-chain supply (from getTierData max) takes priority over IPFS
        const onChainMax = tierMaxSupplies[tidx];
        const supply = (onChainMax !== undefined && onChainMax > 0) ? onChainMax : (t.supply ?? e.tiers[0]?.supply);
        // localStorage price override > IPFS price > skeleton fallback
        const price = priceOverrides?.[tidx] ?? t.price ?? e.tiers[0]?.price;
        return {
          id: t.id || `${e.id}_tier_${tidx}`,
          name: t.name || 'Tier',
          price,
          supply,
          // Use on-chain per-tier sold count (fetched via getTierData)
          sold: tierSales[tidx] ?? 0
        };
      })
    : e.tiers;
  return {
    ...e,
    title: metadata.name || metadata.title || e.title,
    description: metadata.description || e.description,
    date: metadata.date || metadata.dateTime || e.date,
    location: metadata.location || e.location,
    category: metadata.category || e.category,
    imageUrl: metadata.image || e.imageUrl,
    hasIpfsError: false,
    tiers,
  };
}

export const useEventStore = create<EventState>((set, get) => ({
  events: [],
  isLoading: false,

  createEvent: (event) => set((state) => ({
    events: [event, ...state.events]
  })),

  editEventLocally: (eventId, updatedData) => {
    // Persist tier price overrides to localStorage so they survive refresh
    if (updatedData.tiers && updatedData.tiers.length > 0) {
      const priceMap: Record<number, number> = {};
      updatedData.tiers.forEach((t, i) => { priceMap[i] = t.price; });
      setTierPriceOverrides(eventId, priceMap);
    }
    set((state) => ({
      events: state.events.map(e => e.id === eventId ? { ...e, ...updatedData } : e)
    }));
  },

  incrementTierSold: (eventId, tierId) => set((state) => ({
    events: state.events.map(e => e.id === eventId ? {
      ...e,
      tiers: e.tiers.map(t => t.id === tierId ? { ...t, sold: t.sold + 1 } : t)
    } : e)
  })),

  // ── retryMetadata: fallback only for events whose IPFS fetch failed at load time ──
  retryMetadata: async (eventId, ipfsHash, retryCount = 0) => {
    const metadata = await fetchMetaCached(ipfsHash);
    if (metadata) {
      set((state) => ({
        events: state.events.map(e => e.id === eventId ? applyMetadata(e, metadata) : e)
      }));
    } else {
      const delay = retryCount < 5 ? 5000 : 30000;
      setTimeout(() => get().retryMetadata(eventId, ipfsHash, retryCount + 1), delay);
      if (retryCount > 2) {
        set((state) => ({
          events: state.events.map(e => e.id === eventId ? { ...e, hasIpfsError: true } : e)
        }));
      }
    }
  },

  loadEventGasCost: async (eventId, txHash?: string) => {
    try {
      const provider = getReadProvider();
      let actualTxHash = txHash;

      if (!actualTxHash && config.contractAddress) {
        const contract = new ethers.Contract(config.contractAddress, ABI, provider);
        const numericEventId = Number(eventId.replace('evt_', ''));
        const createdFilter = contract.filters.EventCreated(numericEventId);
        let latestBlock = await provider.getBlockNumber();
        const startBlock = config.deploymentBlock || 5700000;
        while (latestBlock >= startBlock && !actualTxHash) {
          const fromBlock = Math.max(startBlock, latestBlock - 10000);
          try {
            const logs = await contract.queryFilter(createdFilter, fromBlock, latestBlock);
            if (logs && logs.length > 0) { actualTxHash = logs[0].transactionHash; break; }
          } catch(e) {}
          latestBlock = fromBlock - 1;
        }
      }

      if (!actualTxHash) return;
      const receipt = await provider.getTransactionReceipt(actualTxHash);
      if (receipt) {
        const gasUsed = receipt.gasUsed;
        const gasPrice = receipt.gasPrice || (await provider.getFeeData()).gasPrice || BigInt(0);
        set(state => ({
          events: state.events.map(e => e.id === eventId ? {
            ...e, txHash: actualTxHash, gasUsed: gasUsed.toString(),
            deploymentCost: (gasUsed * gasPrice).toString()
          } : e)
        }));
      }
    } catch (err) {
      console.warn("EventStore: Failed to load gas cost for event:", eventId, err);
    }
  },

  // ── Main loader — log-first, cache-first, fully parallel ──────────────────
  fetchEventsFromChain: async () => {
    if (!config.contractAddress || config.contractAddress === "0x0000000000000000000000000000000000000000") {
      console.warn("EventStore: No contract address configured");
      return;
    }

    set({ isLoading: true });
    console.log("EventStore: Syncing from chain (log-first, cached IPFS)...", config.contractAddress);

    try {
      const provider = getReadProvider();
      const contract = new ethers.Contract(config.contractAddress, ABI, provider);
      const fromBlock = config.deploymentBlock || 5700000;

      // Step 1: Fetch event count + EventCreated logs in parallel
      //  (EventCreated logs give us IPFS hashes + tx hashes; no TicketMinted logs needed)
      const [nextEventId, createdLogs] = await Promise.all([
        contract.nextEventId(),
        contract.queryFilter(contract.filters.EventCreated(), fromBlock)
          .catch(() => contract.queryFilter(contract.filters.EventCreated(), -10000).catch(() => [])),
      ]);

      const totalEvents = Number(nextEventId) - 1;
      console.log(`EventStore: ${totalEvents} events, ${(createdLogs as any[]).length} EventCreated logs`);

      if (totalEvents <= 0) { set({ events: [], isLoading: false }); return; }

      // Step 2: Build lookup maps from EventCreated logs
      const eventTxHashes: Record<string, string> = {};
      const eventIpfsHashes: Record<string, string> = {};
      (createdLogs as any[]).forEach((log: any) => {
        if (log.args) {
          const eId = `evt_${log.args.eventId.toString()}`;
          if (log.transactionHash) eventTxHashes[eId] = log.transactionHash;
          if (log.args.ipfsHash)   eventIpfsHashes[eId] = log.args.ipfsHash;
        }
      });

      // Step 3: Fetch on-chain struct data for all events in parallel
      const onChainData = await Promise.all(
        Array.from({ length: totalEvents }, (_, i) =>
          contract.fetchEventData(i + 1).catch(() => null)
        )
      );

      // Step 4: Fetch per-tier sold counts from chain via getTierData()
      // We check tiers 0, 1, 2 (Silver, Gold, VIP) for each event
      const MAX_TIERS = 3;
      const tierDataPromises: Promise<Record<number, { sold: number; max: number }>>[] = 
        onChainData.map((evt, idx) => {
          if (!evt) return Promise.resolve({});
          const eventNum = idx + 1;
          return Promise.all(
            Array.from({ length: MAX_TIERS }, (_, t) =>
              contract.getTierData(eventNum, t).then((result: any) => ({
                tier: t,
                sold: Number(result.sold ?? result[0]),
                max: Number(result.max ?? result[1])
              })).catch(() => ({ tier: t, sold: 0, max: 0 }))
            )
          ).then(results => {
            const map: Record<number, { sold: number; max: number }> = {};
            for (const r of results) {
              map[r.tier] = { sold: r.sold, max: r.max };
            }
            return map;
          });
        });
      const allTierData = await Promise.all(tierDataPromises);

      // Step 5: Build skeleton events with on-chain tier data
      const skeletonEvents: Event[] = onChainData.map((evt, idx) => {
        if (!evt) return null;
        const i = idx + 1;
        const eventId = `evt_${i}`;
        const organiser = (evt.organiser ?? evt[0]) as string;
        if (!organiser || organiser === "0x0000000000000000000000000000000000000000") return null;

        const onChainTotalSold = Number(evt.ticketsSold ?? evt[3]);
        const tierData = allTierData[idx] || {};
        // Build _tierSales and _tierMaxSupplies from on-chain data
        const tierSales: Record<number, number> = {};
        const tierMaxSupplies: Record<number, number> = {};
        for (const [tierIdx, data] of Object.entries(tierData)) {
          tierSales[Number(tierIdx)] = data.sold;
          tierMaxSupplies[Number(tierIdx)] = data.max;
        }

        return {
          id: eventId,
          title: `Event #${i}`,
          description: "Loading details from IPFS...",
          date: "2099-12-31T00:00:00.000Z",
          location: "Loading...",
          category: "Other",
          organizerId: organiser.toLowerCase(),
          royaltyBps: Number(evt.royaltyBps ?? evt[4]),
          status: 'active' as const,
          hasIpfsError: false,
          tiers: [{
            id: `tier_${eventId}_0`,
            name: 'General Access',
            price: parseFloat(ethers.formatUnits(evt.priceWei ?? evt[1], "gwei")),
            supply: Number(evt.maxTickets ?? evt[2]),
            sold: onChainTotalSold
          }],
          txHash: eventTxHashes[eventId],
          _tierSales: tierSales,
          _tierMaxSupplies: tierMaxSupplies,
          _ipfsHash: eventIpfsHashes[eventId],
        } satisfies Event;
      }).filter((e): e is Event => e !== null);

      // Step 5: Fetch ALL IPFS metadata in parallel (cache-first)
      //   - Events with a valid cache hit resolve immediately
      //   - Events not yet cached fire network requests in parallel
      const metadataResults = await Promise.all(
        skeletonEvents.map(e =>
          e._ipfsHash
            ? fetchMetaCached(e._ipfsHash).catch(() => null)
            : Promise.resolve(null)
        )
      );

      // Step 6: Merge metadata into events (single pass, no re-render churn)
      const hydratedEvents: Event[] = skeletonEvents.map((e, idx) =>
        applyMetadata(e, metadataResults[idx])
      );

      console.log(`EventStore: ${hydratedEvents.filter(e => !e.hasIpfsError).length}/${hydratedEvents.length} events fully hydrated from IPFS`);
      set({ events: hydratedEvents, isLoading: false });

      // Step 7: Schedule retries only for events that still failed IPFS fetch
      hydratedEvents.forEach(e => {
        if (e.hasIpfsError && e._ipfsHash) {
          // Remove bad cache entry so retry can try fresh
          try { localStorage.removeItem(CACHE_PREFIX + e._ipfsHash); } catch {}
          setTimeout(() => get().retryMetadata(e.id, e._ipfsHash!, 0), 3000);
        }
      });

    } catch (err) {
      console.error("EventStore: Critical failure during chain sync:", err);
      set({ isLoading: false });
    }
  }
}));

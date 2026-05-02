import { create } from 'zustand';
import { ethers } from 'ethers';
import { config } from '../config';
import { getReadProvider } from '../utils/blockchain';
import { fetchFromIPFS } from '../utils/ipfs';

const ABI = [
  "function nextEventId() public view returns (uint256)",
  "function fetchEventData(uint256 eventId) public view returns (address organiser, uint8 royaltyBps, uint8 maxResaleMarkupPct)",
  "function getTiers(uint256 eventId) public view returns (tuple(uint256 price, uint256 maxSupply, uint256 sold)[])",
  "function isCancelled(uint256 eventId) public view returns (bool)",
  "event EventCreated(uint256 indexed eventId, address indexed organiser, string ipfsHash)"
];

// ─── IPFS Metadata Cache (localStorage + in-memory) ─────────────────────────────
const CACHE_PREFIX = 'ipfs_meta_v2_';
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days — IPFS content is immutable

// In-memory cache for zero-latency repeat reads within same session
const memCache = new Map<string, any>();

function cacheGet(cid: string): any | undefined {
  // Check memory first (instant)
  if (memCache.has(cid)) return memCache.get(cid);
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + cid);
    if (!raw) return undefined;
    const { ts, data } = JSON.parse(raw);
    if (Date.now() - ts > CACHE_TTL_MS) {
      localStorage.removeItem(CACHE_PREFIX + cid);
      return undefined;
    }
    // Promote to memory cache
    memCache.set(cid, data);
    return data;
  } catch { return undefined; }
}

function cacheSet(cid: string, data: any) {
  memCache.set(cid, data); // Always set in memory (instant reads)
  try {
    localStorage.setItem(CACHE_PREFIX + cid, JSON.stringify({ ts: Date.now(), data }));
  } catch { /* quota exceeded — memory cache still works */ }
}

// Deduplicate inflight requests — if 5 cards request the same CID, only 1 network call
const inflightRequests = new Map<string, Promise<any>>();

async function fetchMetaCached(ipfsHash: string): Promise<any> {
  const cached = cacheGet(ipfsHash);
  if (cached !== undefined) return cached; // null = known-bad, non-null = good data

  // Deduplicate: return existing promise if already in-flight
  if (inflightRequests.has(ipfsHash)) return inflightRequests.get(ipfsHash);

  const promise = fetchFromIPFS(ipfsHash, { json: true, timeout: 12000 })
    .then(result => {
      cacheSet(ipfsHash, result ?? null);
      inflightRequests.delete(ipfsHash);
      return result;
    })
    .catch(() => {
      inflightRequests.delete(ipfsHash);
      return null;
    });

  inflightRequests.set(ipfsHash, promise);
  return promise;
}

// Pre-cache: called after event creation to cache metadata instantly
export function preCacheIPFSMetadata(cid: string, metadata: any) {
  cacheSet(cid, metadata);
}
// ──────────────────────────────────────────────────────────────────────────────

// ─── Tier Price Overrides (localStorage) ──────────────────────────────────────
// Per-tier prices are NOT stored on-chain (only a single lowest price is).
// When the organiser edits tier prices, we persist them here so they survive refresh.
const TIER_PRICE_PREFIX = 'tier_prices_v1_';

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
  venueName?: string;
  minAge?: string;
  locationLink?: string;
  hasIpfsError?: boolean;
  deploymentCost?: string;
  gasUsed?: string;
  txHash?: string;
  _tierSales?: Record<number, number>;
  _tierMaxSupplies?: Record<number, number>; 
  _tierPrices?: Record<number, bigint>;
  _ipfsHash?: string;
  _ipfsHydrated?: boolean;
  maxResaleMarkupPct?: number;
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
  const tierPrices = (e as any)._tierPrices || {};

  const tiers = (metadata.tiers && Array.isArray(metadata.tiers) && metadata.tiers.length > 0)
    ? metadata.tiers.map((t: any, tidx: number) => {
        // Source of truth is blockchain
        const onChainMax = tierMaxSupplies[tidx];
        const onChainPrice = tierPrices[tidx];

        const supply = (onChainMax !== undefined && onChainMax > 0) ? onChainMax : (t.supply ?? 0);
        
        let price = (onChainPrice !== undefined && onChainPrice > 0n)
          ? parseFloat(ethers.formatUnits(onChainPrice, "ether"))
          : (t.price ?? 0);

        // Fix floating point precision
        price = Number(Number(price).toFixed(6));
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
    venueName: metadata.venueName || e.venueName,
    minAge: metadata.minAge || e.minAge,
    locationLink: metadata.locationLink || e.locationLink,
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
          Promise.all([
            contract.fetchEventData(i + 1).catch(() => null),
            contract.isCancelled(i + 1).catch(() => false)
          ])
        )
      );

      // Step 4: Fetch per-tier data (price, supply, sold) from chain
      const tierDataPromises = onChainData.map((data, idx) => {
        const evt = data[0];
        if (!evt) return Promise.resolve({ sales: {}, supplies: {}, prices: {} });
        const eventNum = idx + 1;
        return contract.getTiers(eventNum).then((tiers: any[]) => {
          const sales: Record<number, number> = {};
          const supplies: Record<number, number> = {};
          const prices: Record<number, bigint> = {};
          tiers.forEach((t: any, tidx: number) => {
            sales[tidx] = Number(t.sold);
            supplies[tidx] = Number(t.maxSupply);
            prices[tidx] = t.price;
          });
          return { sales, supplies, prices };
        }).catch(() => ({ sales: {}, supplies: {}, prices: {} }));
      });
      const allTierData = await Promise.all(tierDataPromises);

      // Step 5: Build skeleton events with on-chain tier data
      // Apply cached IPFS metadata SYNCHRONOUSLY so repeat visitors see hydrated cards instantly
      const skeletonEvents: Event[] = onChainData.map((data, idx) => {
        const evt = data[0];
        if (!evt) return null;
        const i = idx + 1;
        const eventId = `evt_${i}`;
        const organiser = data[0].organiser ?? data[0][0];
        const isCancelled = data[1];

        const tierData = allTierData[idx] || { sales: {}, supplies: {}, prices: {} };
        const ipfsHash = eventIpfsHashes[eventId];

        let skeleton: Event = {
          id: eventId,
          title: `Event #${i}`,
          description: "Loading details from IPFS...",
          date: "2099-12-31T00:00:00.000Z",
          location: "Loading...",
          category: "Other",
          organizerId: organiser.toLowerCase(),
          royaltyBps: Number(evt.royaltyBps ?? evt[1]),
          maxResaleMarkupPct: Number(evt.maxResaleMarkupPct ?? evt[2] ?? 10),
          status: isCancelled ? 'cancelled' : 'active',
          hasIpfsError: false,
          tiers: [{
            id: `tier_${eventId}_0`,
            name: 'General Access',
            price: parseFloat(ethers.formatUnits(tierData.prices[0] || 0n, "ether")),
            supply: tierData.supplies[0] || 0,
            sold: tierData.sales[0] || 0
          }],
          txHash: eventTxHashes[eventId],
          _tierSales: tierData.sales,
          _tierMaxSupplies: tierData.supplies,
          _tierPrices: tierData.prices,
          _ipfsHash: ipfsHash,
        } as Event;

        // Instant hydration from cache (sync — no network call)
        if (ipfsHash) {
          const cached = cacheGet(ipfsHash);
          if (cached) {
            skeleton = applyMetadata(skeleton, cached);
            skeleton._ipfsHydrated = true; // Mark so Phase 2 skips it
          }
        }

        return skeleton;
      }).filter((e): e is Event => e !== null);

      // ── Phase 1: Show events IMMEDIATELY from chain data ──────────────────
      // Users see cards with price, supply, tier info right away.
      // Titles show "Event #N" until IPFS hydrates them.
      set({ events: skeletonEvents, isLoading: false });
      console.log(`EventStore: ${skeletonEvents.length} events shown from chain (IPFS hydrating in background)`);

      // ── Phase 2: Hydrate IPFS metadata progressively (non-blocking) ────
      // Each event hydrates independently — fast-cached ones appear first,
      // slow network ones fill in as they arrive. No waiting for all.
      skeletonEvents.forEach((e, idx) => {
        if (!e._ipfsHash || (e as any)._ipfsHydrated) return; // Skip cached ones

        fetchMetaCached(e._ipfsHash)
          .then(metadata => {
            if (metadata) {
              set(state => ({
                events: state.events.map(ev =>
                  ev.id === e.id ? applyMetadata(ev, metadata) : ev
                )
              }));
            } else {
              // Mark as error, schedule retry
              set(state => ({
                events: state.events.map(ev =>
                  ev.id === e.id ? { ...ev, hasIpfsError: true } : ev
                )
              }));
              try { localStorage.removeItem(CACHE_PREFIX + e._ipfsHash); } catch {}
              setTimeout(() => get().retryMetadata(e.id, e._ipfsHash!, 0), 3000);
            }
          })
          .catch(() => {
            try { localStorage.removeItem(CACHE_PREFIX + e._ipfsHash!); } catch {}
            setTimeout(() => get().retryMetadata(e.id, e._ipfsHash!, 0), 3000);
          });
      });

    } catch (err) {
      console.error("EventStore: Critical failure during chain sync:", err);
      set({ isLoading: false });
    }
  }
}));

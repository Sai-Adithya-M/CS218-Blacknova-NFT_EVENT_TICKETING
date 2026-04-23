import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { ethers } from 'ethers';
import { config } from '../config';
import { getReadProvider } from '../utils/blockchain';
import { IPFS_GATEWAYS, extractCid } from '../utils/ipfs';

const ABI = [
  "function nextEventId() public view returns (uint)",
  "function fetchEventData(uint eventId) public view returns (tuple(uint256 maxTickets, uint256 priceWei, uint256 ticketsSold, address organiser, uint96 royaltyBps, bool exists, string ipfsHash))",
  "event TicketMinted(uint indexed tokenId, uint indexed eventId, address indexed buyer, uint8 tier)"
];

const fetchIPFSMetadata = async (ipfsHash: string): Promise<any> => {
  const cid = extractCid(ipfsHash) || ipfsHash;
  if (!cid) return null;
  const controllers = IPFS_GATEWAYS.slice(0, 3).map(() => new AbortController());
  const timeoutId = setTimeout(() => controllers.forEach(c => c.abort()), 10000);
  try {
    const fetchPromises = IPFS_GATEWAYS.slice(0, 3).map((gateway, i) => 
      fetch(`${gateway}/${cid}`, { signal: controllers[i].signal })
        .then(res => res.ok ? res.json() : Promise.reject())
    );
    const result = await Promise.any(fetchPromises);
    clearTimeout(timeoutId);
    return result;
  } catch (e) {
    for (const gateway of IPFS_GATEWAYS.slice(3)) {
      try {
        const response = await fetch(`${gateway}/${cid}`, { signal: AbortSignal.timeout(5000) });
        if (response.ok) return await response.json();
      } catch (err) { continue; }
    }
  }
  return null;
};

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
  deploymentCost?: string; // Total gas cost in Wei
  gasUsed?: string;       // Units of gas used
}

interface EventState {
  events: Event[];
  isLoading: boolean;
  createEvent: (event: Event) => void;
  incrementTierSold: (eventId: string, tierId: string) => void;
  fetchEventsFromChain: () => Promise<void>;
  retryMetadata: (eventId: string, ipfsHash: string) => Promise<void>;
}

// Global Deduplication Logic
const dedupeEvents = (events: Event[]): Event[] => {
  const seen = new Set();
  return events.reduce((acc: Event[], current) => {
    const titleKey = current.title.trim().toLowerCase();
    const organizerKey = current.organizerId.toLowerCase();
    const descKey = current.description.trim().toLowerCase();
    
    // Unique key combines index ID or Content Fingerprint
    const uniqueKey = `${titleKey}_${organizerKey}_${descKey}_${current.royaltyBps}`;
    
    const isIdDuplicate = acc.some(e => e.id === current.id);
    const isContentDuplicate = seen.has(uniqueKey);

    if (!isIdDuplicate && !isContentDuplicate) {
      acc.push(current);
      seen.add(uniqueKey);
    }
    return acc;
  }, []).sort((a,b) => b.id.localeCompare(a.id, undefined, {numeric: true}));
};

export const useEventStore = create<EventState>()(
  persist(
    (set, get) => ({
      events: [],
      isLoading: false,

      createEvent: (event) => set((state) => ({ 
        events: dedupeEvents([event, ...state.events]) 
      })),

      incrementTierSold: (eventId, tierId) => set((state) => ({
        events: state.events.map(e => e.id === eventId ? {
          ...e,
          tiers: e.tiers.map(t => t.id === tierId ? { ...t, sold: t.sold + 1 } : t)
        } : e)
      })),

      retryMetadata: async (eventId, ipfsHash) => {
        const metadata = await fetchIPFSMetadata(ipfsHash);
        if (metadata) {
          set((state) => ({
            events: dedupeEvents(state.events.map(e => e.id === eventId ? {
              ...e,
              title: metadata.name || metadata.title || e.title,
              description: metadata.description || e.description,
              date: metadata.date || metadata.dateTime || e.date,
              location: metadata.location || e.location,
              category: metadata.category || e.category,
              imageUrl: metadata.image || e.imageUrl,
              hasIpfsError: false,
              tiers: (metadata.tiers && Array.isArray(metadata.tiers)) ? metadata.tiers.map((t: any, tidx: number) => ({
                id: t.id || `${eventId}_tier_${tidx}`,
                name: t.name || 'Tier',
                price: t.price || e.tiers[0]?.price,
                supply: t.supply || e.tiers[0]?.supply,
                sold: tidx === 0 ? e.tiers[0]?.sold : 0
              })) : e.tiers
            } : e))
          }));
        } else {
          setTimeout(() => get().retryMetadata(eventId, ipfsHash), 30000);
        }
      },

      fetchEventsFromChain: async () => {
        if (!config.contractAddress || config.contractAddress === "0x0000000000000000000000000000000000000000") return;
        set({ isLoading: true });
        try {
          const provider = getReadProvider();
          const contract = new ethers.Contract(config.contractAddress, ABI, provider);
          const nextEventId = await contract.nextEventId();
          const totalEvents = Number(nextEventId) - 1;

          const onChainData = await Promise.all(
            Array.from({ length: totalEvents }, (_, i) => contract.fetchEventData(i + 1))
          );

          const currentEvents = get().events;
          const updatedEvents: Event[] = onChainData.map((evt, idx) => {
            const i = idx + 1;
            const eventId = `evt_${i}`;
            const existing = currentEvents.find(e => e.id === eventId);
            const onChainTotalSold = Number(evt.ticketsSold || evt[2]);
            
            if (existing && !existing.description.includes("Loading")) {
              return { ...existing, tiers: existing.tiers.map((t, tidx) => ({ ...t, sold: tidx === 0 ? onChainTotalSold : t.sold })) };
            }

            return {
              id: eventId,
              title: `Event #${i}`,
              description: "Loading details from IPFS...",
              date: "2099-12-31T00:00:00.000Z",
              location: "Loading location...",
              category: "Other",
              organizerId: (evt.organiser || evt[3]).toLowerCase(),
              royaltyBps: Number(evt.royaltyBps || evt[4]),
              status: 'active',
              hasIpfsError: true,
              tiers: [{ id: `tier_${eventId}_0`, name: 'General Access', price: parseFloat(ethers.formatEther(evt.priceWei || evt[1])), supply: Number(evt.maxTickets || evt[0]), sold: onChainTotalSold }]
            };
          });

          set({ events: dedupeEvents([...updatedEvents, ...currentEvents]), isLoading: false });

          updatedEvents.forEach(e => {
            if (e.description.includes("Loading")) {
              const onChain = onChainData[parseInt(e.id.split('_')[1]) - 1];
              const hash = onChain?.ipfsHash || onChain?.[6];
              if (hash) get().retryMetadata(e.id, hash);
            }
          });
        } catch (err) {
          set({ isLoading: false });
        }
      }
    }),
    { name: `netix_event_storage_${config.contractAddress.toLowerCase()}` }
  )
);

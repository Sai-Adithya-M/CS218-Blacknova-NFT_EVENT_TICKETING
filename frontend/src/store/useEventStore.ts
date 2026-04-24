import { create } from 'zustand';

import { ethers } from 'ethers';
import { config } from '../config';
import { getReadProvider } from '../utils/blockchain';
import { fetchFromIPFS } from '../utils/ipfs';

const ABI = [
  "function nextEventId() public view returns (uint)",
  "function nextTokenId() public view returns (uint256)",
  "function fetchEventData(uint eventId) public view returns (tuple(uint256 maxTickets, uint256 priceWei, uint256 ticketsSold, address organiser, uint96 royaltyBps, bool exists, string ipfsHash))",
  "function tokenToEvent(uint256 tokenId) public view returns (uint)",
  "function tokenToTier(uint256 tokenId) public view returns (uint8)"
];


const fetchIPFSMetadata = async (ipfsHash: string): Promise<any> => {
  return fetchFromIPFS(ipfsHash, { json: true, timeout: 20000 });
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
  onChainTierSales?: Record<number, number>;
}

interface EventState {
  events: Event[];
  isLoading: boolean;
  createEvent: (event: Event) => void;
  incrementTierSold: (eventId: string, tierId: string) => void;
  fetchEventsFromChain: () => Promise<void>;
  retryMetadata: (eventId: string, ipfsHash: string, retryCount?: number) => Promise<void>;
}



export const useEventStore = create<EventState>((set, get) => ({
  events: [],
  isLoading: false,

  createEvent: (event) => set((state) => ({ 
    events: [event, ...state.events] 
  })),

  incrementTierSold: (eventId, tierId) => set((state) => ({
    events: state.events.map(e => e.id === eventId ? {
      ...e,
      tiers: e.tiers.map(t => t.id === tierId ? { ...t, sold: t.sold + 1 } : t)
    } : e)
  })),

  retryMetadata: async (eventId, ipfsHash, retryCount = 0) => {
    const metadata = await fetchIPFSMetadata(ipfsHash);
    if (metadata) {
      set((state) => ({
        events: state.events.map(e => e.id === eventId ? {
          ...e,
          title: metadata.name || metadata.title || e.title,
          description: metadata.description || e.description,
          date: metadata.date || metadata.dateTime || e.date,
          location: metadata.location || e.location,
          category: metadata.category || e.category,
          imageUrl: metadata.image || e.imageUrl,
          hasIpfsError: false,
          tiers: (metadata.tiers && Array.isArray(metadata.tiers)) ? metadata.tiers.map((t: any, tidx: number) => {
            // onChainTierSales is the source of truth for per-tier sold counts
            // existingTier only works for tidx=0 since the initial state has 1 placeholder tier
            const onChainSold = (e.onChainTierSales && e.onChainTierSales[tidx]) || 0;
            
            console.log(`EventStore: Tier "${t.name}" (idx=${tidx}) onChainSold=${onChainSold}`);
            
            return {
              id: t.id || `${eventId}_tier_${tidx}`,
              name: t.name || 'Tier',
              price: t.price || 0,
              supply: t.supply || 0,
              sold: onChainSold
            };
          }) : e.tiers
        } : e)
      }));
    } else {
      // Retry faster initially (5s), then slower (30s)
      const delay = retryCount < 5 ? 5000 : 30000;
      setTimeout(() => get().retryMetadata(eventId, ipfsHash, retryCount + 1), delay);
      
      if (retryCount > 2) {
         set((state) => ({
           events: state.events.map(e => e.id === eventId ? { ...e, hasIpfsError: true } : e)
         }));
      }
    }
  },

  fetchEventsFromChain: async () => {
    if (!config.contractAddress || config.contractAddress === "0x0000000000000000000000000000000000000000") {
      console.warn("EventStore: No contract address configured");
      return;
    }
    
    set({ isLoading: true });
    console.log("EventStore: Syncing from chain...", config.contractAddress);

    try {
      const provider = getReadProvider();
      const contract = new ethers.Contract(config.contractAddress, ABI, provider);
      
      // 1. Fetch total events
      const nextEventId = await contract.nextEventId();
      const totalEvents = Number(nextEventId) - 1;
      console.log(`EventStore: Found ${totalEvents} events on-chain`);

      if (totalEvents <= 0) {
        set({ events: [], isLoading: false });
        return;
      }

      // 2. Fetch event data from chain
      const onChainData = await Promise.all(
        Array.from({ length: totalEvents }, (_, i) => contract.fetchEventData(i + 1))
      );

      // 3. ⚡ Build per-tier sales by reading token state directly from contract
      //    The deployed contract's TicketMinted event doesn't include the tier field,
      //    so we read tokenToEvent(id) and tokenToTier(id) for each minted token.
      const eventTierSales: Record<string, Record<number, number>> = {};
      try {
        const nextTokenId = await contract.nextTokenId();
        const totalTokens = Number(nextTokenId) - 1;
        console.log(`EventStore: Reading tier data for ${totalTokens} tokens from contract state...`);
        
        if (totalTokens > 0) {
          // Batch read all tokens' event and tier mappings
          const tokenReads = Array.from({ length: totalTokens }, (_, i) => i + 1).map(async (tokenId) => {
            try {
              const [eventIdBN, tierIdx] = await Promise.all([
                contract.tokenToEvent(tokenId),
                contract.tokenToTier(tokenId)
              ]);
              const eId = `evt_${eventIdBN.toString()}`;
              const tier = Number(tierIdx);
              return { eId, tier };
            } catch {
              return null;
            }
          });
          
          const results = await Promise.all(tokenReads);
          results.forEach(r => {
            if (r) {
              if (!eventTierSales[r.eId]) eventTierSales[r.eId] = {};
              eventTierSales[r.eId][r.tier] = (eventTierSales[r.eId][r.tier] || 0) + 1;
            }
          });
        }
        
        console.log("EventStore: Tier sales breakdown:", JSON.stringify(eventTierSales));
      } catch (tierErr) {
        console.warn("EventStore: Failed to read tier sales from contract:", tierErr);
      }

      const updatedEvents: Event[] = onChainData.map((evt, idx): Event | null => {
        const i = idx + 1;
        const eventId = `evt_${i}`;
        
        const exists = evt.exists !== undefined ? evt.exists : evt[5];
        if (!exists) return null;


        const tierSales = eventTierSales[eventId] || {};
        
        return {
          id: eventId,
          title: `Event #${i}`,
          description: "Loading details from IPFS...",
          date: "2099-12-31T00:00:00.000Z",
          location: "Loading location...",
          category: "Loading...",
          organizerId: (evt.organiser || evt[3]).toLowerCase(),
          royaltyBps: Number(evt.royaltyBps || evt[4]),
          status: 'active' as const,
          hasIpfsError: true,
          onChainTierSales: tierSales,
          tiers: [{ 
            id: `tier_${eventId}_0`, 
            name: 'Loading Tiers...', 
            price: parseFloat(ethers.formatEther(evt.priceWei || evt[1])), 
            supply: Number(evt.maxTickets || evt[0]), 
            sold: tierSales[0] || 0 
          }]
        };
      }).filter((e): e is Event => e !== null);

      console.log(`EventStore: Successfully processed ${updatedEvents.length} events`);
      set({ events: updatedEvents, isLoading: false });

      updatedEvents.forEach(e => {
        const onChain = onChainData[parseInt(e.id.split('_')[1]) - 1];
        const hash = onChain?.ipfsHash || onChain?.[6];
        if (hash) get().retryMetadata(e.id, hash);
      });

    } catch (err) {
      console.error("EventStore: Critical failure during chain sync:", err);
      set({ isLoading: false });
    }
  }
}));



import { create } from 'zustand';

import { ethers } from 'ethers';
import { config } from '../config';
import { getReadProvider } from '../utils/blockchain';
import { fetchFromIPFS } from '../utils/ipfs';

const ABI = [
  "function nextEventId() public view returns (uint)",
  "function nextTokenId() public view returns (uint256)",
  "function fetchEventData(uint eventId) public view returns (tuple(address organiser, uint96 royaltyBps, bool exists, string ipfsHash, uint8 numTiers, uint256 totalRevenue, uint256 totalRoyaltyEarned))",
  "function getEventStats(uint256 eventId) public view returns (uint256 totalSold, uint256 totalRevenue, uint256 totalRoyaltyEarned, uint8 numTiers)",
  "function getTierData(uint256 eventId, uint8 tierId) public view returns (tuple(string name, uint256 price, uint256 maxSupply, uint256 soldCount))",
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
  ipfsLoaded?: boolean;
  ipfsError?: boolean;
  totalRevenue?: string;
  totalRoyaltyEarned?: string;
  onChainTierSales?: Record<number, number>;
  isOptimistic?: boolean;
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

  createEvent: (event) => set((state) => {
    // Prevent duplicate events if the real one comes in later
    const exists = state.events.some(e => e.id === event.id);
    if (exists) return state;
    return { events: [event, ...state.events] };
  }),

  incrementTierSold: (eventId, tierId) => set((state) => ({
    events: state.events.map(e => e.id === eventId ? {
      ...e,
      tiers: e.tiers.map(t => t.id === tierId ? { ...t, sold: t.sold + 1 } : t)
    } : e)
  })),

  retryMetadata: async (eventId, ipfsHash, retryCount = 0) => {
    try {
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
            ipfsLoaded: true,
            ipfsError: false,
            // Merge IPFS tier names with on-chain data if necessary
            tiers: e.tiers.map((tier, idx) => ({
              ...tier,
              name: (metadata.tiers && metadata.tiers[idx]?.name) || tier.name,
            }))
          } : e)
        }));
      } else {
        throw new Error("Metadata empty");
      }
    } catch (err) {
      const delay = retryCount < 5 ? 5000 : 30000;
      setTimeout(() => get().retryMetadata(eventId, ipfsHash, retryCount + 1), delay);
      
      if (retryCount > 2) {
         set((state) => ({
           events: state.events.map(e => e.id === eventId ? { ...e, hasIpfsError: true, ipfsError: true, ipfsLoaded: false } : e)
         }));
      }
    }
  },

  fetchEventsFromChain: async () => {
    if (!config.contractAddress || config.contractAddress === "0x0000000000000000000000000000000000000000") {
      return;
    }
    
    set({ isLoading: true });

    try {
      const provider = getReadProvider();
      const contract = new ethers.Contract(config.contractAddress, ABI, provider);
      
      const nextEventId = await contract.nextEventId();
      const totalEvents = Number(nextEventId) - 1;

      if (totalEvents <= 0) {
        set({ events: [], isLoading: false });
        return;
      }

      const updatedEvents: Event[] = [];

      for (let i = 1; i <= totalEvents; i++) {
        try {
          const evt = await contract.fetchEventData(i);
          if (!evt.exists && !evt[2]) continue;

          const stats = await contract.getEventStats(i);
          const numTiers = Number(stats.numTiers || stats[3]);
          
          const tiers: TicketTier[] = [];
          for (let t = 0; t < numTiers; t++) {
            const tData = await contract.getTierData(i, t);
            tiers.push({
              id: `tier_${i}_${t}`,
              name: tData.name || tData[0],
              price: parseFloat(ethers.formatEther(tData.price || tData[1])),
              supply: Number(tData.maxSupply || tData[2]),
              sold: Number(tData.soldCount || tData[3])
            });
          }

          const eventId = `evt_${i}`;
          updatedEvents.push({
            id: eventId,
            title: `Event #${i}`,
            description: "Loading details from IPFS...",
            date: "2099-12-31T00:00:00.000Z",
            location: "Loading location...",
            category: "Loading...",
            organizerId: (evt.organiser || evt[0]).toLowerCase(),
            royaltyBps: Number(evt.royaltyBps || evt[1]),
            status: 'active',
            tiers,
            totalRevenue: ethers.formatEther(evt.totalRevenue || evt[5]),
            totalRoyaltyEarned: ethers.formatEther(evt.totalRoyaltyEarned || evt[6]),
            hasIpfsError: false,
            ipfsLoaded: false,
            ipfsError: false
          });

          // Trigger metadata fetch
          const hash = evt.ipfsHash || evt[3];
          if (hash) get().retryMetadata(eventId, hash);
        } catch (e) {
          console.error(`Failed to fetch data for event ${i}:`, e);
        }
      }

      const optimisticEvents = get().events.filter(e => e.isOptimistic);
      set({ events: [...optimisticEvents, ...updatedEvents], isLoading: false });
    } catch (err) {
      console.error("EventStore: Sync failure:", err);
      set({ isLoading: false });
    }
  }
}));



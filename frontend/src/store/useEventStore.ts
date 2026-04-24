import { create } from 'zustand';

import { ethers } from 'ethers';
import { config } from '../config';
import { getReadProvider } from '../utils/blockchain';
import { fetchFromIPFS } from '../utils/ipfs';

const ABI = [
  "function nextEventId() public view returns (uint)",
  "function fetchEventData(uint eventId) public view returns (tuple(uint256 maxTickets, uint256 priceWei, uint256 ticketsSold, address organiser, uint96 royaltyBps, bool exists, string ipfsHash))",
  "event TicketMinted(uint indexed tokenId, uint indexed eventId, address indexed buyer, uint8 tier)",
  "event EventCreated(uint256 indexed eventId, address indexed organiser, string ipfsHash)"
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
  txHash?: string;
  _tierSales?: Record<number, number>;
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



export const useEventStore = create<EventState>((set, get) => ({
  events: [],
  isLoading: false,

  createEvent: (event) => set((state) => ({ 
    events: [event, ...state.events] 
  })),

  editEventLocally: (eventId, updatedData) => set((state) => ({
    events: state.events.map(e => e.id === eventId ? { ...e, ...updatedData } : e)
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
            const hasSalesData = e._tierSales && Object.keys(e._tierSales).length > 0;
            return {
              id: t.id || `${eventId}_tier_${tidx}`,
              name: t.name || 'Tier',
              price: t.price || e.tiers[0]?.price,
              supply: t.supply || e.tiers[0]?.supply,
              sold: hasSalesData ? (e._tierSales![tidx] || 0) : (tidx === 0 ? (e.tiers[0]?.sold || 0) : 0)
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
        
        // Scan backwards in 10k chunks
        while (latestBlock >= startBlock && !actualTxHash) {
          const fromBlock = Math.max(startBlock, latestBlock - 10000);
          try {
            const logs = await contract.queryFilter(createdFilter, fromBlock, latestBlock);
            if (logs && logs.length > 0) {
              actualTxHash = logs[0].transactionHash;
              break;
            }
          } catch(e) {}
          latestBlock = fromBlock - 1;
        }
      }

      if (!actualTxHash) return;

      const receipt = await provider.getTransactionReceipt(actualTxHash);
      if (receipt) {
        const gasUsed = receipt.gasUsed;
        const gasPrice = receipt.gasPrice || (await provider.getFeeData()).gasPrice || BigInt(0);
        const costWei = gasUsed * gasPrice;
        
        set(state => ({
          events: state.events.map(e => e.id === eventId ? {
            ...e,
            txHash: actualTxHash,
            gasUsed: gasUsed.toString(),
            deploymentCost: costWei.toString()
          } : e)
        }));
      }
    } catch (err) {
      console.warn("Failed to load gas cost for event:", eventId, err);
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

      // 3. ⚡ Fetch TicketMinted events (with safety fallback)
      const eventTierSales: Record<string, Record<number, number>> = {};
      try {
        const mintedFilter = contract.filters.TicketMinted();
        const fromBlock = config.deploymentBlock || 5700000; 
        
        let mintedLogs: any[] = [];
        try {
          mintedLogs = await contract.queryFilter(mintedFilter, fromBlock);
        } catch(e) {
          mintedLogs = await contract.queryFilter(mintedFilter, -10000).catch(() => []);
        }
        
        mintedLogs.forEach((log: any) => {
          if (log.args) {
            const eId = `evt_${log.args.eventId.toString()}`;
            const tierIdx = Number(log.args.tier);
            if (!eventTierSales[eId]) eventTierSales[eId] = {};
            eventTierSales[eId][tierIdx] = (eventTierSales[eId][tierIdx] || 0) + 1;
          }
        });
      } catch (logErr) {
        console.warn("EventStore: Failed to fetch minted logs:", logErr);
      }

      // 4. Fetch EventCreated logs to get tx hashes
      const eventTxHashes: Record<string, string> = {};
      try {
        const createdFilter = contract.filters.EventCreated();
        const fromBlock = config.deploymentBlock || 5700000;
        
        let createdLogs: any[] = [];
        try {
          createdLogs = await contract.queryFilter(createdFilter, fromBlock);
        } catch(e) {
          createdLogs = await contract.queryFilter(createdFilter, -10000).catch(() => []);
        }
        
        createdLogs.forEach((log: any) => {
          if (log.args && log.transactionHash) {
            const eId = `evt_${log.args.eventId.toString()}`;
            eventTxHashes[eId] = log.transactionHash;
          }
        });
      } catch (logErr) {
        console.warn("EventStore: Failed to fetch EventCreated logs:", logErr);
      }

      const updatedEvents: Event[] = onChainData.map((evt, idx): Event | null => {
        const i = idx + 1;
        const eventId = `evt_${i}`;
        
        const exists = evt.exists !== undefined ? evt.exists : evt[5];
        if (!exists) return null;

        const onChainTotalSold = Number(evt.ticketsSold || evt[2]);
        const tierSales = eventTierSales[eventId] || {};
        
        return {
          id: eventId,
          title: `Event #${i}`,
          description: "Loading details from IPFS...",
          date: "2099-12-31T00:00:00.000Z",
          location: "Loading location...",
          category: "Other",
          organizerId: (evt.organiser || evt[3]).toLowerCase(),
          royaltyBps: Number(evt.royaltyBps || evt[4]),
          status: 'active' as const,
          hasIpfsError: true,
          tiers: [{ 
            id: `tier_${eventId}_0`, 
            name: 'General Access', 
            price: parseFloat(ethers.formatEther(evt.priceWei || evt[1])), 
            supply: Number(evt.maxTickets || evt[0]), 
            sold: tierSales[0] || onChainTotalSold 
          }],
          txHash: eventTxHashes[eventId],
          _tierSales: tierSales
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



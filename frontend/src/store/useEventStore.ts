import { create } from 'zustand';
import { ethers } from 'ethers';
import { config } from '../config';

const ABI = [
  "function nextEventId() public view returns (uint)",
  "function fetchEventData(uint eventId) public view returns (tuple(string name, uint maxTickets, uint priceWei, uint ticketsSold, address organiser, uint96 royaltyBps, bool exists))"
];

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
  organizerId: string;
  status: 'active' | 'past';
  imageUrl?: string;
  tiers: TicketTier[];
}

interface EventState {
  events: Event[];
  createEvent: (event: Omit<Event, 'id' | 'status'> & { id?: string }) => void;
  incrementTierSold: (eventId: string, tierId: string) => void;
  fetchEventsFromChain: () => Promise<void>;
}

export const useEventStore = create<EventState>((set) => ({
  events: [],
  
  createEvent: (eventData) => set((state) => ({
    events: [
      ...state.events, 
      { 
        ...eventData, 
        id: eventData.id || `evt_${Date.now()}`, 
        status: 'active' 
      }
    ]
  })),

  incrementTierSold: (eventId, tierId) => set((state) => ({
    events: state.events.map(e => 
      e.id === eventId 
        ? { 
            ...e, 
            tiers: e.tiers.map(t => 
              t.id === tierId ? { ...t, sold: t.sold + 1 } : t
            ) 
          } 
        : e
    )
  })),

  fetchEventsFromChain: async () => {
    if (!config.contractAddress || config.contractAddress === "0x0000000000000000000000000000000000000000") return;

    try {
      let provider;
      if ((window as any).ethereum) {
        provider = new ethers.BrowserProvider((window as any).ethereum);
      } else {
        provider = new ethers.JsonRpcProvider('https://rpc2.sepolia.org');
      }

      const contract = new ethers.Contract(config.contractAddress, ABI, provider);
      const nextEventId = await contract.nextEventId();
      const loadedEvents: Event[] = [];

      for (let i = 1; i < Number(nextEventId); i++) {
        try {
          const evt = await contract.fetchEventData(i);
          if (evt.exists || evt[6]) { // Support both array index and object key
            loadedEvents.push({
              id: `evt_${i}`,
              title: evt.name || evt[0],
              description: 'Loaded from Blockchain',
              date: new Date().toISOString(),
              location: 'Decentralized',
              category: 'Music & Concerts',
              organizerId: evt.organiser || evt[4],
              status: 'active',
              tiers: [
                {
                  id: `tier_evt_${i}`,
                  name: 'General Access',
                  price: parseFloat(ethers.formatEther(evt.priceWei || evt[2])),
                  supply: Number(evt.maxTickets || evt[1]),
                  sold: Number(evt.ticketsSold || evt[3])
                }
              ]
            });
          }
        } catch (e) {
          console.error(`fetchEventData error for event ${i}:`, e);
        }
      }

      set({ events: loadedEvents });
    } catch (err) {
      console.error('fetchEventsFromChain error:', err);
    }
  }
}));

import { create } from 'zustand';
import { ethers } from 'ethers';
import { config } from '../config';
import { getReadProvider } from '../utils/blockchain';

const ABI = [
  "function nextEventId() public view returns (uint)",
  "function fetchEventData(uint eventId) public view returns (tuple(string name, uint maxTickets, uint priceWei, uint ticketsSold, address organiser, uint96 royaltyBps, bool exists))",
  "event EventCreated(uint indexed eventId, address indexed organiser, string name)"
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
  royaltyBps: number;
  status: 'active' | 'past';
  imageUrl?: string;
  tiers: TicketTier[];
}

interface EventState {
  events: Event[];
  isLoading: boolean;
  createEvent: (event: Omit<Event, 'id' | 'status'> & { id?: string }) => void;
  incrementTierSold: (eventId: string, tierId: string) => void;
  fetchEventsFromChain: () => Promise<void>;
}

export const useEventStore = create<EventState>((set) => ({
  events: [],
  isLoading: false,

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
    if (!config.contractAddress || config.contractAddress === "0x0000000000000000000000000000000000000000") {
      return;
    }

    set({ isLoading: true });
    try {
      console.log("Starting reliable blockchain sync from block:", config.deploymentBlock);
      const provider = getReadProvider();
      const contract = new ethers.Contract(config.contractAddress, ABI, provider);

      const filter = contract.filters.EventCreated();
      const eventLogs = await contract.queryFilter(filter, config.deploymentBlock, "latest");
      
      console.log(`Found ${eventLogs.length} events on-chain.`);

      const loadedEvents: Event[] = [];

      for (const log of eventLogs) {
        try {
          const parsedLog = contract.interface.parseLog(log as any);
          const eventId = parsedLog?.args?.eventId || (log as any).args?.[0];
          
          if (!eventId) continue;

          const evt = await contract.fetchEventData(eventId);
          
          if (evt.exists || evt[6]) {
            const rawName = evt.name || evt[0];
            const nameParts = rawName.split('|||');

            const title = nameParts[0] || rawName;
            const location = nameParts[1] || '';
            const date = nameParts[2] || new Date().toISOString();
            const description = nameParts[3] || '';
            const category = nameParts[4] || 'Music & Concerts';

            const eventDate = new Date(date);
            const isExpired = eventDate < new Date();

            loadedEvents.push({
              id: `evt_${eventId.toString()}`,
              title,
              description,
              date,
              location,
              category,
              organizerId: evt.organiser || evt[4],
              royaltyBps: Number(evt.royaltyBps || evt[5]),
              status: isExpired ? 'past' : 'active',
              tiers: [
                {
                  id: `tier_evt_${eventId.toString()}`,
                  name: 'General Access',
                  price: parseFloat(ethers.formatEther(evt.priceWei || evt[2])),
                  supply: Number(evt.maxTickets || evt[1]),
                  sold: Number(evt.ticketsSold || evt[3])
                }
              ]
            });
          }
        } catch (e) {
          console.error(`Sync error for log:`, e);
        }
      }

      set({ events: loadedEvents, isLoading: false });
      console.log("Blockchain sync complete.");
    } catch (err) {
      console.error('fetchEventsFromChain failed:', err);
      set({ isLoading: false });
    }
  }
}));

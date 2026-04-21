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
  basePriceWei?: string; // Raw price from contract (used for actual purchases)
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
        status: new Date(eventData.date) < new Date() ? 'past' : 'active'
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

            // --- Robust tier extraction ---
            // The tier JSON is always the LAST segment in the packed name
            // and always starts with '['. If the description contained '|||',
            // the simple nameParts[5] approach fails, so we search backwards.
            let tiersRaw = '';
            if (nameParts.length > 5) {
              // Search from the end for a segment that looks like a JSON array
              for (let j = nameParts.length - 1; j >= 5; j--) {
                const candidate = nameParts[j].trim();
                if (candidate.startsWith('[')) {
                  // If the JSON was split by ||| inside it (very unlikely),
                  // rejoin everything from this index onward
                  tiersRaw = nameParts.slice(j).join('|||');
                  break;
                }
              }
              // If no segment starts with '[', try the 6th segment as-is (legacy)
              if (!tiersRaw) {
                tiersRaw = nameParts[5] || '';
              }
            }

            // Decode tiers from packed metadata
            let tiers: { id: string; name: string; price: number; supply: number; sold: number }[] = [];
            if (tiersRaw) {
              try {
                const parsed = JSON.parse(tiersRaw);
                if (Array.isArray(parsed) && parsed.length > 0) {
                  // Distribute the total ticketsSold proportionally across tiers
                  const totalSupply = parsed.reduce((a: number, t: any) => a + (Number(t.s) || 0), 0);
                  const totalSold = Number(evt.ticketsSold || evt[3]);
                  
                  tiers = parsed.map((t: any, i: number) => {
                    const tierSupply = Number(t.s) || 0;
                    // Proportional sold distribution (best effort since contract tracks total only)
                    const tierSold = totalSupply > 0 
                      ? Math.min(tierSupply, Math.round((tierSupply / totalSupply) * totalSold))
                      : 0;
                    return {
                      id: `tier_evt_${eventId.toString()}_${i}`,
                      name: t.n || `Tier ${i + 1}`,
                      price: Number(t.p) || 0,
                      supply: tierSupply,
                      sold: tierSold,
                    };
                  });
                  console.log(`Event ${eventId}: decoded ${tiers.length} tier(s) from chain:`, tiers.map(t => t.name));
                }
              } catch (e) {
                console.warn(`Event ${eventId}: tier JSON parse failed for:`, tiersRaw, e);
              }
            }

            // Fallback: single tier from contract data
            if (tiers.length === 0) {
              console.warn(`Event ${eventId}: no tier data found in name field, using General Access fallback. Raw name:`, rawName);
              tiers = [{
                id: `tier_evt_${eventId.toString()}`,
                name: 'General Access',
                price: parseFloat(ethers.formatEther(evt.priceWei || evt[2])),
                supply: Number(evt.maxTickets || evt[1]),
                sold: Number(evt.ticketsSold || evt[3])
              }];
            }

            // Store contract's base price for purchases (contract only supports one price)
            const basePriceWei = (evt.priceWei || evt[2]).toString();

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
              tiers,
              basePriceWei,
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

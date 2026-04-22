import { create } from 'zustand';
import { ethers } from 'ethers';
import { config } from '../config';
import { getReadProvider } from '../utils/blockchain';

import { ipfsToHttpUrl, IPFS_GATEWAYS, extractCid } from '../utils/ipfs';

const ABI = [
  "function nextEventId() public view returns (uint)",
  "function fetchEventData(uint eventId) public view returns (tuple(uint32 maxTickets, uint256 priceWei, uint32 ticketsSold, uint8 royaltyBps, bool exists, address organiser))",
  "event EventCreated(uint indexed eventId, address indexed organiser, string ipfsHash)"
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
  hasIpfsError?: boolean;
  tiers: TicketTier[];
}

interface EventState {
  events: Event[];
  isLoading: boolean;
  createEvent: (event: Omit<Event, 'id' | 'status'> & { id?: string }) => void;
  incrementTierSold: (eventId: string, tierId: string, quantity?: number) => void;
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
      console.log("Starting reliable blockchain sync using nextEventId...");
      const provider = getReadProvider();
      const contract = new ethers.Contract(config.contractAddress, ABI, provider);

      const filter = contract.filters.EventCreated();
      const eventLogs = await contract.queryFilter(filter, config.deploymentBlock, "latest");

      console.log(`Found ${eventLogs.length} events on-chain.`);

      const eventPromises = eventLogs.map(async (log) => {
        let eventIdForCatch: string | null = null;
        try {
          const parsedLog = contract.interface.parseLog(log as any);
          const eventId = parsedLog?.args?.eventId || (log as any).args?.[0];
          eventIdForCatch = eventId ? eventId.toString() : null;
          const logOrganiser = parsedLog?.args?.organiser || (log as any).args?.[1];
          const ipfsHash = parsedLog?.args?.ipfsHash || (log as any).args?.[2];

          if (!eventId) return null;

          const evt = await contract.fetchEventData(eventId);


          if (evt.exists || evt[4]) {
            let title = "Unknown Event";
            let location = "Unknown Location";
            let date = new Date().toISOString();
            let description = "No description available.";
            let category = "Uncategorized";
            let hasIpfsError = false;
            let imageUrl: string | undefined = undefined;

            if (ipfsHash) {
              const cid = extractCid(ipfsHash) || ipfsHash;
              let fetched = false;

              for (const gateway of IPFS_GATEWAYS) {
                try {
                  const url = `${gateway}/${cid}`;
                  const controller = new AbortController();
                  const timeoutId = setTimeout(() => controller.abort(), 6000);
                  const res = await fetch(url, { signal: controller.signal });
                  clearTimeout(timeoutId);

                  if (res.ok) {
                    const metadata = await res.json();
                    title = metadata.name || title;
                    location = metadata.location || location;
                    date = metadata.date || date;
                    description = metadata.description || description;
                    category = metadata.category || category;
                    imageUrl = metadata.image || undefined;
                    fetched = true;
                    break;
                  }
                } catch (e) {
                  // Ignore and try next gateway
                }
              }

              if (!fetched) {
                console.warn("All IPFS gateways failed for event", eventId);
                hasIpfsError = true;
              }
            } else {
               hasIpfsError = true;
            }

            const eventDate = new Date(date);
            const isExpired = eventDate < new Date();

            return {
              id: `evt_${eventId.toString()}`,
              title: hasIpfsError ? title + " ⚠️ (Metadata Unavailable)" : title,
              description,
              date,
              location,
              category,
              hasIpfsError,
              imageUrl,
              organizerId: evt.organiser || evt[5] || logOrganiser,
              royaltyBps: Number(evt.royaltyBps || evt[3]),
              status: isExpired ? 'past' : 'active',
              tiers: [
                {
                  id: `tier_evt_${eventId.toString()}`,
                  name: 'General Access',
                  price: parseFloat(ethers.formatEther(evt.priceWei || evt[1])),
                  supply: Number(evt.maxTickets || evt[0]),
                  sold: Number(evt.ticketsSold || evt[2])
                }
              ]
            } as Event;
          }
        } catch (e) {
          console.error(`Sync error for event ID ${eventIdForCatch || 'unknown'}:`, e);
        }
        return null;
      });

      const resolvedEvents = await Promise.all(eventPromises);
      const loadedEvents = resolvedEvents.filter((ev): ev is Event => ev !== null);

      set({ events: loadedEvents, isLoading: false });
      console.log("Blockchain sync complete.");
    } catch (err) {
      console.error('fetchEventsFromChain failed:', err);
      set({ isLoading: false });
    }
  }
}));

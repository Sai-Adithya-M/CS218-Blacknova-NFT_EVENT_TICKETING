import { create } from 'zustand';
import { ethers } from 'ethers';
import { config } from '../config';
import { getReadProvider } from '../utils/blockchain';
import { fetchFromIPFS } from '../utils/ipfs';

const ABI = [
  "function ownerOf(uint256 tokenId) public view returns (address)",
  "function tokenToEvent(uint256 tokenId) public view returns (uint)",
  "function tokenToTier(uint256 tokenId) public view returns (uint8)",
  "function fetchEventData(uint eventId) public view returns (tuple(uint256 maxTickets, uint256 priceWei, uint256 ticketsSold, address organiser, uint96 royaltyBps, bool exists, string ipfsHash))",
  "function getResaleListing(uint tokenId) public view returns (tuple(address seller, uint256 priceWei, bool active))",
  "function nextTokenId() public view returns (uint256)"
];

// Fallback map if metadata is unreachable
const TIER_MAP: Record<number, string> = {
  0: 'Silver',
  1: 'Gold',
  2: 'VIP'
};

export type TicketStatus = 'active' | 'used' | 'resale';

export interface Ticket {
  id: string;
  tokenId: string;
  eventId: string;
  ownerId: string;
  tierName: string;
  tierPrice: number;
  status: TicketStatus;
  purchasedAt: string;
  txHash?: string;
  qrCode?: string;
  resalePrice?: number;
  resaleLink?: string;
}

interface TicketState {
  tickets: Ticket[];
  isLoading: boolean;
  buyTicket: (eventId: string, ownerId: string, tierName: string, tierPrice: number, tokenId: string, txHash: string) => Ticket;
  listTicketForResale: (ticketId: string, price: number) => void;
  buyResaleTicket: (ticketId: string, newOwnerId: string, pricePaid: number) => void;
  cancelResale: (ticketId: string) => void;
  fetchTicketsFromChain: (userAddress?: string) => Promise<void>;
}

export const useTicketStore = create<TicketState>((set) => ({
  tickets: [],
  isLoading: false,

  buyTicket: (eventId, ownerId, tierName, tierPrice, tokenId, txHash) => {
    const newTicket: Ticket = {
      id: `tkt_${tokenId}`,
      tokenId,
      eventId,
      ownerId,
      tierName,
      tierPrice,
      status: 'active',
      purchasedAt: new Date().toISOString(),
      txHash,
    };
    
    set(state => ({
      tickets: [newTicket, ...state.tickets]
    }));
    
    return newTicket;
  },

  listTicketForResale: (ticketId, price) => set((state) => ({
    tickets: state.tickets.map(t =>
      t.id === ticketId ? { ...t, status: 'resale', resalePrice: price, resaleLink: `http://localhost:3000/resale/${ticketId}` } : t
    )
  })),

  buyResaleTicket: (ticketId, newOwnerId, pricePaid) => set((state) => ({
    tickets: state.tickets.map(t =>
      t.id === ticketId ? { ...t, ownerId: newOwnerId, status: 'active' as TicketStatus, tierPrice: pricePaid ?? t.resalePrice ?? t.tierPrice, resalePrice: undefined, resaleLink: undefined } : t
    )
  })),

  cancelResale: (ticketId) => set((state) => ({
    tickets: state.tickets.map(t =>
      t.id === ticketId ? { ...t, status: 'active' as TicketStatus, resalePrice: undefined, resaleLink: undefined } : t
    )
  })),

  fetchTicketsFromChain: async (userAddress?: string) => {
    if (!config.contractAddress || config.contractAddress === "0x0000000000000000000000000000000000000000") {
      return;
    }

    set({ isLoading: true });
    try {
      console.log("Fetching tickets directly from on-chain state...");
      const provider = getReadProvider();
      const contract = new ethers.Contract(config.contractAddress, ABI, provider);

      // 1) Get the total number of minted tokens
      const nextTokenId = Number(await contract.nextTokenId());
      console.log("Total tokens minted:", nextTokenId - 1);

      if (nextTokenId <= 1) {
        set({ tickets: [], isLoading: false });
        return;
      }

      const userLower = userAddress?.toLowerCase() || "";

      // 2) For every minted token, read on-chain state directly
      //    This is the reliable way — no event log range issues
      const tokenData: {
        tokenId: string;
        owner: string;
        eventId: string;
        tier: number;
        listing: { seller: string; priceWei: bigint; active: boolean };
      }[] = [];

      await Promise.all(
        Array.from({ length: nextTokenId - 1 }, (_, i) => i + 1).map(async (tid) => {
          const tId = tid.toString();
          try {
            const [owner, eventId, tier, listing] = await Promise.all([
              contract.ownerOf(tId),
              contract.tokenToEvent(tId),
              contract.tokenToTier(tId),
              contract.getResaleListing(tId),
            ]);

            const ownerLower = owner.toLowerCase();
            const isOwned = userLower && ownerLower === userLower;
            const isActiveListing = listing.active;

            // Only include tokens the user owns OR that are actively listed
            if (isOwned || isActiveListing) {
              tokenData.push({
                tokenId: tId,
                owner: ownerLower,
                eventId: eventId.toString(),
                tier: Number(tier),
                listing: {
                  seller: listing.seller,
                  priceWei: listing.priceWei,
                  active: listing.active,
                },
              });
            }
          } catch (e) {
            // Token may have been burned or doesn't exist; skip
          }
        })
      );

      // 3) Fetch event metadata for all relevant tokens (deduplicated)
      const uniqueEvents = [...new Set(tokenData.map((t) => t.eventId))];
      const eventDataCache: Record<string, any> = {};

      await Promise.all(
        uniqueEvents.map(async (eventIdNum) => {
          if (!eventIdNum) return;
          try {
            const evtData = await contract.fetchEventData(eventIdNum);
            const hash = evtData.ipfsHash || evtData[6];
            eventDataCache[eventIdNum] = {
              data: evtData,
              metadata: hash ? await fetchFromIPFS(hash).catch(() => null) : null,
            };
          } catch (e) {}
        })
      );

      // 4) Build the ticket objects
      const loadedTickets: Ticket[] = [];

      tokenData.forEach(({ tokenId, owner, eventId, tier, listing }) => {
        if (!eventDataCache[eventId]) return;

        const { data: evt, metadata } = eventDataCache[eventId];
        const tierIndex = tier;

        let tierName = TIER_MAP[tierIndex] || 'General';
        let basePrice = parseFloat(ethers.formatEther(evt.priceWei || evt[1]));

        if (metadata?.tiers?.[tierIndex]) {
          tierName = metadata.tiers[tierIndex].name;
          if (metadata.tiers[tierIndex].price !== undefined) {
            basePrice = metadata.tiers[tierIndex].price;
          }
        }

        const isActiveListing = listing.active;
        const resalePrice = isActiveListing
          ? parseFloat(ethers.formatEther(listing.priceWei))
          : undefined;

        loadedTickets.push({
          id: `tkt_${tokenId}`,
          tokenId,
          txHash: '',
          eventId: `evt_${eventId}`,
          ownerId: owner,
          tierName,
          tierPrice: basePrice,
          status: isActiveListing ? 'resale' : 'active',
          purchasedAt: new Date().toISOString(),
          resalePrice,
        });
      });

      set({ tickets: loadedTickets.reverse(), isLoading: false });
    } catch (err) {
      console.error('fetchTicketsFromChain failed:', err);
      set({ isLoading: false });
    }
  }
}));


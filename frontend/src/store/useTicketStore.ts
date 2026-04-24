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
      console.log("Bulletproof Sync: Fetching tickets directly from contract state...");
      const provider = getReadProvider();
      const contract = new ethers.Contract(config.contractAddress, ABI, provider);
      
      const loadedTickets: Ticket[] = [];
      const metadataCache: Record<string, any> = {};

      const nextTokenId = await contract.nextTokenId();
      const totalTokens = Number(nextTokenId) - 1;

      for (let i = 1; i <= totalTokens; i++) {
        try {
          const currentOwner = await contract.ownerOf(i);
          const listing = await contract.getResaleListing(i);
          const isActiveListing = listing.active || listing[2];
          
          const isUserOwned = userAddress && currentOwner.toLowerCase() === userAddress.toLowerCase();

          if (isUserOwned || isActiveListing) {
            const eventIdNum = await contract.tokenToEvent(i);
            const tierIndex = await contract.tokenToTier(i);
            const eventKey = eventIdNum.toString();

            if (!metadataCache[eventKey]) {
              const evtData = await contract.fetchEventData(eventIdNum);
              const hash = evtData.ipfsHash || evtData[6];
              metadataCache[eventKey] = {
                data: evtData,
                metadata: hash ? await fetchFromIPFS(hash) : null
              };
            }

            const { data: evt, metadata } = metadataCache[eventKey];
            let tierName = TIER_MAP[Number(tierIndex)] || 'General';
            
            if (metadata?.tiers?.[Number(tierIndex)]) {
              tierName = metadata.tiers[Number(tierIndex)].name;
            }

            const resalePrice = isActiveListing ? parseFloat(ethers.formatEther(listing.priceWei || listing[1])) : undefined;
            const basePrice = parseFloat(ethers.formatEther(evt.priceWei || evt[1]));

            loadedTickets.push({
              id: `tkt_${i}`,
              tokenId: i.toString(),
              txHash: '', 
              eventId: `evt_${eventIdNum}`,
              ownerId: currentOwner,
              tierName: tierName,
              tierPrice: basePrice,
              status: isActiveListing ? 'resale' : 'active',
              purchasedAt: new Date().toISOString(), 
              resalePrice: resalePrice,
            });
          }
        } catch (e) {
          // Token skip
        }
      }

      set({ tickets: loadedTickets.reverse(), isLoading: false });
    } catch (err) {
      console.error('fetchTicketsFromChain failed:', err);
      set({ isLoading: false });
    }
  }
}));


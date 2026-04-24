import { create } from 'zustand';
import { ethers } from 'ethers';
import { config } from '../config';
import { getReadProvider, getBrowserProvider } from '../utils/blockchain';

const ABI = [
  "function ownerOf(uint256 tokenId) public view returns (address)",
  "function tokenToEvent(uint256 tokenId) public view returns (uint)",
  "function tokenToTier(uint256 tokenId) public view returns (uint8)",
  "function fetchEventData(uint eventId) public view returns (tuple(address organiser, uint96 royaltyBps, bool exists, string ipfsHash, uint8 numTiers, uint256 totalRevenue, uint256 totalRoyaltyEarned))",
  "function getTierData(uint256 eventId, uint8 tierId) public view returns (tuple(string name, uint256 price, uint256 maxSupply, uint256 soldCount))",
  "function getResaleListing(uint tokenId) public view returns (tuple(address seller, uint256 priceWei, bool active))",
  "function nextTokenId() public view returns (uint256)",
  "function balanceOf(address owner) public view returns (uint256)",
  "function tokenOfOwnerByIndex(address owner, uint256 index) public view returns (uint256)",
  "function tokenURI(uint256 tokenId) public view returns (string memory)"
];

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
    if (!config.contractAddress || config.contractAddress === "0x0000000000000000000000000000000000000000") return;

    set({ isLoading: true });
    try {
      const provider = getBrowserProvider() || getReadProvider();
      const contract = new ethers.Contract(config.contractAddress, ABI, provider);
      
      console.log(`[TicketStore] Fetching for ${userAddress} at ${config.contractAddress}`);
      
      const tierCache: Record<string, any> = {};

      let tokenIdsToFetch: number[] = [];
      
      if (userAddress) {
        const balanceBN = await contract.balanceOf(userAddress);
        const balance = Number(balanceBN);
        console.log(`[TicketStore] User Balance: ${balance}`);
        
        if (balance > 0) {
          const idPromises = [];
          for (let i = 0; i < balance; i++) {
            idPromises.push(contract.tokenOfOwnerByIndex(userAddress, i));
          }
          const ids = await Promise.all(idPromises);
          tokenIdsToFetch = ids.map(id => Number(id));
          console.log(`[TicketStore] Token IDs to fetch:`, tokenIdsToFetch);
        }
      }

      const ticketSettled = await Promise.allSettled(tokenIdsToFetch.map(async (tokenId): Promise<Ticket> => {
        try {
          // Fetch critical ownership and mapping data first
          const [currentOwner, eventIdBN, tierIdx] = await Promise.all([
            contract.ownerOf(tokenId),
            contract.tokenToEvent(tokenId),
            contract.tokenToTier(tokenId)
          ]);

          // Fetch resale and URI optionally (don't let them crash the load)
          let listing = { active: false, priceWei: 0n };
          try {
            listing = await contract.getResaleListing(tokenId);
          } catch (e) {
            console.warn(`[TicketStore] Failed to fetch resale for #${tokenId}`);
          }

          let uri = "";
          try {
            uri = await contract.tokenURI(tokenId);
            console.log(`[TicketStore] Token #${tokenId} URI: ${uri}`);
          } catch (e) {
            console.warn(`[TicketStore] Token #${tokenId} URI revert (safe to ignore)`);
          }

          const isActiveListing = listing.active || (listing as any)[2];
          const tierKey = `${eventIdBN}_${tierIdx}`;

          if (!tierCache[tierKey]) {
            const tData = await contract.getTierData(eventIdBN, tierIdx);
            tierCache[tierKey] = {
              name: tData.name || (tData as any)[0],
              price: parseFloat(ethers.formatEther(tData.price || (tData as any)[1]))
            };
          }

          const tier = tierCache[tierKey];
          const resalePrice = isActiveListing ? parseFloat(ethers.formatEther(listing.priceWei || (listing as any)[1])) : undefined;

          return {
            id: `tkt_${tokenId}`,
            tokenId: tokenId.toString(),
            txHash: '', 
            eventId: `evt_${eventIdBN}`,
            ownerId: currentOwner,
            tierName: tier.name,
            tierPrice: tier.price,
            status: (isActiveListing ? 'resale' : 'active') as TicketStatus,
            purchasedAt: new Date().toISOString(), 
            resalePrice: resalePrice,
          };
        } catch (innerErr) {
          console.error(`[TicketStore] Critical fetch failed for #${tokenId}:`, innerErr);
          throw innerErr;
        }
      }));

      ticketSettled.forEach((res, idx) => {
        if (res.status === 'rejected') {
          console.error(`[TicketStore] Ticket #${tokenIdsToFetch[idx]} rejected:`, res.reason);
        }
      });

      const validTickets = ticketSettled
        .filter((res): res is PromiseFulfilledResult<Ticket> => res.status === 'fulfilled')
        .map(res => res.value);

      console.log(`[TicketStore] Valid tickets found:`, validTickets.length);
      set({ tickets: validTickets.reverse(), isLoading: false });
    } catch (err) {
      console.error('[TicketStore] fetchTicketsFromChain fatal error:', err);
      set({ isLoading: false });
    }
  },
}));

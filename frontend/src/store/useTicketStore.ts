import { create } from 'zustand';
import { ethers } from 'ethers';
import { config } from '../config';
import { getReadProvider } from '../utils/blockchain';

const ABI = [
  "function ownerOf(uint256 tokenId) public view returns (address)",
  "function tokenToEvent(uint256 tokenId) public view returns (uint)",
  "function fetchEventData(uint eventId) public view returns (tuple(uint32 maxTickets, uint256 priceWei, uint32 ticketsSold, uint8 royaltyBps, bool exists, address organiser))",
  "function getResaleListing(uint tokenId) public view returns (tuple(address seller, uint256 priceWei, bool active))",
  "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)",
  "event TicketListed(uint indexed tokenId, address indexed seller, uint256 priceWei)",
  "event TicketResold(uint indexed tokenId, address indexed oldOwner, address indexed newOwner, uint256 priceWei)"
];

export type TicketStatus = 'active' | 'used' | 'expired' | 'resale';

export interface Ticket {
  id: string;
  tokenId: string;       
  txHash: string;        
  eventId: string;
  ownerId: string;
  tierName: string;
  tierPrice: number;
  status: TicketStatus;
  purchasedAt: string;   
  resaleLink?: string;
  resalePrice?: number;
}

interface TicketState {
  tickets: Ticket[];
  isLoading: boolean;
  buyTicket: (eventId: string, ownerId: string, tierName: string, tierPrice: number) => Ticket;
  listForResale: (ticketId: string, price: number) => void;
  cancelResale: (ticketId: string) => void;
  buyResaleTicket: (ticketId: string, newOwnerId: string, pricePaid?: number) => void;
  fetchTicketsFromChain: (userAddress?: string) => Promise<void>;
}

export const useTicketStore = create<TicketState>((set) => ({
  tickets: [],
  isLoading: false,

  buyTicket: (eventId, ownerId, tierName, tierPrice) => {
    const newTicket: Ticket = {
      id: `tkt_${Date.now()}`,
      tokenId: '', 
      txHash: '',
      eventId,
      ownerId,
      tierName,
      tierPrice,
      status: 'active',
      purchasedAt: new Date().toISOString(),
    };

    set((state) => ({
      tickets: [...state.tickets, newTicket]
    }));

    return newTicket;
  },

  listForResale: (ticketId, price) => set((state) => ({
    tickets: state.tickets.map(t =>
      t.id === ticketId ? { ...t, status: 'resale' as TicketStatus, resalePrice: price, resaleLink: `https://sepolia.etherscan.io/nft/${config.contractAddress}/${t.tokenId}` } : t
    )
  })),

  cancelResale: (ticketId) => set((state) => ({
    tickets: state.tickets.map(t =>
      t.id === ticketId ? { ...t, status: 'active' as TicketStatus, resalePrice: undefined, resaleLink: undefined } : t
    )
  })),

  buyResaleTicket: (ticketId, newOwnerId, pricePaid?: number) => set((state) => ({
    tickets: state.tickets.map(t =>
      t.id === ticketId ? { ...t, ownerId: newOwnerId, status: 'active' as TicketStatus, tierPrice: pricePaid ?? t.resalePrice ?? t.tierPrice, resalePrice: undefined, resaleLink: undefined } : t
    )
  })),

  fetchTicketsFromChain: async (userAddress?: string) => {
    if (!config.contractAddress || config.contractAddress === "0x0000000000000000000000000000000000000000") {
      return;
    }

    set({ isLoading: true });
    try {
      console.log("Discovery: Scanning Transfer logs for address:", userAddress);
      const provider = getReadProvider();
      const contract = new ethers.Contract(config.contractAddress, ABI, provider);
      
      const loadedTickets: Ticket[] = [];

      // 1. Get all tokens RECEIVED by the user
      const receiveFilter = contract.filters.Transfer(null, userAddress);
      const receiveLogs = await contract.queryFilter(receiveFilter, config.deploymentBlock, "latest");
      
      // 2. Get all tokens SENT by the user (to handle resale/transfer)
      const sendFilter = contract.filters.Transfer(userAddress, null);
      const sendLogs = await contract.queryFilter(sendFilter, config.deploymentBlock, "latest");

      // 3. Determine current ownership set
      const ownedTokenIds = new Set<string>();
      receiveLogs.forEach((log: any) => {
        const tokenId = log.args?.[2]?.toString();
        if (tokenId) ownedTokenIds.add(tokenId);
      });

      sendLogs.forEach((log: any) => {
        const tokenId = log.args?.[2]?.toString();
        if (tokenId) ownedTokenIds.delete(tokenId);
      });

      console.log(`Log scan complete. Found ${ownedTokenIds.size} tokens currently owned by user.`);

      // 4. Query TicketResold events where the current user is the buyer
      //    to determine the actual price they paid for each resold token.
      const resoldPriceMap = new Map<string, number>();
      if (userAddress) {
        try {
          const resoldFilter = contract.filters.TicketResold(null, null, userAddress);
          const resoldLogs = await contract.queryFilter(resoldFilter, config.deploymentBlock, "latest");
          // Take the latest resale event per token (in case of multiple resales to same user)
          for (const log of resoldLogs) {
            const tokenId = (log as any).args?.[0]?.toString();
            const pricePaid = (log as any).args?.[3];
            if (tokenId && pricePaid) {
              resoldPriceMap.set(tokenId, parseFloat(ethers.formatEther(pricePaid)));
            }
          }
        } catch (e) {
          console.warn("Could not fetch TicketResold logs:", e);
        }
      }

      // 5. Fetch metadata for each currently owned token
      for (const tokenId of ownedTokenIds) {
        try {
          const currentOwner = await contract.ownerOf(tokenId);
          // Safety check: verify user still owns it (logs might have stale states)
          if (userAddress && currentOwner.toLowerCase() !== userAddress.toLowerCase()) continue;

          const eventId = await contract.tokenToEvent(tokenId);
          const evt = await contract.fetchEventData(eventId);
          const listing = await contract.getResaleListing(tokenId);
          const isResale = listing.active || listing[2];

          // Use the resale purchase price if this token was bought on the secondary market
          const basePrice = parseFloat(ethers.formatEther(evt.priceWei || evt[2]));
          const actualPricePaid = resoldPriceMap.get(tokenId) ?? basePrice;

          loadedTickets.push({
            id: `tkt_${tokenId}`,
            tokenId: tokenId,
            txHash: '', 
            eventId: `evt_${eventId}`,
            ownerId: currentOwner,
            tierName: 'General Access',
            tierPrice: actualPricePaid,
            status: isResale ? 'resale' : 'active',
            purchasedAt: new Date().toISOString(), 
            resalePrice: isResale ? parseFloat(ethers.formatEther(listing.priceWei || listing[1])) : undefined,
          });
        } catch (e) {
          console.error(`Error loading metadata for token ${tokenId}:`, e);
        }
      }

      // 5. Fetch ALL active resale listings globally (for the secondary market)
      const listedFilter = contract.filters.TicketListed();
      const listedLogs = await contract.queryFilter(listedFilter, config.deploymentBlock, "latest");
      
      const listedTokenIds = new Set<string>();
      listedLogs.forEach((log: any) => {
        const tokenId = log.args?.[0]?.toString();
        if (tokenId) listedTokenIds.add(tokenId);
      });

      for (const tokenId of listedTokenIds) {
        // Skip if we already processed it as a user-owned token
        if (ownedTokenIds.has(tokenId)) continue;

        try {
          const listing = await contract.getResaleListing(tokenId);
          const isActive = listing.active || listing[2];
          
          if (isActive) {
            const currentOwner = await contract.ownerOf(tokenId);
            const eventId = await contract.tokenToEvent(tokenId);
            const evt = await contract.fetchEventData(eventId);

            loadedTickets.push({
              id: `tkt_${tokenId}`,
              tokenId: tokenId,
              txHash: '', 
              eventId: `evt_${eventId}`,
              ownerId: currentOwner,
              tierName: 'General Access',
              tierPrice: parseFloat(ethers.formatEther(evt.priceWei || evt[1])),
              status: 'resale',
              purchasedAt: new Date().toISOString(), 
              resalePrice: parseFloat(ethers.formatEther(listing.priceWei || listing[1])),
            });
          }
        } catch (e) {
          console.error(`Error loading resale metadata for token ${tokenId}:`, e);
        }
      }

      set({ tickets: loadedTickets, isLoading: false });
      console.log("Ticket sync complete. Total displayed:", loadedTickets.length);
    } catch (err) {
      console.error('fetchTicketsFromChain failed:', err);
      set({ isLoading: false });
    }
  }
}));

import { create } from 'zustand';
import { ethers } from 'ethers';
import { config } from '../config';
import { getReadProvider } from '../utils/blockchain';

const ABI = [
  "function ownerOf(uint256 tokenId) public view returns (address)",
  "function nextTokenId() public view returns (uint)",
  "function tokenToEvent(uint256 tokenId) public view returns (uint)",
  "function fetchEventData(uint eventId) public view returns (tuple(string name, uint maxTickets, uint priceWei, uint ticketsSold, address organiser, uint96 royaltyBps, bool exists))",
  "function getResaleListing(uint tokenId) public view returns (tuple(address seller, uint priceWei, bool active))",
  "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)"
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

export interface ResaleListing {
  id: string;
  tokenId: string;
  eventId: string;
  seller: string;
  priceEth: number;
  tierName: string;
  eventName: string;
}

interface TicketState {
  tickets: Ticket[];
  resaleListings: ResaleListing[];
  isLoading: boolean;
  isLoadingResale: boolean;
  buyTicket: (eventId: string, ownerId: string, tierName: string, tierPrice: number) => Ticket;
  listForResale: (ticketId: string, price: number) => void;
  cancelResale: (ticketId: string) => void;
  buyResaleTicket: (ticketId: string, newOwnerId: string) => void;
  fetchTicketsFromChain: (userAddress?: string) => Promise<void>;
  fetchAllResaleListings: () => Promise<void>;
}

export const useTicketStore = create<TicketState>((set) => ({
  tickets: [],
  resaleListings: [],
  isLoading: false,
  isLoadingResale: false,

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

  buyResaleTicket: (ticketId, newOwnerId) => set((state) => ({
    tickets: state.tickets.map(t =>
      t.id === ticketId ? { ...t, ownerId: newOwnerId, status: 'active' as TicketStatus, resalePrice: undefined, resaleLink: undefined } : t
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

      // 4. Fetch metadata for each currently owned token
      for (const tokenId of ownedTokenIds) {
        try {
          const currentOwner = await contract.ownerOf(tokenId);
          // Safety check: verify user still owns it (logs might have stale states)
          if (userAddress && currentOwner.toLowerCase() !== userAddress.toLowerCase()) continue;

          const eventId = await contract.tokenToEvent(tokenId);
          const evt = await contract.fetchEventData(eventId);
          const listing = await contract.getResaleListing(tokenId);
          const isResale = listing.active || listing[2];

          loadedTickets.push({
            id: `tkt_${tokenId}`,
            tokenId: tokenId,
            txHash: '', 
            eventId: `evt_${eventId}`,
            ownerId: currentOwner,
            tierName: 'General Access',
            tierPrice: parseFloat(ethers.formatEther(evt.priceWei || evt[2])),
            status: isResale ? 'resale' : 'active',
            purchasedAt: new Date().toISOString(), 
            resalePrice: isResale ? parseFloat(ethers.formatEther(listing.priceWei || listing[1])) : undefined,
          });
        } catch (e) {
          console.error(`Error loading metadata for token ${tokenId}:`, e);
        }
      }

      set({ tickets: loadedTickets, isLoading: false });
      console.log("Ticket sync complete. Total displayed:", loadedTickets.length);
    } catch (err) {
      console.error('fetchTicketsFromChain failed:', err);
      set({ isLoading: false });
    }
  },

  fetchAllResaleListings: async () => {
    if (!config.contractAddress || config.contractAddress === "0x0000000000000000000000000000000000000000") {
      return;
    }

    set({ isLoadingResale: true });
    try {
      const provider = getReadProvider();
      const contract = new ethers.Contract(config.contractAddress, ABI, provider);
      const nextTokenId = await contract.nextTokenId();
      const total = Number(nextTokenId);

      console.log(`Scanning ${total - 1} tokens for resale listings...`);
      const listings: ResaleListing[] = [];

      for (let i = 1; i < total; i++) {
        try {
          const listing = await contract.getResaleListing(i);
          const isActive = listing.active || listing[2];
          if (!isActive) continue;

          const eventId = await contract.tokenToEvent(i);
          const evt = await contract.fetchEventData(eventId);
          const rawName = evt.name || evt[0];
          const nameParts = rawName.split('|||');
          const eventTitle = nameParts[0] || rawName;

          listings.push({
            id: `resale_${i}`,
            tokenId: i.toString(),
            eventId: `evt_${eventId.toString()}`,
            seller: listing.seller || listing[0],
            priceEth: parseFloat(ethers.formatEther(listing.priceWei || listing[1])),
            tierName: 'Resale Ticket',
            eventName: eventTitle,
          });
        } catch (e) {
          // Token may not exist or other error, skip
        }
      }

      set({ resaleListings: listings, isLoadingResale: false });
      console.log(`Resale scan complete. Found ${listings.length} active listings.`);
    } catch (err) {
      console.error('fetchAllResaleListings failed:', err);
      set({ isLoadingResale: false });
    }
  }
}));

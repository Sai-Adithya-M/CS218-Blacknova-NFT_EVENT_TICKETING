import { create } from 'zustand';
import { ethers } from 'ethers';
import { config } from '../config';

const ABI = [
  "function nextTokenId() public view returns (uint)",
  "function ownerOf(uint256 tokenId) public view returns (address)",
  "function tokenToEvent(uint256 tokenId) public view returns (uint)",
  "function fetchEventData(uint eventId) public view returns (tuple(string name, uint maxTickets, uint priceWei, uint ticketsSold, address organiser, uint96 royaltyBps, bool exists))",
  "function getResaleListing(uint tokenId) public view returns (tuple(address seller, uint priceWei, bool active))"
];

export type TicketStatus = 'active' | 'used' | 'expired' | 'resale';

export interface Ticket {
  id: string;
  tokenId: string;       // blockchain-style unique ID
  txHash: string;        // simulated transaction hash
  eventId: string;
  ownerId: string;
  tierName: string;
  tierPrice: number;
  status: TicketStatus;
  purchasedAt: string;   // ISO timestamp
  resaleLink?: string;
  resalePrice?: number;
}

interface TicketState {
  tickets: Ticket[];
  buyTicket: (eventId: string, ownerId: string, tierName: string, tierPrice: number) => Ticket;
  listForResale: (ticketId: string, price: number) => void;
  cancelResale: (ticketId: string) => void;
  buyResaleTicket: (ticketId: string, newOwnerId: string) => void;
  fetchTicketsFromChain: (userAddress?: string) => Promise<void>;
}

function generateHex(length: number): string {
  const chars = '0123456789abcdef';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars[Math.floor(Math.random() * chars.length)];
  }
  return result;
}

export const useTicketStore = create<TicketState>((set) => ({
  tickets: [],
  
  buyTicket: (eventId, ownerId, tierName, tierPrice) => {
    const tokenId = `0x${generateHex(40)}`;
    const txHash = `0x${generateHex(64)}`;
    const newTicket: Ticket = {
      id: `tkt_${Date.now()}`,
      tokenId,
      txHash,
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
      t.id === ticketId ? { ...t, status: 'resale' as TicketStatus, resalePrice: price, resaleLink: `https://sepolia.etherscan.io/tx/${t.txHash}` } : t
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
    if (!config.contractAddress || config.contractAddress === "0x0000000000000000000000000000000000000000") return;

    try {
      let provider;
      if ((window as any).ethereum) {
        provider = new ethers.BrowserProvider((window as any).ethereum);
      } else {
        provider = new ethers.JsonRpcProvider('https://rpc2.sepolia.org');
      }

      const contract = new ethers.Contract(config.contractAddress, ABI, provider);
      const nextTokenId = await contract.nextTokenId();
      const loadedTickets: Ticket[] = [];

      for (let i = 1; i < Number(nextTokenId); i++) {
        try {
          const listing = await contract.getResaleListing(i);
          let owner = '';
          try {
             owner = await contract.ownerOf(i);
          } catch(e) {
             // Token not minted yet
             continue;
          }

          const isOwner = userAddress && owner.toLowerCase() === userAddress.toLowerCase();
          const isResale = listing.active || listing[2]; // object key or tuple index

          // We load tickets if the user owns them OR if they are listed for resale (for marketplace)
          if (isOwner || isResale) {
            const eventId = await contract.tokenToEvent(i);
            const evt = await contract.fetchEventData(eventId);

            loadedTickets.push({
              id: `tkt_${i}`,
              tokenId: i.toString(),
              txHash: '0x...', // Mocked as we don't store tx hash on chain currently
              eventId: `evt_${eventId}`,
              ownerId: owner, // Map owner directly
              tierName: 'General Access',
              tierPrice: parseFloat(ethers.formatEther(evt.priceWei || evt[2])),
              status: isResale ? 'resale' : 'active',
              purchasedAt: new Date().toISOString(), // Mocked metadata
              resalePrice: isResale ? parseFloat(ethers.formatEther(listing.priceWei || listing[1])) : undefined,
            });
          }
        } catch (e) {
          // Token may not exist, skip
        }
      }

      set({ tickets: loadedTickets });
    } catch (err) {
      console.error('fetchTicketsFromChain error:', err);
    }
  }
}));

import { create } from 'zustand';
import { ethers } from 'ethers';
import { config } from '../config';
import { getReadProvider } from '../utils/blockchain';

const ABI = [
  "function ownerOf(uint256 tokenId) public view returns (address)",
  "function tokenToEvent(uint256 tokenId) public view returns (uint)",
  "function tokenToTier(uint256 tokenId) public view returns (uint8)",
  "function fetchEventData(uint eventId) public view returns (tuple(address organiser, uint96 royaltyBps, bool exists, string ipfsHash, uint8 numTiers, uint256 totalRevenue, uint256 totalRoyaltyEarned))",
  "function getTierData(uint256 eventId, uint8 tierId) public view returns (tuple(string name, uint256 price, uint256 maxSupply, uint256 soldCount))",
  "function resaleListings(uint256 tokenId) public view returns (address seller, uint256 priceWei, bool active)",
  "function nextTokenId() public view returns (uint256)",
  "function balanceOf(address owner) public view returns (uint256)",
  "function tokenOfOwnerByIndex(address owner, uint256 index) public view returns (uint256)",
  "function tokenURI(uint256 tokenId) public view returns (string memory)",
  "event TicketListed(uint256 indexed tokenId, address indexed seller, uint256 priceWei)",
  "event TicketResold(uint256 indexed tokenId, address indexed oldOwner, address indexed newOwner, uint256 priceWei, uint256 royaltyAmount)",
  "event ListingCancelled(uint256 indexed tokenId)"
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
      const provider = getReadProvider();
      const contract = new ethers.Contract(config.contractAddress, ABI, provider);
      
      console.log(`[TicketStore] Fetching from: ${config.contractAddress} for user: ${userAddress}`);
      
      const tierCache: Record<string, any> = {};
      let tokenIdsToFetch = new Set<number>();

      // 1. Fetch current user's tokens
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
          ids.forEach(id => tokenIdsToFetch.add(Number(id)));
        }
      }

      // 2. Discover ALL resale tickets (Global Market)
      // For small contracts, we scan ALL tokens. For larger ones, we use logs.
      try {
        const nextIdBN = await contract.nextTokenId();
        const totalMinted = Number(nextIdBN) - 1;
        console.log(`[TicketStore] Total minted on contract: ${totalMinted}`);

        // Scaning ALL tokens if contract is small (< 500 tokens)
        if (totalMinted < 500) {
          for (let i = 1; i <= totalMinted; i++) {
            tokenIdsToFetch.add(i);
          }
          console.log(`[TicketStore] Added all ${totalMinted} tokens to fetch list (Small Contract Mode).`);
        } else {
          // Large contract mode: Use logs
          const filter = contract.filters.TicketListed();
          const startBlock = config.deploymentBlock || 0;
          const logs = await contract.queryFilter(filter, startBlock, 'latest');
          logs.forEach((log: any) => {
            if (log.args && log.args.tokenId) tokenIdsToFetch.add(Number(log.args.tokenId));
          });
          console.log(`[TicketStore] Discovered ${logs.length} potential listings via logs.`);
        }
      } catch (logErr) {
        console.warn("[TicketStore] Discovery failed, trying emergency scan:", logErr);
        try {
          const nextIdBN = await contract.nextTokenId();
          const totalMinted = Number(nextIdBN) - 1;
          for (let i = 1; i <= Math.min(totalMinted, 100); i++) tokenIdsToFetch.add(i);
        } catch(e) {}
      }

      const tokenIdsArray = Array.from(tokenIdsToFetch);
      const ticketSettled = await Promise.allSettled(tokenIdsArray.map(async (tokenId): Promise<Ticket> => {
        try {
          // Fetch critical ownership and mapping data
          const [currentOwner, eventIdBN, tierIdx] = await Promise.all([
            contract.ownerOf(tokenId),
            contract.tokenToEvent(tokenId),
            contract.tokenToTier(tokenId)
          ]);

          // Fetch resale listing status
          let listing = { seller: ethers.ZeroAddress, priceWei: 0n, active: false };
          try {
            const l = await contract.resaleListings(tokenId);
            // Support both array-like and object-like returns
            listing = { 
              seller: l.seller || l[0], 
              priceWei: l.priceWei || l[1], 
              active: l.active !== undefined ? l.active : l[2] 
            };
          } catch (e) {
            console.warn(`[TicketStore] Failed to fetch resale for #${tokenId}`);
          }

          // Important: Only include in global list if it's the user's token OR it's an active resale
          const isUserToken = userAddress && currentOwner.toLowerCase() === userAddress.toLowerCase();
          if (!isUserToken && !listing.active) {
             throw new Error("Not an active resale listing");
          }

          const isActiveListing = listing.active === true;
          const tierKey = `${eventIdBN.toString()}_${tierIdx.toString()}`;

          if (!tierCache[tierKey]) {
            const tData = await contract.getTierData(eventIdBN, tierIdx);
            tierCache[tierKey] = {
              name: tData.name || (tData as any)[0],
              price: parseFloat(ethers.formatEther(tData.price || (tData as any)[1]))
            };
          }

          const tier = tierCache[tierKey];
          const resalePrice = isActiveListing ? parseFloat(ethers.formatEther(listing.priceWei)) : undefined;

          return {
            id: `tkt_${tokenId.toString()}`,
            tokenId: tokenId.toString(),
            txHash: '', 
            eventId: `evt_${eventIdBN.toString()}`,
            ownerId: currentOwner.toLowerCase(),
            tierName: tier.name,
            tierPrice: tier.price,
            status: (isActiveListing ? 'resale' : 'active') as TicketStatus,
            purchasedAt: new Date().toISOString(), 
            resalePrice: resalePrice,
          };
        } catch (innerErr) {
          // Silent filter for non-active non-user tokens
          throw innerErr;
        }
      }));

      const validTickets = ticketSettled
        .filter((res): res is PromiseFulfilledResult<Ticket> => res.status === 'fulfilled')
        .map(res => res.value);

      console.log(`[TicketStore] Final Tickets (${validTickets.length}):`);
      console.table(validTickets.map(t => ({ 
        ID: t.tokenId, 
        Event: t.eventId, 
        Owner: t.ownerId.slice(0, 6), 
        Status: t.status, 
        Price: t.resalePrice 
      })));
      
      set({ tickets: validTickets.reverse(), isLoading: false });
    } catch (err) {
      console.error('[TicketStore] fetchTicketsFromChain fatal error:', err);
      set({ isLoading: false });
    }
  },
}));

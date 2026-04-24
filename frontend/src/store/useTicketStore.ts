import { create } from 'zustand';
import { ethers } from 'ethers';
import { config } from '../config';
import { getReadProvider } from '../utils/blockchain';
import { fetchFromIPFS } from '../utils/ipfs';

const ABI = [
  "function ownerOf(uint256 tokenId) public view returns (address)",
  "function tokenToEvent(uint256 tokenId) public view returns (uint256)",
  "function tokenToTier(uint256 tokenId) public view returns (uint8)",
  // Struct layout (single slot): address organiser, uint40 priceWei, uint24 maxTickets, uint24 ticketsSold, uint8 royaltyBps
  "function fetchEventData(uint256 eventId) public view returns (tuple(address organiser, uint40 priceWei, uint24 maxTickets, uint24 ticketsSold, uint8 royaltyBps))",
  "function getResaleListing(uint256 tokenId) public view returns (tuple(address seller, uint48 priceWei, bool active))",
  "function nextTokenId() public view returns (uint256)",
  "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)",
  "event TicketMinted(uint256 indexed tokenId, uint256 indexed eventId, address indexed buyer, uint8 tier)",
  "event TicketListed(uint256 indexed tokenId, address indexed seller, uint48 priceWei)",
  "event TicketResold(uint256 indexed tokenId, address indexed oldOwner, address indexed newOwner, uint48 priceWei)",
  "event ListingCancelled(uint256 indexed tokenId)",
  "event EventCreated(uint256 indexed eventId, address indexed organiser, string ipfsHash)"
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
      
      const fromBlock = config.deploymentBlock || 5700000;
      
      const [
        transferLogs,
        mintedLogs,
        listedLogs,
        resoldLogs,
        cancelledLogs,
        createdLogs   // for ipfsHash lookup
      ] = await Promise.all([
        contract.queryFilter(contract.filters.Transfer(), fromBlock).catch(() => contract.queryFilter(contract.filters.Transfer(), -10000).catch(() => [])),
        contract.queryFilter(contract.filters.TicketMinted(), fromBlock).catch(() => contract.queryFilter(contract.filters.TicketMinted(), -10000).catch(() => [])),
        contract.queryFilter(contract.filters.TicketListed(), fromBlock).catch(() => contract.queryFilter(contract.filters.TicketListed(), -10000).catch(() => [])),
        contract.queryFilter(contract.filters.TicketResold(), fromBlock).catch(() => contract.queryFilter(contract.filters.TicketResold(), -10000).catch(() => [])),
        contract.queryFilter(contract.filters.ListingCancelled(), fromBlock).catch(() => contract.queryFilter(contract.filters.ListingCancelled(), -10000).catch(() => [])),
        contract.queryFilter(contract.filters.EventCreated(), fromBlock).catch(() => contract.queryFilter(contract.filters.EventCreated(), -10000).catch(() => []))
      ]);

      const owners: Record<string, string> = {};
      const tokenEvents: Record<string, string> = {};
      const tokenTiers: Record<string, number> = {};
      const listings: Record<string, { priceWei: bigint, active: boolean }> = {};

      transferLogs.forEach((log: any) => {
        if (log.args) owners[log.args.tokenId.toString()] = log.args.to.toLowerCase();
      });

      mintedLogs.forEach((log: any) => {
        if (log.args) {
          const tId = log.args.tokenId.toString();
          tokenEvents[tId] = log.args.eventId.toString();
          tokenTiers[tId] = Number(log.args.tier);
        }
      });

      listedLogs.forEach((log: any) => {
        if (log.args) {
          listings[log.args.tokenId.toString()] = { priceWei: log.args.priceWei, active: true };
        }
      });

      resoldLogs.forEach((log: any) => {
        if (log.args) {
          const tId = log.args.tokenId.toString();
          if (listings[tId]) listings[tId].active = false;
        }
      });

      cancelledLogs.forEach((log: any) => {
        if (log.args) {
          const tId = log.args.tokenId.toString();
          if (listings[tId]) listings[tId].active = false;
        }
      });

      // ipfsHash lives only in EventCreated logs, not in the struct
      const ipfsHashByEvent: Record<string, string> = {};
      (createdLogs as any[]).forEach((log: any) => {
        if (log.args?.ipfsHash) {
          ipfsHashByEvent[log.args.eventId.toString()] = log.args.ipfsHash;
        }
      });

      const relevantTokens: string[] = [];
      const userLower = userAddress?.toLowerCase() || "";
      
      Object.keys(owners).forEach(tId => {
        const isOwned = userLower && owners[tId] === userLower;
        const isActiveListing = listings[tId]?.active;
        if (isOwned || isActiveListing) {
          relevantTokens.push(tId);
        }
      });

      const uniqueEvents = [...new Set(relevantTokens.map(tId => tokenEvents[tId]))];
      const eventDataCache: Record<string, any> = {};

      await Promise.all(uniqueEvents.map(async (eventIdNum) => {
        if (!eventIdNum) return;
        try {
          const evtData = await contract.fetchEventData(eventIdNum);
          const hash = ipfsHashByEvent[eventIdNum]; // from EventCreated log
          eventDataCache[eventIdNum] = {
            data: evtData,
            metadata: hash ? await fetchFromIPFS(hash).catch(() => null) : null
          };
        } catch (e) {}
      }));

      const loadedTickets: Ticket[] = [];

      relevantTokens.forEach(tId => {
        const eventIdNum = tokenEvents[tId];
        if (!eventIdNum || !eventDataCache[eventIdNum]) return;
        
        const { data: evt, metadata } = eventDataCache[eventIdNum];
        const tierIndex = tokenTiers[tId] || 0;
        
        let tierName = TIER_MAP[tierIndex] || 'General';
        // priceWei stored as gwei in the contract (uint40); convert to ETH for UI
        let basePrice = parseFloat(ethers.formatUnits(evt.priceWei || evt[1], "gwei"));

        if (metadata?.tiers?.[tierIndex]) {
          tierName = metadata.tiers[tierIndex].name;
          if (metadata.tiers[tierIndex].price !== undefined) {
            basePrice = metadata.tiers[tierIndex].price;
          }
        }

        const isActiveListing = listings[tId]?.active;
        const resalePriceWei = listings[tId]?.priceWei;
        // TicketListed emits priceWei in gwei (uint48); convert to ETH for UI
        const resalePrice = (isActiveListing && resalePriceWei) ? parseFloat(ethers.formatUnits(resalePriceWei, "gwei")) : undefined;

        loadedTickets.push({
          id: `tkt_${tId}`,
          tokenId: tId,
          txHash: '', 
          eventId: `evt_${eventIdNum}`,
          ownerId: owners[tId],
          tierName: tierName,
          tierPrice: basePrice,
          status: isActiveListing ? 'resale' : 'active',
          purchasedAt: new Date().toISOString(), 
          resalePrice: resalePrice,
        });
      });

      set({ tickets: loadedTickets.reverse(), isLoading: false });
    } catch (err) {
      console.error('fetchTicketsFromChain failed:', err);
      set({ isLoading: false });
    }
  }
}));


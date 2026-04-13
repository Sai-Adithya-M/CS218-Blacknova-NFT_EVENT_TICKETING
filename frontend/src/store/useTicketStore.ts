import { create } from 'zustand';

export type TicketStatus = 'active' | 'used' | 'expired' | 'resale';

export interface Ticket {
  id: string;
  eventId: string;
  ownerId: string;
  status: TicketStatus;
  resaleLink?: string;
  resalePrice?: number;
}

interface TicketState {
  tickets: Ticket[];
  buyTicket: (eventId: string, ownerId: string) => void;
  listForResale: (ticketId: string, price: number) => void;
  cancelResale: (ticketId: string) => void;
  buyResaleTicket: (ticketId: string, newOwnerId: string) => void;
}

// Initial demo data
const DEMO_TICKETS: Ticket[] = [
  { id: 't1', eventId: 'e2', ownerId: 'demo_buyer', status: 'active' },
  { id: 't2', eventId: 'e3', ownerId: 'demo_buyer', status: 'expired' },
  { id: 't3', eventId: 'e1', ownerId: 'other_user', status: 'resale', resalePrice: 150.00, resaleLink: 'nova.io/resale/t3' }
];

export const useTicketStore = create<TicketState>((set) => ({
  tickets: DEMO_TICKETS,
  
  buyTicket: (eventId, ownerId) => set((state) => ({
    tickets: [...state.tickets, { id: `t${Date.now()}`, eventId, ownerId, status: 'active' }]
  })),

  listForResale: (ticketId, price) => set((state) => ({
    tickets: state.tickets.map(t => 
      t.id === ticketId ? { ...t, status: 'resale', resalePrice: price, resaleLink: `nova.io/resale/${t.id}` } : t
    )
  })),

  cancelResale: (ticketId) => set((state) => ({
    tickets: state.tickets.map(t => 
      t.id === ticketId ? { ...t, status: 'active', resalePrice: undefined, resaleLink: undefined } : t
    )
  })),
  
  buyResaleTicket: (ticketId, newOwnerId) => set((state) => ({
    tickets: state.tickets.map(t => 
      t.id === ticketId ? { ...t, ownerId: newOwnerId, status: 'active', resalePrice: undefined, resaleLink: undefined } : t
    )
  }))
}));

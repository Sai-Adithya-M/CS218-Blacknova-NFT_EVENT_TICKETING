import { create } from 'zustand';

export interface Event {
  id: string;
  title: string;
  description: string;
  date: string;
  price: number;
  totalTickets: number;
  location: string;
  organizerId: string;
  status: 'active' | 'past';
  imageUrl?: string;
}

interface EventState {
  events: Event[];
  createEvent: (event: Omit<Event, 'id' | 'status'>) => void;
}

// Initial demo data
const DEMO_EVENTS: Event[] = [
  {
    id: 'e1',
    title: 'Neon Nights Festival',
    description: 'A 3-day electronic music festival featuring top DJs.',
    date: '2026-08-15T20:00:00Z',
    price: 120.00,
    totalTickets: 500,
    location: 'Cyber Arena, Neo Tokyo',
    organizerId: 'org1',
    status: 'active'
  },
  {
    id: 'e2',
    title: 'Tech Conference 2026',
    description: 'The biggest future tech conference of the year.',
    date: '2026-05-10T09:00:00Z',
    price: 450.00,
    totalTickets: 200,
    location: 'Silicon Valley Center',
    organizerId: 'org1',
    status: 'active'
  },
  {
    id: 'e3',
    title: 'Past Summer Jam',
    description: 'A relaxing outdoor acoustic concert.',
    date: '2023-07-20T18:00:00Z',
    price: 45.00,
    totalTickets: 100,
    location: 'Central Park',
    organizerId: 'org2',
    status: 'past'
  }
];

export const useEventStore = create<EventState>((set) => ({
  events: DEMO_EVENTS,
  
  createEvent: (eventData) => set((state) => ({
    events: [
      ...state.events, 
      { 
        ...eventData, 
        id: `e${Date.now()}`, 
        status: 'active' 
      }
    ]
  }))
}));

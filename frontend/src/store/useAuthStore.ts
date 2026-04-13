import { create } from 'zustand';

export interface User {
  id: string;
  name: string;
  email: string;
  avatarUrl?: string;
  walletBalance: number;
}

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  login: (userData: Omit<User, 'walletBalance'>) => void;
  logout: () => void;
  updateWallet: (amount: number) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null, 
  isAuthenticated: false,
  
  login: (userData) => set({ 
    user: { ...userData, walletBalance: 150.00 }, // Demo balance
    isAuthenticated: true 
  }),
  
  logout: () => set({ user: null, isAuthenticated: false }),
  
  updateWallet: (amount) => set((state) => ({
    user: state.user ? { ...state.user, walletBalance: state.user.walletBalance + amount } : null
  }))
}));

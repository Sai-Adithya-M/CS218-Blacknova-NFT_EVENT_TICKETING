import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export interface User {
  id: string;
  name: string;
  email: string;
  avatarUrl?: string;
  walletAddress?: string;
  walletBalance: number;
  role: 'buyer' | 'organizer';
}

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  walletAddress: string | null;
  login: (userData: Omit<User, 'walletBalance'>) => void;
  loginWithWallet: (address: string, balance: number) => void;
  logout: () => void;
  updateWallet: (amount: number) => void;
  setBalance: (balance: number) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null, 
      isAuthenticated: false,
      walletAddress: null,
      
      login: (userData) => set({ 
        user: { ...userData, walletBalance: 150.00 },
        isAuthenticated: true,
        walletAddress: userData.walletAddress || null
      }),

      loginWithWallet: (address, balance) => set({
        user: {
          id: address,
          name: `${address.slice(0, 6)}...${address.slice(-4)}`,
          email: '',
          walletAddress: address,
          walletBalance: balance,
          role: 'organizer', // wallet users get organizer access
        },
        isAuthenticated: true,
        walletAddress: address,
      }),
      
      logout: () => set({ user: null, isAuthenticated: false, walletAddress: null }),
      
      updateWallet: (amount) => set((state) => ({
        user: state.user ? { ...state.user, walletBalance: state.user.walletBalance + amount } : null
      })),

      setBalance: (balance) => set((state) => ({
        user: state.user ? { ...state.user, walletBalance: balance } : null
      }))
    }),
    {
      name: 'auth-storage',
      storage: createJSONStorage(() => sessionStorage),
    }
  )
);

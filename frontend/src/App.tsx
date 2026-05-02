import React from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { AppLayout } from './layouts/AppLayout';
import { Navbar } from './components/layout/Navbar';
import { BackgroundAtmosphere } from './components/ui/BackgroundAtmosphere';
import { Home } from './pages/Home';
import { Login } from './pages/Login';
import { BrowseEvents } from './pages/BrowseEvents';
import { ManageEvents } from './pages/ManageEvents';
import { MyTickets } from './pages/MyTickets';
import { Wallet } from './pages/Wallet';
import { Dashboard } from './pages/Dashboard';
import { Scanner } from './pages/Scanner';
import { useEventStore } from './store/useEventStore';
import { useTicketStore } from './store/useTicketStore';
import { useAuthStore } from './store/useAuthStore';
import './App.css';

interface PageTransitionProps {
  children: React.ReactNode;
}

const PageTransition = ({ children }: PageTransitionProps) => (
  <motion.div
    initial={{ opacity: 0, y: 10 }}
    animate={{ opacity: 1, y: 0 }}
    exit={{ opacity: 0, y: -10 }}
    transition={{ duration: 0.3, ease: [0.23, 1, 0.32, 1] }}
  >
    {children}
  </motion.div>
);

/** Public pages get the global Navbar (transparent, fixed) + atoms */
const PublicLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="min-h-screen bg-[#000] text-[#F5F5F0] selection:bg-[var(--accent-purple)]/30 selection:text-white">
    <BackgroundAtmosphere />
    <Navbar />
    <main className="relative z-10">{children}</main>
  </div>
);

function AppContent() {
  const location = useLocation();
  const { user } = useAuthStore();
  const fetchEvents = useEventStore(state => state.fetchEventsFromChain);
  const fetchTickets = useTicketStore(state => state.fetchTicketsFromChain);

  React.useEffect(() => {
    // Initial fetch from blockchain
    fetchEvents();
    fetchTickets(user?.walletAddress);

    if ((window as any).ethereum) {
      (window as any).ethereum.on('chainChanged', () => {
        window.location.reload();
      });
      (window as any).ethereum.on('accountsChanged', (accounts: string[]) => {
        if (accounts.length === 0) {
          useAuthStore.getState().logout();
        } else if (
          useAuthStore.getState().user?.walletAddress &&
          accounts[0].toLowerCase() !== useAuthStore.getState().user?.walletAddress?.toLowerCase()
        ) {
          useAuthStore.getState().logout();
        }
        window.location.reload();
      });
    }
  }, [user?.walletAddress, fetchEvents, fetchTickets]);

  return (
    <AnimatePresence mode="wait">
      <div key={location.pathname}>
        <Routes location={location}>
          {/* Public routes — Navbar always visible */}
          <Route path="/" element={<PublicLayout><PageTransition><Home /></PageTransition></PublicLayout>} />
          <Route path="/login" element={<PageTransition><Login /></PageTransition>} />

          {/* App routes — AppLayout provides Navbar */}
          <Route path="/dashboard" element={<AppLayout><PageTransition><Dashboard /></PageTransition></AppLayout>} />
          <Route path="/events" element={<AppLayout><PageTransition><BrowseEvents /></PageTransition></AppLayout>} />
          <Route path="/tickets" element={<AppLayout><PageTransition><MyTickets /></PageTransition></AppLayout>} />
          <Route path="/wallet" element={<AppLayout><PageTransition><Wallet /></PageTransition></AppLayout>} />
          <Route path="/manage/*" element={<AppLayout><PageTransition><ManageEvents /></PageTransition></AppLayout>} />
          <Route path="/scan/:eventId" element={<AppLayout><PageTransition><Scanner /></PageTransition></AppLayout>} />
          
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
    </AnimatePresence>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AppContent />
    </BrowserRouter>
  );
}

export default App;
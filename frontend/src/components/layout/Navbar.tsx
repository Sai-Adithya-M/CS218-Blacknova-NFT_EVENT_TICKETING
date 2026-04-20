import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { Menu, X, Wallet, Sparkles, ChevronDown, LogOut, LayoutDashboard, User, Plus, Calendar } from 'lucide-react';
import { useAuthStore } from '../../store/useAuthStore';
import { LoginModal } from '../ui/LoginModal';
import { motion, AnimatePresence } from 'framer-motion';
import { ethers } from 'ethers';

export const Navbar: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [isLoginOpen, setIsLoginOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  
  const { isAuthenticated, user, logout, setBalance } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();

  // Sync Balance from Blockchain
  useEffect(() => {
    if (isAuthenticated && (window as any).ethereum) {
      const syncBalance = async () => {
        try {
          const provider = new ethers.BrowserProvider((window as any).ethereum);
          const accounts = await provider.listAccounts();
          if (accounts.length > 0) {
            const balanceBigInt = await provider.getBalance(accounts[0].address);
            const balanceEth = parseFloat(ethers.formatEther(balanceBigInt));
            setBalance(balanceEth);
          }
        } catch (err) {
          console.error("Failed to sync balance:", err);
        }
      };
      
      syncBalance();
      // Polling for balance updates every 15 seconds
      const interval = setInterval(syncBalance, 15000);
      return () => clearInterval(interval);
    }
  }, [isAuthenticated, setBalance]);

  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 20);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const navLinks = [
    { name: 'Marketplace', path: '/events', icon: <Sparkles size={13}/> },
    { name: 'My Tickets', path: '/tickets', icon: <Calendar size={13}/> },
    { name: 'Create Event', path: '/manage', icon: <Plus size={13}/> },
  ];

  const handleLogout = () => {
    logout();
    setIsProfileOpen(false);
    navigate('/');
  };

  return (
    <nav 
      className={`fixed top-0 left-0 right-0 z-[100] transition-all duration-500 ${
        isScrolled 
          ? 'bg-black/85 backdrop-blur-2xl border-b border-white/10 py-3' 
          : 'bg-transparent border-b border-transparent py-4'
      }`}
    >
      <div className="px-8 flex justify-between items-center gap-8">
        {/* Logo */}
        <Link to="/" className="flex items-center gap-2.5 group shrink-0">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[var(--accent-purple)] to-[var(--accent-teal)] flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
            <Sparkles className="text-white" size={17} />
          </div>
          <span className="text-lg font-black tracking-tight uppercase italic">
            NIF<span className="text-[var(--accent-teal)]">TING</span>
          </span>
        </Link>

        {/* Desktop Nav Links — center */}
        <div className="hidden lg:flex items-center gap-1 flex-1 justify-center">
          {navLinks.map((link) => {
            const isActive = location.pathname === link.path || location.pathname.startsWith(link.path + '/');
            return (
              <Link 
                key={link.name} 
                to={link.path}
                className={`flex items-center gap-1.5 px-4 py-2 text-[11px] font-bold uppercase tracking-widest rounded-lg transition-all ${
                  isActive
                    ? 'text-white bg-white/10 border border-white/10' 
                    : 'text-white/60 hover:text-white hover:bg-white/5'
                }`}
              >
                <span className={isActive ? 'text-[var(--accent-teal)]' : 'text-white/40'}>{link.icon}</span>
                {link.name}
              </Link>
            );
          })}
        </div>

        {/* Desktop Actions — right */}
        <div className="hidden lg:flex items-center gap-3 shrink-0">
          {isAuthenticated && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[var(--accent-teal)]/10 border border-[var(--accent-teal)]/20 shadow-[0_0_15px_rgba(var(--accent-teal),0.1)]">
              <div className="w-1.5 h-1.5 rounded-full bg-[var(--accent-teal)] animate-pulse" />
              <span className="text-[10px] font-black tracking-widest text-[var(--accent-teal)]">
                {user?.walletBalance?.toFixed(4)} ETH
              </span>
            </div>
          )}
          
          {!isAuthenticated ? (
            <>
              <button
                onClick={() => setIsLoginOpen(true)}
                className="px-4 py-2 rounded-lg text-[11px] font-bold uppercase tracking-widest text-white/70 hover:text-white hover:bg-white/5 transition-all"
              >
                Login / Sign Up
              </button>
              <motion.button 
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                className="px-5 py-2 rounded-xl bg-gradient-to-r from-[var(--accent-purple)] to-[var(--accent-teal)] text-white text-[11px] font-black uppercase tracking-widest flex items-center gap-2 shadow-lg shadow-[var(--accent-purple)]/20"
                onClick={() => setIsLoginOpen(true)}
              >
                <Wallet size={14} />
                Connect MetaMask
              </motion.button>
            </>
          ) : (
            <div className="relative">
              <button 
                onClick={() => setIsProfileOpen(!isProfileOpen)}
                className="flex items-center gap-2.5 px-3 py-1.5 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition-all font-sans"
              >
                <div className="w-7 h-7 rounded-lg bg-gradient-to-r from-[var(--accent-purple)] to-[var(--accent-teal)] flex items-center justify-center text-xs font-black">
                  {user?.name?.[0]?.toUpperCase() || 'U'}
                </div>
                <div className="text-left hidden xl:block">
                  <p className="text-[11px] font-black text-white leading-none">{user?.name}</p>
                  <p className="text-[8px] font-bold text-[var(--accent-teal)] leading-none mt-0.5 tracking-widest uppercase">
                    {user?.walletAddress ? `${user.walletAddress.slice(0, 6)}...${user.walletAddress.slice(-4)}` : user?.role?.toUpperCase()}
                  </p>
                </div>
                <ChevronDown size={13} className={`text-white/40 transition-transform ${isProfileOpen ? 'rotate-180' : ''}`} />
              </button>

              <AnimatePresence>
                {isProfileOpen && (
                  <motion.div 
                    initial={{ opacity: 0, y: 8, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 8, scale: 0.95 }}
                    transition={{ duration: 0.15 }}
                    className="absolute top-full right-0 mt-3 w-52 rounded-2xl border border-white/10 bg-black/95 backdrop-blur-2xl p-2 shadow-2xl"
                  >
                    <Link 
                      to="/dashboard" 
                      onClick={() => setIsProfileOpen(false)}
                      className="flex items-center gap-3 px-4 py-2.5 rounded-xl hover:bg-white/5 transition-all text-[10px] font-black uppercase tracking-widest text-white/60 hover:text-white"
                    >
                      <LayoutDashboard size={13} />
                      Dashboard
                    </Link>
                    <Link 
                      to="/wallet" 
                      onClick={() => setIsProfileOpen(false)}
                      className="flex items-center gap-3 px-4 py-2.5 rounded-xl hover:bg-white/5 transition-all text-[10px] font-black uppercase tracking-widest text-white/60 hover:text-white"
                    >
                      <Wallet size={13} />
                      Wallet
                    </Link>
                    <div className="h-px bg-white/5 my-1" />
                    <button 
                      onClick={handleLogout}
                      className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl hover:bg-red-500/10 transition-all text-[10px] font-black uppercase tracking-widest text-red-400"
                    >
                      <LogOut size={13} />
                      Sign Out
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}
        </div>

        {/* Mobile Toggle */}
        <button className="lg:hidden text-white w-9 h-9 flex items-center justify-center rounded-xl bg-white/5 border border-white/10" onClick={() => setIsOpen(!isOpen)}>
          {isOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>

      {/* Mobile Menu */}
      <AnimatePresence>
        {isOpen && (
          <motion.div 
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="lg:hidden border-t border-white/10 bg-black/95 backdrop-blur-2xl overflow-hidden"
          >
            <div className="p-5 flex flex-col gap-1.5">
              {navLinks.map((link) => (
                <Link 
                  key={link.name} 
                  to={link.path}
                  className="flex items-center gap-3 px-4 py-3 rounded-xl text-[11px] font-black uppercase tracking-widest text-white/60 hover:bg-white/5 hover:text-white transition-all"
                  onClick={() => setIsOpen(false)}
                >
                  <span className="text-[var(--accent-teal)]">{link.icon}</span>
                  {link.name}
                </Link>
              ))}
              <div className="h-px bg-white/5 my-2" />
              {!isAuthenticated ? (
                <div className="flex flex-col gap-3 pt-1">
                  <button 
                    className="w-full py-3 rounded-xl border border-white/10 text-white text-[11px] font-black uppercase tracking-widest flex items-center justify-center gap-2"
                    onClick={() => { setIsOpen(false); setIsLoginOpen(true); }}
                  >
                    <User size={14} /> Login / Sign Up
                  </button>
                  <button 
                    className="w-full py-3 rounded-xl bg-gradient-to-r from-[var(--accent-purple)] to-[var(--accent-teal)] text-white text-[11px] font-black uppercase tracking-widest flex items-center justify-center gap-2"
                    onClick={() => { setIsOpen(false); setIsLoginOpen(true); }}
                  >
                    <Wallet size={14} /> Connect MetaMask
                  </button>
                </div>
              ) : (
                <button 
                  onClick={() => { setIsOpen(false); handleLogout(); }}
                  className="w-full py-3 px-4 rounded-xl border border-red-500/20 text-red-400 text-[11px] font-black uppercase tracking-widest flex items-center justify-center gap-2"
                >
                  <LogOut size={14} /> Sign Out
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <LoginModal isOpen={isLoginOpen} onClose={() => setIsLoginOpen(false)} />
    </nav>
  );
};

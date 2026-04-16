import React, { useState } from 'react';
import { X, Mail, Apple, Wallet, AlertCircle, Loader2, CheckCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuthStore } from '../../store/useAuthStore';
import { useNavigate } from 'react-router-dom';
import { ethers } from 'ethers';

interface LoginModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type Step = 'choose' | 'connecting' | 'success' | 'error';

declare global {
  interface Window {
    ethereum?: {
      request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
      isMetaMask?: boolean;
      on?: (event: string, cb: (...args: unknown[]) => void) => void;
    };
  }
}

export const LoginModal: React.FC<LoginModalProps> = ({ isOpen, onClose }) => {
  const [step, setStep] = useState<Step>('choose');
  const [loginMethod, setLoginMethod] = useState<'metamask' | 'google' | 'apple'>('metamask');
  const [errorMsg, setErrorMsg] = useState('');
  const [connectedAddress, setConnectedAddress] = useState('');
  const { loginWithWallet, login } = useAuthStore();
  const navigate = useNavigate();

  if (!isOpen) return null;

  const handleClose = () => {
    setStep('choose');
    setErrorMsg('');
    onClose();
  };

  // ─── MetaMask Connection ───────────────────────────────────────────────────
  const connectMetaMask = async () => {
    setLoginMethod('metamask');
    if (!window.ethereum || !window.ethereum.isMetaMask) {
      setErrorMsg('MetaMask is not installed. Please install the MetaMask browser extension and refresh the page.');
      setStep('error');
      return;
    }

    setStep('connecting');
    try {
      const accounts = await window.ethereum.request({
        method: 'eth_requestAccounts',
      }) as string[];

      if (!accounts || accounts.length === 0) {
        throw new Error('No accounts returned from MetaMask.');
      }

      const address = accounts[0];
      const provider = new ethers.BrowserProvider(window.ethereum as any);
      const balanceWei = await provider.getBalance(address);
      const balanceEth = parseFloat(ethers.formatEther(balanceWei));

      setConnectedAddress(address);
      loginWithWallet(address, balanceEth);
      setStep('success');

      // Close and redirect after brief success screen
      setTimeout(() => {
        handleClose();
        navigate('/dashboard');
      }, 1500);

    } catch (err: unknown) {
      const error = err as { code?: number; message?: string };
      if (error?.code === 4001) {
        setErrorMsg('You rejected the connection request. Please try again and click "Connect" in MetaMask.');
      } else if (error?.code === -32002) {
        setErrorMsg('MetaMask is already processing a request. Please open MetaMask and confirm the pending request.');
      } else {
        setErrorMsg(error?.message || 'Failed to connect. Please make sure MetaMask is unlocked and try again.');
      }
      setStep('error');
    }
  };

  // ─── Social Login Simulation ───────────────────────────────────────────────
  const handleSocialLogin = (method: 'google' | 'apple') => {
    setLoginMethod(method);
    setStep('connecting');

    setTimeout(() => {
      setStep('success');
      const name = method === 'google' ? 'Google User' : 'Apple User';
      login({
        id: `user_${Date.now()}`,
        name,
        email: `${name.toLowerCase().replace(' ', '.')}@example.com`,
        role: 'buyer',
      });

      setTimeout(() => {
        handleClose();
        navigate('/dashboard');
      }, 1500);
    }, 2000); // 2 second mock verification delay
  };

  const truncate = (addr: string) => `${addr.slice(0, 6)}...${addr.slice(-4)}`;

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={handleClose}
          />

          {/* Modal card */}
          <motion.div
            initial={{ opacity: 0, scale: 0.92, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: 20 }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            className="relative w-full max-w-md rounded-3xl border border-white/10 bg-[#0a0a0f]/95 backdrop-blur-2xl p-8 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close */}
            <button
              onClick={handleClose}
              className="absolute top-5 right-5 w-8 h-8 rounded-xl flex items-center justify-center text-white/40 hover:text-white hover:bg-white/5 transition-all"
            >
              <X size={18} />
            </button>

            {/* ── CHOOSE ── */}
            {step === 'choose' && (
              <>
                <div className="text-center mb-8">
                  <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[var(--accent-purple)] to-[var(--accent-teal)] flex items-center justify-center mx-auto mb-4">
                    <Wallet size={26} className="text-white" />
                  </div>
                  <h2 className="text-2xl font-black uppercase tracking-tight italic mb-2">Connect to Nifting</h2>
                  <p className="text-white/50 text-sm font-medium">Choose how you want to sign in</p>
                </div>

                <div className="space-y-3">
                  {/* MetaMask */}
                  <button
                    onClick={connectMetaMask}
                    className="w-full flex items-center gap-4 py-4 px-5 rounded-2xl bg-[#F6851B]/10 border border-[#F6851B]/30 hover:bg-[#F6851B]/20 hover:border-[#F6851B]/60 text-white font-bold transition-all group"
                  >
                    <div className="w-10 h-10 rounded-xl bg-[#F6851B] flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
                      <Wallet size={20} className="text-white" />
                    </div>
                    <div className="text-left">
                      <p className="font-black text-sm">Connect MetaMask</p>
                      <p className="text-[11px] text-white/50 font-medium">Recommended · Web3 Native</p>
                    </div>
                    <span className="ml-auto text-[10px] font-black uppercase tracking-widest px-2 py-1 rounded-lg bg-[var(--accent-teal)]/10 text-[var(--accent-teal)] border border-[var(--accent-teal)]/20">
                      LIVE
                    </span>
                  </button>

                  <div className="relative py-3">
                    <div className="absolute inset-0 flex items-center">
                      <div className="w-full border-t border-white/8" />
                    </div>
                    <div className="relative flex justify-center">
                      <span className="px-3 text-[11px] uppercase tracking-widest font-bold text-white/30 bg-[#0a0a0f]">or continue with</span>
                    </div>
                  </div>

                  {/* Google */}
                  <button
                    onClick={() => handleSocialLogin('google')}
                    className="w-full flex items-center gap-4 py-4 px-5 rounded-2xl border border-white/10 bg-white/[0.03] hover:bg-white/[0.06] text-white font-semibold transition-all"
                  >
                    <div className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center shrink-0">
                      <Mail size={18} className="text-red-400" />
                    </div>
                    <div className="text-left">
                      <p className="font-black text-sm">Continue with Google</p>
                      <p className="text-[11px] text-white/50 font-medium">Sign in with your Google account</p>
                    </div>
                  </button>

                  {/* Apple */}
                  <button
                    onClick={() => handleSocialLogin('apple')}
                    className="w-full flex items-center gap-4 py-4 px-5 rounded-2xl border border-white/10 bg-white/[0.03] hover:bg-white/[0.06] text-white font-semibold transition-all"
                  >
                    <div className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center shrink-0">
                      <Apple size={18} className="text-white" />
                    </div>
                    <div className="text-left">
                      <p className="font-black text-sm">Continue with Apple ID</p>
                      <p className="text-[11px] text-white/50 font-medium">Sign in with your Apple account</p>
                    </div>
                  </button>
                </div>

                <p className="text-center text-[11px] text-white/30 mt-6">
                  By connecting, you agree to our Terms of Service & Privacy Policy
                </p>
              </>
            )}

            {/* ── CONNECTING ── */}
            {step === 'connecting' && (
              <div className="text-center py-8">
                <div className="w-16 h-16 rounded-2xl bg-[#F6851B]/10 border border-[#F6851B]/30 flex items-center justify-center mx-auto mb-6">
                  <Loader2 size={32} className="text-[#F6851B] animate-spin" />
                </div>
                <h3 className="text-xl font-black uppercase tracking-tight italic mb-3">
                  {loginMethod === 'metamask' 
                    ? 'Connecting MetaMask…' 
                    : `Verifying with ${loginMethod === 'google' ? 'Google' : 'Apple'}...`}
                </h3>
                <p className="text-white/50 text-sm font-medium">
                  {loginMethod === 'metamask' 
                    ? 'Please confirm the connection request in your MetaMask wallet.' 
                    : 'Authenticating your account securely.'}
                </p>
                <div className="mt-6 flex items-center justify-center gap-2 text-[11px] font-bold uppercase tracking-widest text-white/30">
                  <span className="w-2 h-2 rounded-full bg-[#F6851B] animate-pulse" />
                  Waiting for confirmation
                </div>
              </div>
            )}

            {/* ── SUCCESS ── */}
            {step === 'success' && (
              <div className="text-center py-8">
                <div className="w-16 h-16 rounded-2xl bg-[var(--accent-teal)]/10 border border-[var(--accent-teal)]/30 flex items-center justify-center mx-auto mb-6">
                  <CheckCircle size={32} className="text-[var(--accent-teal)]" />
                </div>
                <h3 className="text-xl font-black uppercase tracking-tight italic mb-3">
                  {loginMethod === 'metamask' ? 'Wallet Connected!' : 'Login Successful!'}
                </h3>
                {loginMethod === 'metamask' && connectedAddress && (
                  <div className="mx-auto px-4 py-2 rounded-xl bg-white/5 border border-white/10 inline-block mb-3">
                    <p className="text-sm font-mono font-bold text-white/80">{truncate(connectedAddress)}</p>
                  </div>
                )}
                <p className="text-white/50 text-sm font-medium">Redirecting to your dashboard…</p>
              </div>
            )}

            {/* ── ERROR ── */}
            {step === 'error' && (
              <div className="text-center py-4">
                <div className="w-16 h-16 rounded-2xl bg-red-500/10 border border-red-500/30 flex items-center justify-center mx-auto mb-6">
                  <AlertCircle size={32} className="text-red-400" />
                </div>
                <h3 className="text-xl font-black uppercase tracking-tight italic mb-3">Connection Failed</h3>
                <p className="text-white/60 text-sm font-medium mb-6 leading-relaxed">{errorMsg}</p>
                
                {!window.ethereum?.isMetaMask && (
                  <a 
                    href="https://metamask.io/download/" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="block w-full py-3 rounded-xl bg-[#F6851B] text-white font-black uppercase tracking-widest text-xs mb-3 hover:bg-[#e27613] transition-colors"
                  >
                    Install MetaMask →
                  </a>
                )}

                <button
                  onClick={() => setStep('choose')}
                  className="w-full py-3 rounded-xl border border-white/10 text-white/60 font-black uppercase tracking-widest text-xs hover:bg-white/5 transition-all"
                >
                  Try Again
                </button>
              </div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

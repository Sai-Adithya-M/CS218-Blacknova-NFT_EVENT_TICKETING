import React from 'react';
import { X, Mail, Github, Chrome, ShieldCheck, Zap } from 'lucide-react';

interface LoginModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const LoginModal: React.FC<LoginModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 animate-in fade-in duration-300">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/80 backdrop-blur-xl"
        onClick={onClose}
      />

      {/* Modal Container */}
      <div className="relative w-full max-w-lg glass-panel rounded-[3rem] border border-white/10 shadow-[0_0_100px_-20px_rgba(140,59,254,0.3)] overflow-hidden animate-in zoom-in-95 slide-in-from-bottom-8 duration-500">
        {/* Glow Effects */}
        <div className="absolute -top-24 -left-24 w-64 h-64 bg-[var(--accent-purple)]/20 rounded-full blur-[80px]" />
        <div className="absolute -bottom-24 -right-24 w-64 h-64 bg-[var(--accent-teal)]/20 rounded-full blur-[80px]" />

        {/* Close Button */}
        <button 
          onClick={onClose}
          className="absolute top-8 right-8 w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-[var(--text-secondary)] hover:text-white hover:bg-white/10 transition-all z-10"
        >
          <X size={20} />
        </button>

        <div className="relative p-12 space-y-10">
          {/* Header */}
          <div className="text-center space-y-4">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-[var(--accent-purple)] to-[var(--accent-teal)] shadow-lg shadow-[var(--accent-purple)]/20 mb-2">
              <Zap className="text-white" size={32} />
            </div>
            <h2 className="text-3xl font-black tracking-tight text-white leading-tight">
              Access the <br />Future of Ticketing
            </h2>
            <p className="text-[var(--text-secondary)] font-medium max-w-[280px] mx-auto">
              Securely connect your digital identity to start collecting.
            </p>
          </div>

          {/* Login Options */}
          <div className="space-y-4">
            <button className="w-full group relative flex items-center gap-4 p-5 rounded-2xl bg-white/5 border border-white/10 hover:border-[var(--accent-purple)]/50 hover:bg-white/[0.08] transition-all duration-300">
              <div className="w-10 h-10 rounded-xl bg-[var(--accent-purple)]/10 flex items-center justify-center group-hover:scale-110 transition-transform">
                <ShieldCheck size={20} className="text-[var(--accent-purple)]" />
              </div>
              <div className="text-left">
                <p className="text-sm font-black text-white">MetaMask</p>
                <p className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-widest">Connect Wallet</p>
              </div>
            </button>

            <div className="grid grid-cols-2 gap-4">
              <button className="group flex items-center gap-3 p-5 rounded-2xl bg-white/5 border border-white/10 hover:bg-white/[0.08] transition-all">
                <Chrome size={20} className="text-[var(--text-secondary)] group-hover:text-white" />
                <span className="text-sm font-bold">Google</span>
              </button>
              <button className="group flex items-center gap-3 p-5 rounded-2xl bg-white/5 border border-white/10 hover:bg-white/[0.08] transition-all">
                <Github size={20} className="text-[var(--text-secondary)] group-hover:text-white" />
                <span className="text-sm font-bold">GitHub</span>
              </button>
            </div>
          </div>

          {/* Footer */}
          <div className="pt-6 border-t border-white/5 text-center">
            <p className="text-xs text-[var(--text-secondary)] font-medium">
              Don't have an account? {' '}
              <button className="text-[var(--accent-teal)] font-bold hover:underline">Get Started</button>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

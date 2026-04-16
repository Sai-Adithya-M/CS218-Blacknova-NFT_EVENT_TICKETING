import React, { useState } from 'react';
import { Wallet, ShieldAlert, ArrowRight } from 'lucide-react';
import { motion } from 'framer-motion';
import { LoginModal } from './LoginModal';

interface AuthFallbackProps {
  title?: string;
  description?: string;
  actionText?: string;
}

export const AuthFallback: React.FC<AuthFallbackProps> = ({
  title = "Unlock Exclusive Access",
  description = "Connect your Web3 wallet to manage your tickets, view your dashboard, and access restricted event features.",
  actionText = "Connect Wallet"
}) => {
  const [isLoginOpen, setIsLoginOpen] = useState(false);

  return (
    <>
      <div className="flex flex-col items-center justify-center min-h-[60vh] px-6 text-center relative">
        <motion.div 
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="glass-panel p-12 rounded-[3rem] border border-white/10 max-w-xl relative overflow-hidden"
        >
          <div className="absolute top-0 right-0 w-32 h-32 bg-[var(--accent-purple)]/10 rounded-full blur-3xl" />
          
          <div className="w-20 h-20 rounded-3xl bg-white/5 border border-white/10 flex items-center justify-center mx-auto mb-8 shadow-inner">
            <Wallet size={36} className="text-[var(--accent-purple)]" />
          </div>

          <h2 className="text-3xl font-black uppercase italic tracking-tighter mb-4">{title}</h2>
          <p className="text-[var(--text-secondary)] font-medium leading-relaxed mb-10">
            {description}
          </p>

          <div className="space-y-4">
            <motion.button 
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => setIsLoginOpen(true)}
              className="w-full py-5 rounded-2xl bg-white text-black text-xs font-black uppercase tracking-[0.2em] shadow-2xl flex items-center justify-center gap-3 italic"
            >
              {actionText}
              <ArrowRight size={16} />
            </motion.button>
            
            <div className="flex items-center justify-center gap-2 text-[10px] font-black uppercase tracking-widest text-[var(--text-secondary)] italic">
              <ShieldAlert size={12} className="text-[var(--accent-teal)]" />
              On-Chain Verification Required
            </div>
          </div>
        </motion.div>

        {/* Background Decorative Rings */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] border border-white/5 rounded-full -z-10 animate-pulse" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[700px] border border-white/5 rounded-full -z-10 animate-pulse delay-500" />
      </div>

      <LoginModal isOpen={isLoginOpen} onClose={() => setIsLoginOpen(false)} />
    </>
  );
};

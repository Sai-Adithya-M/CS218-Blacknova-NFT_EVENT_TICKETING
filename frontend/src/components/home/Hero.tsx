import React from 'react';
import { ArrowRight } from 'lucide-react';
import { motion } from 'framer-motion';

export const Hero: React.FC = () => {
  return (
    <section className="relative min-h-screen flex items-center pt-20 overflow-hidden px-6">
      {/* Dynamic Background */}
      <div className="absolute inset-0 z-0">
        <div className="absolute top-1/4 -left-20 w-[500px] h-[500px] bg-[var(--accent-purple)]/10 rounded-full blur-[120px] animate-pulse" />
        <div className="absolute bottom-1/4 -right-20 w-[600px] h-[600px] bg-[var(--accent-teal)]/5 rounded-full blur-[150px] animate-pulse delay-1000" />
      </div>

      <div className="relative z-10 max-w-7xl mx-auto w-full grid lg:grid-cols-2 gap-16 items-center">
        {/* Left Column: Content */}
        <motion.div 
          initial={{ opacity: 0, x: -30 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.8 }}
          className="text-left"
        >
          <div className="inline-flex items-center gap-3 px-4 py-2 rounded-full bg-white/5 border border-white/10 mb-8 backdrop-blur-md">
            <div className="w-2 h-2 rounded-full bg-[var(--accent-teal)] animate-ping" />
            <span className="text-[10px] font-black tracking-[0.2em] uppercase text-[var(--text-secondary)]">The Future of Event Ticketing</span>
          </div>

          <h1 className="text-6xl lg:text-8xl font-black tracking-tight mb-8 leading-[0.9] italic">
            OWN YOUR <br />
            <span className="text-white drop-shadow-2xl">EVENT</span> <br />
            <span className="text-gradient-purple">EXPERIENCE.</span>
          </h1>

          <p className="text-xl text-[var(--text-secondary)] mb-12 max-w-xl font-medium leading-relaxed">
            Eliminate fraud and scalping with NFT-backed tickets. Experience secure, transparent, and tradable access to the world's most exclusive events.
          </p>

          <div className="flex flex-col sm:flex-row items-center gap-6">
            <motion.button 
              whileHover={{ scale: 1.05, boxShadow: "0 0 30px rgba(139, 92, 246, 0.3)" }}
              whileTap={{ scale: 0.95 }}
              className="w-full sm:w-auto px-10 py-5 rounded-2xl bg-[var(--accent-purple)] text-white text-xs font-black uppercase tracking-widest flex items-center justify-center gap-3 shadow-xl transition-all italic"
            >
              Explore Events
              <ArrowRight size={18} />
            </motion.button>
            <motion.button 
              whileHover={{ scale: 1.05, background: "rgba(255,255,255,0.05)" }}
              whileTap={{ scale: 0.95 }}
              className="w-full sm:w-auto px-10 py-5 rounded-2xl border border-white/10 text-white text-xs font-black uppercase tracking-widest transition-all italic"
            >
              Create Event
            </motion.button>
          </div>

          {/* Trust Indicators */}
          <div className="mt-16 pt-8 border-t border-white/5 flex items-center gap-8 opacity-50">
            <div className="flex flex-col">
              <span className="text-2xl font-black text-white">50k+</span>
              <span className="text-[10px] uppercase font-bold tracking-widest">Active Users</span>
            </div>
            <div className="w-px h-10 bg-white/10" />
            <div className="flex flex-col">
              <span className="text-2xl font-black text-white">200+</span>
              <span className="text-[10px] uppercase font-bold tracking-widest">Global Events</span>
            </div>
          </div>
        </motion.div>

        {/* Right Column: Floating Visuals */}
        <motion.div 
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 1, delay: 0.2 }}
          className="relative hidden lg:block h-[600px]"
        >
          {/* Main Floating Card */}
          <motion.div 
            animate={{ 
              y: [0, -20, 0],
              rotate: [2, 0, 2]
            }}
            transition={{ 
              duration: 6, 
              repeat: Infinity, 
              ease: "easeInOut" 
            }}
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-20 w-[400px]"
          >
            <div className="glass-panel p-4 rounded-[2.5rem] border border-white/20 shadow-2xl backdrop-blur-3xl rotate-[-2deg]">
              <div className="relative aspect-[4/5] rounded-[2rem] overflow-hidden mb-6">
                <img 
                  src="https://images.unsplash.com/photo-1514525253344-af646d77bdcc?auto=format&fit=crop&q=80" 
                  alt="Neon Music Festival"
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent" />
                <div className="absolute top-4 left-4 px-3 py-1 rounded-full bg-white/10 backdrop-blur-md border border-white/20 text-[10px] font-black uppercase tracking-widest">
                  Rare Tier
                </div>
              </div>
              <div className="px-4 pb-4">
                <div className="flex justify-between items-end">
                  <div>
                    <h3 className="text-xl font-black uppercase tracking-tight italic">Cyber City Rave</h3>
                    <p className="text-[10px] text-[var(--accent-teal)] font-black uppercase tracking-[0.2em] mt-1">Dec 24, 2026</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] text-[var(--text-secondary)] font-bold uppercase mb-1">Price</p>
                    <p className="text-lg font-black text-white italic">0.45 ETH</p>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>

          {/* Secondary Floating Elements */}
          <motion.div 
            animate={{ y: [0, 30, 0] }}
            transition={{ duration: 8, repeat: Infinity, ease: "easeInOut", delay: 1 }}
            className="absolute top-20 right-10 z-10 w-48 h-48 rounded-3xl glass-panel border border-white/10 backdrop-blur-xl translate-x-12 -translate-y-12 rotate-12 opacity-60"
          />
          <motion.div 
            animate={{ y: [0, -40, 0] }}
            transition={{ duration: 7, repeat: Infinity, ease: "easeInOut", delay: 0.5 }}
            className="absolute bottom-20 left-10 z-10 w-40 h-40 rounded-full bg-[var(--accent-purple)]/20 blur-[60px]"
          />
          
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] border border-dashed border-white/5 rounded-full animate-[spin_60s_linear_infinite]" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[650px] h-[650px] border border-dashed border-white/5 rounded-full animate-[spin_100s_linear_infinite_reverse]" />
        </motion.div>
      </div>

      {/* Scroll Indicator */}
      <motion.div 
        animate={{ y: [0, 10, 0] }}
        transition={{ duration: 2, repeat: Infinity }}
        className="absolute bottom-10 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 opacity-30"
      >
        <span className="text-[8px] font-black uppercase tracking-[0.5em] text-[var(--text-secondary)]">Scroll to Explore</span>
        <div className="w-px h-12 bg-gradient-to-b from-white to-transparent" />
      </motion.div>
    </section>
  );
};



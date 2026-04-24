import React, { useState } from 'react';
import { useEventStore } from '../store/useEventStore';
import {
  ArrowRight, Ticket, ShieldCheck, Zap, Globe, Coins, Lock,
  Twitter, Github, Instagram, ArrowUpRight, Sparkles, Wallet,
  Calendar, MapPin, CheckCircle, Play
} from 'lucide-react';
import { motion, useMotionValue, useSpring, useTransform } from 'framer-motion';
import { Link, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/useAuthStore';
import { LoginModal } from '../components/ui/LoginModal';
import { useIPFSImage } from '../hooks/useIPFSImage';

const CATEGORIES = [
  { name: 'Music', color: 'from-purple-500/20 to-purple-900/10' },
  { name: 'Sports', color: 'from-teal-500/20 to-teal-900/10' },
  { name: 'Art', color: 'from-pink-500/20 to-pink-900/10' },
  { name: 'Tech', color: 'from-blue-500/20 to-blue-900/10' },
];

const PLATFORM_HIGHLIGHTS = [
  { label: 'Token Standard', value: 'ERC-721', icon: <Sparkles size={18} /> },
  { label: 'Network', value: 'Sepolia', icon: <Globe size={18} /> },
  { label: 'Anti-Scalping', value: 'Built-in', icon: <ShieldCheck size={18} /> },
  { label: 'Verification', value: 'Instant', icon: <Zap size={18} /> },
];

const HOW_IT_WORKS = [
  {
    step: '01',
    icon: <Wallet size={28} />,
    title: 'Connect Your Wallet',
    desc: 'Link MetaMask or any Web3 wallet to unlock the full NFT ticketing experience.',
    color: 'text-[var(--accent-purple)]'
  },
  {
    step: '02',
    icon: <Ticket size={28} />,
    title: 'Buy NFT Ticket',
    desc: 'Purchase tickets minted as ERC-721 NFTs — immutable, tradeable, and verifiable.',
    color: 'text-[var(--accent-teal)]'
  },
  {
    step: '03',
    icon: <ShieldCheck size={28} />,
    title: 'Scan & Enter',
    desc: 'Show your NFT at the gate. One scan verifies authenticity instantly.',
    color: 'text-purple-300'
  },
];

const CAPABILITIES = [
  { icon: <Lock size={20} />, title: 'Smart Contract Royalties', desc: 'Organizers earn automatic royalties on every secondary market resale, enforced on-chain.' },
  { icon: <Coins size={20} />, title: 'Multi-Tier Pricing', desc: 'Create General, VIP, and Backstage tiers with independent pricing and supply limits.' },
  { icon: <ShieldCheck size={20} />, title: 'On-Chain Provenance', desc: 'Every ticket has a traceable history — from mint to transfer — verifiable on Etherscan.' },
  { icon: <Wallet size={20} />, title: 'MetaMask Integration', desc: 'One-click wallet connection. No accounts, no passwords — just your Web3 identity.' },
  { icon: <Zap size={20} />, title: 'Instant Verification', desc: 'QR scan at the gate verifies NFT ownership in real-time. No counterfeits, ever.' },
  { icon: <Globe size={20} />, title: 'Sepolia Testnet', desc: 'Deploy and test on Ethereum\'s Sepolia testnet before going live on mainnet.' },
];

interface HomeEventCardProps {
  event: any;
  i: number;
  navigate: (path: string) => void;
}

const HomeEventCard: React.FC<HomeEventCardProps> = ({ event, i, navigate }) => {
  const { src: currentImageSrc, loading } = useIPFSImage(event.imageUrl);
  const date = new Date(event.date);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ delay: i * 0.07 }}
      whileHover={{ y: -4 }}
      onClick={() => navigate('/events')}
      className="rounded-2xl border border-white/8 bg-white/[0.02] overflow-hidden group cursor-pointer hover:border-white/20 hover:shadow-lg hover:shadow-[var(--accent-purple)]/10 transition-all"
    >
      <div className="h-44 bg-gradient-to-br from-[var(--accent-purple)]/20 to-[var(--accent-teal)]/10 relative overflow-hidden">
        <img 
          src={currentImageSrc} 
          alt={event.title} 
          className={`w-full h-full object-cover transition-all duration-500 ${loading ? 'opacity-40 blur-sm scale-110' : 'opacity-80 group-hover:opacity-100 group-hover:scale-105'}`}
        />
        <div className="absolute top-3 right-3 px-2 py-1 rounded-lg bg-black/60 backdrop-blur-md text-[9px] font-black uppercase tracking-widest text-[var(--accent-teal)] border border-white/10">
          NFT
        </div>
      </div>
      <div className="p-5">
        <h3 className="font-black tracking-tight italic mb-2">{event.title}</h3>
        <div className="flex items-center gap-1.5 text-[11px] text-white/40 font-bold mb-4">
          <Calendar size={11} />{date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
          <span className="mx-1">·</span>
          <MapPin size={11} />{event.location}
        </div>
        <div className="flex items-center justify-between border-t border-white/5 pt-4">
          <div>
            <p className="text-[9px] uppercase tracking-widest font-bold text-white/30">From</p>
            <p className="text-lg font-black text-transparent bg-clip-text bg-gradient-to-r from-[var(--accent-purple)] to-[var(--accent-teal)]">{event.tiers?.length ? Math.min(...event.tiers.map((t: any) => t.price)) : 0} ETH</p>
          </div>
          <span className="px-4 py-2 rounded-xl bg-white/5 text-[10px] font-black uppercase tracking-widest text-white/60 group-hover:text-white group-hover:bg-white/10 transition-all">
            Get Ticket →
          </span>
        </div>
      </div>
    </motion.div>
  );
};

export const Home: React.FC = () => {
  const { events } = useEventStore();
  const navigate = useNavigate();
  const { isAuthenticated } = useAuthStore();
  const [isLoginOpen, setIsLoginOpen] = useState(false);
  const activeEvents = events.filter(e => e.status === 'active' && new Date(e.date) > new Date()).slice(0, 6);

  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);

  const springConfig = { damping: 25, stiffness: 150 };
  const smoothX = useSpring(mouseX, springConfig);
  const smoothY = useSpring(mouseY, springConfig);

  const rotateX = useTransform(smoothY, [-1, 1], [25, -25]);
  const rotateY = useTransform(smoothX, [-1, 1], [-25, 25]);
  const translateX = useTransform(smoothX, [-1, 1], [-50, 50]);
  const translateY = useTransform(smoothY, [-1, 1], [-50, 50]);

  const handleMouseMove = (e: React.MouseEvent) => {
    const { clientX, clientY } = e;
    const { innerWidth, innerHeight } = window;
    mouseX.set((clientX / innerWidth) * 2 - 1);
    mouseY.set((clientY / innerHeight) * 2 - 1);
  };

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: { opacity: 1, transition: { staggerChildren: 0.1 } }
  };
  const itemVariants = {
    hidden: { opacity: 0, y: 24 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.5 } }
  };

  return (
    <div className="overflow-hidden">
      {/* ─── HERO ─── */}
      <section
        className="relative min-h-screen flex items-center pt-24 pb-12 px-6 overflow-hidden" style={{ perspective: 1200 }}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => { mouseX.set(0); mouseY.set(0); }}
      >
        {/* Ambient glow — enhanced depth */}
        <div className="absolute inset-0 z-0 pointer-events-none">
          {/* Primary purple glow — top-left */}
          <div className="absolute -top-20 -left-40 w-[800px] h-[800px] bg-[var(--accent-purple)]/[0.07] rounded-full blur-[160px]" />
          {/* Secondary teal glow — bottom-right */}
          <div className="absolute -bottom-20 -right-20 w-[600px] h-[600px] bg-[var(--accent-teal)]/[0.05] rounded-full blur-[140px]" />
          {/* Subtle teal — top-right corner */}
          <div className="absolute -top-10 right-0 w-[400px] h-[400px] bg-teal-500/[0.03] rounded-full blur-[120px]" />
          {/* Grid overlay */}
          <div
            className="absolute inset-0 opacity-[0.03]"
            style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,0.5) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,0.5) 1px,transparent 1px)', backgroundSize: '60px 60px' }}
          />
        </div>

        <div className="relative z-10 px-12 w-full">
          <div className="grid lg:grid-cols-[1fr_1fr] gap-12 items-center">
            {/* LEFT */}
            <motion.div
              initial={{ opacity: 0, x: -40 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.8 }}
            >
              {/* Badge */}
              <div className="inline-flex items-center gap-2.5 px-4 py-2 rounded-full border border-white/10 bg-white/5 mb-8 backdrop-blur-md">
                <span className="w-2 h-2 rounded-full bg-[var(--accent-teal)] animate-ping inline-block" />
                <span className="text-[10px] font-black tracking-[0.25em] uppercase text-white/60">NEXTING — Web3 Ticketing</span>
              </div>

              {/* Headline */}
              <h1 className="text-[clamp(3rem,7vw,5.5rem)] font-black leading-[0.95] tracking-tight mb-8">
                On-Chain Tickets<br />
                <span
                  className="inline-block py-2 italic font-black"
                  style={{
                    color: '#8c3bfe'
                  }}
                >
                  for Real-World Events.
                </span>
              </h1>

              <p className="text-lg text-white/55 mb-10 max-w-[520px] font-medium leading-relaxed">
                Mint, trade, and verify event tickets as NFTs. No fraud. No scalping. Full ownership on-chain.
              </p>

              <div className="flex flex-wrap items-center gap-4 mb-14">
                <motion.button
                  whileHover={{ scale: 1.04 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={() => navigate('/events')}
                  className="px-8 py-4 rounded-2xl bg-white text-black text-xs font-black uppercase tracking-widest flex items-center gap-3 shadow-2xl hover:shadow-white/20 transition-all"
                >
                  Explore Events <ArrowRight size={17} />
                </motion.button>

                <motion.button
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={() => isAuthenticated ? navigate('/manage') : setIsLoginOpen(true)}
                  className="px-8 py-4 rounded-2xl border border-white/15 text-white text-xs font-black uppercase tracking-widest hover:bg-white/5 transition-all flex items-center gap-3"
                >
                  <Play size={15} className="fill-white" /> Create Your Event
                </motion.button>
              </div>

              {/* Platform highlights */}
              <div className="flex items-center gap-8 border-t border-white/5 pt-8">
                {PLATFORM_HIGHLIGHTS.map((s) => (
                  <div key={s.label}>
                    <p className="text-2xl font-black text-white">{s.value}</p>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-white/40">{s.label}</p>
                  </div>
                ))}
              </div>
            </motion.div>

            {/* RIGHT  — floating NFT ticket card */}
            <motion.div
              initial={{ opacity: 0, scale: 0.85 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.9, delay: 0.15, ease: [0.23, 1, 0.32, 1] }}
              className="hidden lg:flex items-center justify-center relative"
              style={{ rotateX, rotateY, x: translateX, y: translateY, transformStyle: "preserve-3d" }}
            >
              <motion.div 
                animate={{ 
                  y: [0, -20, 0],
                  rotateZ: [0, 2, -1, 0]
                }}
                transition={{ 
                  duration: 6, 
                  repeat: Infinity, 
                  ease: "easeInOut" 
                }}
                className="relative z-10 w-full max-w-lg"
              >
                <img 
                  src="/hero-bg.png" 
                  alt="Abstract 3D Shape" 
                  className="w-[120%] max-w-none h-auto object-contain opacity-95 mx-auto mix-blend-lighten relative -left-[10%]"
                  style={{
                    WebkitMaskImage: 'radial-gradient(circle at center, black 40%, transparent 70%)',
                    maskImage: 'radial-gradient(circle at center, black 40%, transparent 70%)'
                  }}
                />
              </motion.div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* ─── SOCIAL PROOF TICKER ─── */}
      <div className="border-y border-white/5 bg-white/[0.02] py-4 overflow-hidden">
        <motion.div
          animate={{ x: [0, -1200] }}
          transition={{ duration: 20, repeat: Infinity, ease: 'linear' }}
          className="flex items-center gap-16 whitespace-nowrap"
        >
          {Array.from({ length: 3 }).map((_, i) => (
            <React.Fragment key={i}>
              {['SECURE ON-CHAIN', 'TRUE OWNERSHIP', 'NO SCALPERS', 'DECENTRALIZED TICKETING'].map(e => (
                <span key={e} className="flex items-center gap-3 text-[10px] font-black uppercase tracking-[0.3em] text-white/30">
                  <span className="text-[var(--accent-purple)] text-xs">✦</span> {e}
                </span>
              ))}
            </React.Fragment>
          ))}
        </motion.div>
      </div>

      {/* ─── HOW IT WORKS ─── */}
      <section className="px-12 py-28">
        <motion.div
          initial="hidden" whileInView="visible" variants={containerVariants} viewport={{ once: true }}
        >
          <div className="text-center mb-20">
            <p className="text-[10px] font-black tracking-[0.4em] uppercase text-[var(--accent-teal)] mb-4 italic">The Process</p>
            <h2 className="text-5xl font-black uppercase tracking-tighter italic text-white">How It Works</h2>
            <p className="text-white/50 mt-4 max-w-md mx-auto text-sm font-medium">From wallet connect to event entry — three seamless on-chain steps.</p>
          </div>

          <div className="grid md:grid-cols-3 gap-8 relative">
            {/* connector line */}
            <div className="hidden md:block absolute top-12 left-1/4 right-1/4 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />

            {HOW_IT_WORKS.map((item) => (
              <motion.div
                key={item.step}
                variants={itemVariants}
                className="relative p-8 rounded-3xl border border-white/8 bg-white/[0.02] hover:bg-white/[0.04] hover:border-white/15 transition-all group"
              >
                <div className="absolute -top-5 left-8 text-[10px] font-black tracking-[0.3em] text-white/20 uppercase">{item.step}</div>
                <div className={`w-14 h-14 rounded-2xl bg-white/5 flex items-center justify-center mb-6 ${item.color} group-hover:scale-105 transition-transform`}>
                  {item.icon}
                </div>
                <h3 className="text-lg font-black uppercase tracking-tight italic mb-3">{item.title}</h3>
                <p className="text-white/50 text-sm font-medium leading-relaxed">{item.desc}</p>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </section>

      {/* ─── CATEGORIES ─── */}
      <section className="px-6 py-20 bg-white/[0.015] border-y border-white/5">
        <div className="px-12">
          <div className="flex items-end justify-between mb-12">
            <div>
              <p className="text-[10px] font-black tracking-[0.4em] uppercase text-[var(--accent-teal)] mb-2 italic">Browse by Category</p>
              <h2 className="text-3xl font-black uppercase tracking-tighter italic">Explore Experiences</h2>
            </div>
            <Link to="/events" className="hidden sm:flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-white/40 hover:text-white transition-colors">
              All Categories <ArrowUpRight size={14} />
            </Link>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-5">
            {CATEGORIES.map((cat, i) => {
              const liveCount = activeEvents.filter(e => e.category.toLowerCase().includes(cat.name.replace(/s$/i, '').toLowerCase())).length;
              return (
              <motion.div
                key={cat.name}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.08 }}
                whileHover={{ scale: 1.02 }}
                onClick={() => navigate('/events')}
                className={`relative p-6 rounded-2xl border border-white/8 bg-gradient-to-br ${cat.color} cursor-pointer group overflow-hidden`}
              >
                <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center text-[var(--accent-teal)] mb-4">
                  <Ticket size={20} />
                </div>
                <h3 className="font-black uppercase tracking-tight italic text-sm mb-1">{cat.name}</h3>
                <p className="text-[10px] text-white/40 font-bold uppercase tracking-widest">{liveCount} Live Event{liveCount === 1 ? '' : 's'}</p>
                <ArrowUpRight size={16} className="absolute top-5 right-5 text-white/20 group-hover:text-white/60 transition-colors" />
              </motion.div>
            )})}
          </div>
        </div>
      </section>

      {/* ─── UPCOMING EVENTS ─── */}
      {activeEvents.length > 0 && (
        <section className="px-12 py-28">
          <div className="flex items-end justify-between mb-12">
            <div>
              <p className="text-[10px] font-black tracking-[0.4em] uppercase text-[var(--accent-teal)] mb-2 italic">Live Now</p>
              <h2 className="text-4xl font-black uppercase tracking-tighter italic">Upcoming Events</h2>
            </div>
            <Link to="/events" className="flex items-center gap-2 px-6 py-3 rounded-xl border border-white/10 text-[10px] font-black uppercase tracking-widest hover:bg-white/5 transition-all">
              View All <ArrowUpRight size={14} />
            </Link>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {activeEvents.map((event, i) => (
              <HomeEventCard key={event.id} event={event} i={i} navigate={navigate} />
            ))}
          </div>
        </section>
      )}

      {/* ─── WHY NFT TICKETING ─── */}
      <section className="px-6 py-28 bg-gradient-to-b from-white/[0.01] to-transparent border-t border-white/5">
        <div className="px-12 grid lg:grid-cols-2 gap-20 items-center">
          <div>
            <p className="text-[10px] font-black tracking-[0.4em] uppercase text-[var(--accent-teal)] mb-4 italic">The Nexting Advantage</p>
            <h2 className="text-5xl font-black uppercase tracking-tighter italic leading-tight mb-12">
              Beyond Just<br />A Digital Ticket.
            </h2>
            <div className="space-y-8">
              {[
                { icon: <Lock size={18} />, title: 'Anti-Scalping Protocols', desc: 'Built-in price ceilings prevent predatory reselling. Set your own max resale price.' },
                { icon: <Coins size={18} />, title: 'Automatic Royalties', desc: 'Earn a % on every secondary sale, automatically enforced on-chain.' },
                { icon: <Globe size={18} />, title: 'True Digital Ownership', desc: 'Trade, hold, or gift your ticket. It\'s a real on-chain asset — not a screenshot.' },
                { icon: <Zap size={18} />, title: 'Zero Fraud Verification', desc: 'Cryptographically unique. Impossible to counterfeit or duplicate.' },
              ].map((item, i) => (
                <motion.div
                  key={item.title}
                  initial={{ opacity: 0, x: -20 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.1 }}
                  className="flex gap-5"
                >
                  <div className="shrink-0 w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-[var(--accent-purple)]">
                    {item.icon}
                  </div>
                  <div>
                    <h4 className="font-black uppercase tracking-tight italic mb-1">{item.title}</h4>
                    <p className="text-white/50 text-sm font-medium leading-relaxed">{item.desc}</p>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>

          {/* Right: Glassmorphism stat card */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            className="relative"
          >
            <div className="relative rounded-[3rem] border border-white/15 bg-gradient-to-br from-[var(--accent-purple)]/10 via-white/3 to-[var(--accent-teal)]/10 backdrop-blur-xl p-10 shadow-2xl overflow-hidden">
              <div className="absolute -top-20 -right-20 w-60 h-60 bg-[var(--accent-purple)]/20 rounded-full blur-[80px]" />
              <div className="absolute -bottom-20 -left-20 w-60 h-60 bg-[var(--accent-teal)]/10 rounded-full blur-[80px]" />

              <div className="relative z-10 grid grid-cols-2 gap-6">
                {PLATFORM_HIGHLIGHTS.map((s) => (
                  <div key={s.label} className={`p-5 rounded-2xl border border-white/8 bg-white/[0.03]`}>
                    <div className="text-[var(--accent-purple)] mb-3">{s.icon}</div>
                    <p className="text-3xl font-black text-white">{s.value}</p>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-white/40 mt-1">{s.label}</p>
                  </div>
                ))}
              </div>

              <div className="relative z-10 mt-6 p-5 rounded-2xl border border-[var(--accent-teal)]/20 bg-[var(--accent-teal)]/5">
                <div className="flex items-center gap-3">
                  <CheckCircle size={18} className="text-[var(--accent-teal)] shrink-0" />
                  <p className="text-sm font-bold text-white/70">Every ticket is minted as a unique ERC-721 NFT on Sepolia Testnet.</p>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ─── PLATFORM CAPABILITIES ─── */}
      <section className="px-6 py-24">
        <div className="px-12">
          <div className="text-center mb-16">
            <p className="text-[10px] font-black tracking-[0.4em] uppercase text-[var(--accent-teal)] mb-4 italic">Platform Capabilities</p>
            <h2 className="text-4xl font-black uppercase tracking-tighter italic">Built for Web3</h2>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {CAPABILITIES.map((c, i) => (
              <motion.div
                key={c.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
                className="p-6 rounded-2xl border border-white/8 bg-white/[0.02] hover:bg-white/[0.04] hover:border-white/15 transition-all group"
              >
                <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center mb-4 text-[var(--accent-purple)] group-hover:scale-110 transition-transform">
                  {c.icon}
                </div>
                <h3 className="font-black uppercase tracking-tight text-sm mb-2 italic">{c.title}</h3>
                <p className="text-sm text-white/50 font-medium leading-relaxed">{c.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── CTA ─── */}
      <section className="px-12 py-28">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="relative rounded-[3rem] border border-white/10 overflow-hidden"
          style={{ background: 'linear-gradient(135deg, rgba(140,59,254,0.12) 0%, rgba(0,0,0,0) 50%, rgba(16,185,129,0.08) 100%)' }}
        >
          <div className="absolute inset-0 pointer-events-none" style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,0.03) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,0.03) 1px,transparent 1px)', backgroundSize: '40px 40px' }} />
          <div className="relative z-10 text-center py-20 px-8">
            <p className="text-[10px] font-black tracking-[0.4em] uppercase text-[var(--accent-teal)] mb-6 italic">For Organizers</p>
            <h2 className="text-5xl md:text-7xl font-black uppercase tracking-tighter italic leading-tight mb-8">
              Host Your Event<br />on the{' '}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-[var(--accent-purple)] to-[var(--accent-teal)]">Blockchain.</span>
            </h2>
            <p className="text-white/50 text-lg mb-12 max-w-xl mx-auto font-medium">
              Zero setup fees. Built-in royalties. A global audience of Web3 natives ready to buy.
            </p>
            <div className="flex flex-wrap gap-4 justify-center">
              <motion.button
                whileHover={{ scale: 1.04 }}
                whileTap={{ scale: 0.97 }}
                onClick={() => isAuthenticated ? navigate('/manage') : setIsLoginOpen(true)}
                className="px-10 py-5 rounded-2xl bg-white text-black font-black uppercase tracking-widest text-xs shadow-2xl hover:shadow-white/20 transition-all"
              >
                Start Creating for Free
              </motion.button>
              <motion.button
                whileHover={{ scale: 1.03 }}
                onClick={() => navigate('/events')}
                className="px-10 py-5 rounded-2xl border border-white/15 text-white font-black uppercase tracking-widest text-xs hover:bg-white/5 transition-all"
              >
                Browse Events
              </motion.button>
            </div>
          </div>
        </motion.div>
      </section>

      {/* ─── FOOTER ─── */}
      <footer className="border-t border-white/5 bg-black/50 px-6 py-16">
        <div className="px-12">
          <div className="grid md:grid-cols-[2fr_1fr_1fr] gap-12 mb-14">
            <div>
              <Link to="/" className="flex items-center gap-2 mb-5">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[var(--accent-purple)] to-[var(--accent-teal)] flex items-center justify-center">
                  <Sparkles className="text-white" size={15} />
                </div>
                <span className="font-black tracking-tight uppercase italic">BLACK<span className="text-[var(--accent-teal)]">NOVA</span></span>
              </Link>
              <p className="text-white/40 text-xs font-medium leading-relaxed">
                The premier Web3 platform for secure, immutable NFT event ticketing.
              </p>
            </div>

            {[
              { 
                title: 'Platform', 
                links: [
                  { label: 'Marketplace', path: '/events' }, 
                  { label: 'My Tickets', path: '/tickets' }, 
                  { label: 'Create Event', path: '/manage' }, 
                  { label: 'Wallet', path: '/wallet' }
                ] 
              },
              { 
                title: 'Resources', 
                links: [
                  { label: 'How it works', path: '#how-it-works' }, 
                  { label: 'Organizer Guide', path: '/manage' }, 
                  { label: 'Etherscan', path: 'https://sepolia.etherscan.io/' }, 
                  { label: 'Support', path: 'mailto:support@example.com' }
                ] 
              }
            ].map(col => (
              <div key={col.title}>
                <h5 className="text-[10px] font-black uppercase tracking-[0.3em] text-white mb-6 italic">{col.title}</h5>
                <ul className="space-y-3">
                  {col.links.map(link => (
                    <li key={link.label}>
                      {link.path.startsWith('http') ? (
                        <a href={link.path} target="_blank" rel="noreferrer" className="text-[11px] font-bold text-white/40 hover:text-white transition-colors uppercase tracking-widest">{link.label}</a>
                      ) : (
                        <Link to={link.path} className="text-[11px] font-bold text-white/40 hover:text-white transition-colors uppercase tracking-widest">{link.label}</Link>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          <div className="pt-8 border-t border-white/5 flex flex-col md:flex-row items-center justify-between gap-4">
            <p className="text-[10px] font-black uppercase tracking-widest text-white/30 italic">
              © 2026 NEXTING. ALL RIGHTS RESERVED. ON-CHAIN VERIFIED.
            </p>
            <div className="flex gap-6">
              <Twitter size={15} className="text-white/30 hover:text-white cursor-pointer transition-colors" />
              <Instagram size={15} className="text-white/30 hover:text-white cursor-pointer transition-colors" />
              <Github size={15} className="text-white/30 hover:text-white cursor-pointer transition-colors" />
            </div>
          </div>
        </div>
      </footer>

      <LoginModal isOpen={isLoginOpen} onClose={() => setIsLoginOpen(false)} />
    </div>
  );
};

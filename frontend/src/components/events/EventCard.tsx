import React, { useState, useCallback } from 'react';
import { Calendar, MapPin, Sparkles } from 'lucide-react';
import { motion, useMotionValue, useTransform, useSpring } from 'framer-motion';
import type { Event } from '../../store/useEventStore';
import { config } from '../../config';
import { extractCid, IPFS_GATEWAYS, FALLBACK_IMG } from '../../utils/ipfs';

interface EventCardProps {
  event: Event;
  variant?: 'small' | 'large';
  index?: number;
  showEtherscan?: boolean;
}

export const EventCard: React.FC<EventCardProps> = ({ event, variant = 'small', index = 0, showEtherscan = false }) => {
  const date = new Date(event.date);
  const lowestPrice = event.tiers?.length ? Math.min(...event.tiers.map(t => t.price)) : 0;
  const totalSold = event.tiers?.reduce((sum, t) => sum + t.sold, 0) ?? 0;
  const totalSupply = event.tiers?.reduce((sum, t) => sum + t.supply, 0) ?? 0;
  const availability = (totalSold / totalSupply) * 100;


  const cid = extractCid(event.imageUrl);
  const gateways = IPFS_GATEWAYS;

  const [gatewayIndex, setGatewayIndex] = useState(0);

  const currentImageSrc = cid
    ? `${gateways[gatewayIndex]}/${cid}`
    : (event.imageUrl || FALLBACK_IMG);

  const handleImageError = useCallback(() => {
    if (cid && gatewayIndex < gateways.length - 1) {
      setGatewayIndex(prev => prev + 1);
    }
  }, [cid, gatewayIndex, gateways.length]);

  // Parallax Tilt Effect
  const x = useMotionValue(0);
  const y = useMotionValue(0);

  const mouseXSpring = useSpring(x);
  const mouseYSpring = useSpring(y);

  const rotateX = useTransform(mouseYSpring, [-0.5, 0.5], ["10deg", "-10deg"]);
  const rotateY = useTransform(mouseXSpring, [-0.5, 0.5], ["-10deg", "10deg"]);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    const xPct = mouseX / width - 0.5;
    const yPct = mouseY / height - 0.5;
    x.set(xPct);
    y.set(yPct);
  };

  const handleMouseLeave = () => {
    x.set(0);
    y.set(0);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: index * 0.1 }}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      style={{
        rotateX,
        rotateY,
        transformStyle: "preserve-3d",
      }}
      className={`group relative glass-panel rounded-3xl overflow-hidden border border-[var(--border-glass)] hover:border-[var(--accent-purple)]/50 transition-colors duration-500 cursor-pointer ${variant === 'large' ? 'h-[400px]' : 'h-[360px]'}`}
    >
      {/* Background Glow Overlay */}
      <div 
        className="absolute inset-0 z-10 bg-gradient-to-b from-transparent via-transparent to-[#000]/90" 
        style={{ transform: "translateZ(20px)" }}
      />
      
      {/* Glow Bloom */}
      <div className="absolute -inset-2 bg-[var(--accent-purple)]/0 group-hover:bg-[var(--accent-purple)]/5 blur-2xl transition-all duration-500 z-0" />

      {/* Event Image */}
      <div className="absolute inset-0 z-0">
        <motion.img 
          src={currentImageSrc} 
          alt={event.title}
          className="w-full h-full object-cover"
          style={{ transform: "translateZ(0px)" }}
          whileHover={{ scale: 1.1 }}
          transition={{ duration: 0.7 }}
          onError={handleImageError}
        />
      </div>

      {/* Content */}
      <div 
        className="absolute inset-0 z-20 p-6 flex flex-col justify-end"
        style={{ transform: "translateZ(40px)" }}
      >
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="px-3 py-1 rounded-full bg-[var(--accent-purple)]/20 text-[var(--accent-purple)] text-[10px] font-black uppercase tracking-widest backdrop-blur-md border border-[var(--accent-purple)]/30 flex items-center gap-1.5">
              <Sparkles size={10} />
              Verified Event
            </span>
            {event.tiers?.length > 1 && (
              <span className="px-3 py-1 rounded-full bg-[var(--accent-teal)]/20 text-[var(--accent-teal)] text-[10px] font-black uppercase tracking-widest backdrop-blur-md border border-[var(--accent-teal)]/30">
                {event.tiers.length} Tiers
              </span>
            )}
          </div>
          
          <h3 className="text-xl font-bold leading-tight line-clamp-2 text-white drop-shadow-md">
            {event.title}
          </h3>

          <div className="flex flex-col gap-1.5 text-xs text-[var(--text-secondary)] font-medium">
            <div className="flex items-center gap-2">
              <Calendar size={12} className="text-[var(--accent-teal)]" />
              <span>{date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
            </div>
            <div className="flex items-center gap-2">
              <MapPin size={12} className="text-[var(--accent-teal)]" />
              <span>{event.location}</span>
            </div>
          </div>

          <div className="pt-4 border-t border-white/10">
            <div className="flex items-center justify-between mb-4 bg-black/40 backdrop-blur-xl rounded-2xl px-4 py-3 border border-white/10 hover:border-[var(--accent-teal)]/50 transition-all duration-300 shadow-2xl group/avail">
              <div className="flex flex-col gap-1">
                <span className="text-[9px] text-white/50 font-black uppercase tracking-[0.2em]">Availability</span>
                <div style={{ width: `${availability}%` }} className="h-1 w-8 bg-[var(--accent-teal)] rounded-full group-hover/avail: transition-all duration-500" />
              </div>
              <div className="flex items-baseline gap-1">
                <span className="text-2xl font-black text-[var(--accent-teal)] italic tracking-tighter drop-shadow-[0_0_12px_rgba(45,212,191,0.4)] transition-all">
                  {totalSold}
                </span>
                <span className="text-sm font-bold text-white/30 italic">/ {totalSupply}</span>
                <span className="text-[8px] text-white/50 font-black uppercase ml-1 tracking-widest">Sold</span>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex flex-col">
                <span className="text-[9px] text-[var(--accent-teal)] font-black uppercase tracking-tighter opacity-70">Price From</span>
                <span className="text-2xl font-black text-white tracking-tighter">{lowestPrice} ETH</span>
              </div>
              <div className="flex flex-col items-end">
                {showEtherscan ? (
                  <a 
                    href={`https://sepolia.etherscan.io/address/${config.contractAddress}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-4 py-1.5 rounded-xl bg-[var(--accent-teal)]/10 border border-[var(--accent-teal)]/30 text-[var(--accent-teal)] text-[9px] font-black uppercase tracking-widest hover:bg-[var(--accent-teal)]/20 transition-all italic flex items-center gap-1.5"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Sparkles size={10} />
                    Etherscan
                  </a>
                ) : (
                  <motion.span 
                    whileHover={{ scale: 1.05, backgroundColor: 'var(--accent-purple)' }}
                    whileTap={{ scale: 0.95 }}
                    className="px-8 py-2.5 rounded-2xl bg-[var(--accent-purple)]/80 backdrop-blur-md border border-[var(--accent-purple)]/30 text-white text-[10px] font-black uppercase tracking-widest shadow-lg shadow-[var(--accent-purple)]/20 hover:shadow-[var(--accent-purple)]/40 transition-all italic"
                  >
                    Buy
                  </motion.span>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
};

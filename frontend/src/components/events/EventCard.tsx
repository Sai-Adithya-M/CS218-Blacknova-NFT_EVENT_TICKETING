import React from 'react';
import { Calendar, MapPin, Sparkles } from 'lucide-react';
import { motion, useMotionValue, useTransform, useSpring } from 'framer-motion';
import type { Event } from '../../store/useEventStore';
import { config } from '../../config';
import { useIPFSImage } from '../../hooks/useIPFSImage';

interface EventCardProps {
  event: Event;
  index?: number;
  showEtherscan?: boolean;
}


export const EventCard: React.FC<EventCardProps> = ({ event, index = 0, showEtherscan = false }) => {

  const date = new Date(event.date);
  const lowestPrice = event.tiers?.length ? Math.min(...event.tiers.map(t => t.price)) : 0;
  const totalSold = event.tiers?.reduce((sum, t) => sum + t.sold, 0) ?? 0;
  const totalSupply = event.tiers?.reduce((sum, t) => sum + t.supply, 0) ?? 0;
  const availability = (totalSold / totalSupply) * 100;

  const { src: currentImageSrc, loading: isImageLoading } = useIPFSImage(event.imageUrl);

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
      className={`group relative glass-panel rounded-3xl overflow-hidden border border-[var(--border-glass)] hover:border-[var(--accent-purple)]/50 transition-all duration-500 cursor-pointer flex flex-col bg-zinc-900/40 hover:bg-zinc-900/60 shadow-xl ${event.isOptimistic ? 'opacity-70 grayscale-[0.3]' : ''}`}
    >

      {/* 1. Banner Image Section */}
      <div className="relative h-44 overflow-hidden shrink-0 bg-white/5">
        <motion.img 
          src={currentImageSrc} 
          alt={event.title}
          className={`w-full h-full object-cover transition-all duration-700 ${isImageLoading ? 'blur-sm scale-105' : 'blur-0 scale-100'}`}
          whileHover={{ scale: 1.1 }}
          transition={{ duration: 0.7 }}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
        
        {/* Badges on top of image */}
        <div className="absolute top-4 left-4 flex items-center gap-2 z-20">
          {event.isOptimistic ? (
             <span className="px-3 py-1 rounded-full bg-[var(--accent-teal)]/20 text-[var(--accent-teal)] text-[10px] font-black tracking-widest backdrop-blur-xl border border-[var(--accent-teal)]/30 flex items-center gap-1.5 shadow-xl animate-pulse">
                <Sparkles size={10} className="animate-spin" />
                Minting...
             </span>
          ) : (
            <span className="px-3 py-1 rounded-full bg-black/50 text-[var(--accent-purple)] text-[10px] font-black tracking-widest backdrop-blur-xl border border-[var(--accent-purple)]/30 flex items-center gap-1.5 shadow-xl">
              <Sparkles size={10} />
              Verified
            </span>
          )}
          {event.tiers?.length > 1 && (
            <span className="px-3 py-1 rounded-full bg-black/50 text-[var(--accent-teal)] text-[10px] font-black tracking-widest backdrop-blur-xl border border-[var(--accent-teal)]/30 shadow-xl">
              {event.tiers.length} Tiers
            </span>
          )}
        </div>
      </div>

      {/* 2. Content Section - Separate Row Below Image */}
      <div className="flex-1 p-5 flex flex-col justify-between bg-zinc-900/50">
        <div className="space-y-3">
          <h3 className="text-lg font-black leading-tight line-clamp-1 text-white italic tracking-tight group-hover:text-[var(--accent-teal)] transition-colors">
            {event.title}
          </h3>

          <div className="flex items-center justify-between text-[10px] font-bold text-white/70">
            <div className="flex items-center gap-2">
              <Calendar size={12} className="text-[var(--accent-teal)]" />
              <span className="truncate">{date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
            </div>
            <div className="flex items-center gap-2">
              <MapPin size={12} className="text-[var(--accent-teal)]" />
              <span className="truncate max-w-[120px] text-right">{event.location}</span>
            </div>
          </div>

        </div>

        <div className="space-y-4 pt-4 mt-2 border-t border-white/5">
          {/* Availability Info */}
          <div className="flex items-center justify-between">
            <div className="flex flex-col gap-1 flex-1 pr-4">
              <div className="flex justify-between items-center text-[8px] font-black uppercase tracking-widest text-white/30 mb-1">
                <span>Availability</span>
                <span>{Math.round(availability) || 0}%</span>
              </div>
              <div className="h-1 w-full bg-white/5 rounded-full overflow-hidden">
                <motion.div 
                  initial={{ width: 0 }}
                  animate={{ width: `${availability || 0}%` }}
                  className="h-full bg-gradient-to-r from-[var(--accent-purple)] to-[var(--accent-teal)]" 
                />
              </div>
            </div>
            <div className="text-right">
              <span className="text-xs font-black text-white italic">{totalSold}/{totalSupply}</span>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex flex-col">
              <span className="text-[8px] text-[var(--accent-teal)] font-black uppercase tracking-widest opacity-60">Price From</span>
              <span className="text-xl font-black text-white tracking-tighter">{lowestPrice} ETH</span>
            </div>
            
            {showEtherscan ? (
              <div className="flex items-center gap-2">
                {event.isOptimistic && (
                  <div className="flex items-center gap-2 text-[8px] font-bold uppercase text-white/40 italic">
                    <Loader2 size={10} className="animate-spin" /> Pending...
                  </div>
                )}
                <a 
                  href={`https://sepolia.etherscan.io/address/${config.contractAddress}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-[9px] font-black uppercase text-white/60 hover:text-[var(--accent-teal)] hover:border-[var(--accent-teal)]/50 transition-all ${event.isOptimistic ? 'pointer-events-none opacity-40' : ''}`}
                  onClick={(e) => e.stopPropagation()}
                >
                  Etherscan
                </a>
              </div>

            ) : (
              <motion.div 
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className={`px-6 py-2.5 rounded-xl bg-white text-black text-[10px] font-black uppercase tracking-widest shadow-xl hover:shadow-white/10 transition-all italic ${event.isOptimistic ? 'pointer-events-none opacity-40' : ''}`}
              >
                Buy
              </motion.div>
            )}
          </div>
        </div>
      </div>

    </motion.div>
  );
};

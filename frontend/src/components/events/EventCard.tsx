import React, { useState, useEffect } from 'react';
import { Calendar, MapPin, BadgeCheck, Clock } from 'lucide-react';
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

  // Live countdown timer
  const [countdown, setCountdown] = useState('');
  const [countdownType, setCountdownType] = useState<'upcoming' | 'live' | 'ended'>('upcoming');

  useEffect(() => {
    const updateCountdown = () => {
      const now = new Date().getTime();
      const eventTime = date.getTime();
      const diff = eventTime - now;

      if (isNaN(eventTime)) {
        setCountdown('');
        return;
      }

      if (diff <= 0) {
        // Event started — assume ~3hr duration
        const endTime = eventTime + 3 * 60 * 60 * 1000;
        if (now < endTime) {
          setCountdownType('live');
          setCountdown('Happening Now');
        } else {
          setCountdownType('ended');
          setCountdown('Event Ended');
        }
        return;
      }

      setCountdownType('upcoming');
      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

      if (days > 0) {
        setCountdown(`${days}d ${hours}h ${mins}m`);
      } else if (hours > 0) {
        setCountdown(`${hours}h ${mins}m`);
      } else {
        setCountdown(`${mins}m`);
      }
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 60000);
    return () => clearInterval(interval);
  }, [date]);

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
      className={`group relative glass-panel rounded-3xl overflow-hidden border border-[var(--border-glass)] hover:border-[var(--accent-purple)]/50 transition-all duration-500 cursor-pointer flex flex-col bg-zinc-900/40 hover:bg-zinc-900/60 shadow-xl`}
    >

      {/* 1. Banner Image Section */}
      <div className="relative h-44 overflow-hidden shrink-0">
        <motion.img 
          src={currentImageSrc} 
          alt={event.title}
          className={`w-full h-full object-cover transition-all duration-700 ${isImageLoading ? 'blur-sm scale-105' : 'blur-0 scale-100'}`}
          whileHover={{ scale: 1.1 }}
          transition={{ duration: 0.7 }}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
        
        {/* Badges — top left */}
        <div className="absolute top-4 left-4 flex items-center gap-2 z-20">
          <span className="px-3 py-1 rounded-full bg-black/50 text-[var(--accent-purple)] text-[10px] font-black tracking-widest backdrop-blur-xl border border-[var(--accent-purple)]/30 flex items-center gap-1.5 shadow-xl">
            <BadgeCheck size={10} />
            Verified
          </span>
          {event.royaltyBps > 0 && (
            <span className="px-3 py-1 rounded-full bg-black/50 text-white/70 text-[10px] font-black tracking-widest backdrop-blur-xl border border-white/10 shadow-xl">
              {event.royaltyBps}% Royalty
            </span>
          )}
        </div>

        {/* Age badge — top right */}
        {event.minAge && event.minAge !== 'All ages' && (
          <div className="absolute top-4 right-4 px-2 py-1 rounded-lg bg-black/60 backdrop-blur-md border border-white/10 text-[8px] font-black uppercase text-white tracking-widest flex items-center gap-1.5 z-20">
            <div className="w-1.5 h-1.5 rounded-full bg-orange-500 animate-pulse" />
            {event.minAge}
          </div>
        )}

        {/* Countdown — bottom right on image */}
        {countdown && (
          <div className={`absolute bottom-4 right-4 z-20 flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest px-3 py-1.5 rounded-full backdrop-blur-xl border shadow-lg ${
            countdownType === 'live'
              ? 'bg-green-500/20 text-green-400 border-green-500/30'
              : countdownType === 'ended'
              ? 'bg-black/50 text-white/40 border-white/10'
              : 'bg-black/50 text-[var(--accent-teal)] border-[var(--accent-teal)]/30'
          }`}>
            <Clock size={10} className={countdownType === 'live' ? 'animate-pulse' : ''} />
            {countdownType === 'live' && <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />}
            {countdown}
          </div>
        )}
      </div>

      {/* 2. Content Section */}
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
              <span className="truncate max-w-[120px] text-right">
                {event.venueName ? `${event.venueName}, ${event.location}` : event.location}
              </span>
            </div>
          </div>
        </div>

        <div className="space-y-4 pt-4 mt-3 border-t border-white/5">
          {/* Availability */}
          <div className="flex items-center justify-between">
            <div className="flex flex-col gap-1 flex-1 pr-4">
              <div className="flex justify-between items-center text-[8px] font-black uppercase tracking-widest text-white/30 mb-1">
                <span>Availability</span>
                <span>{Math.round(availability)}%</span>
              </div>
              <div className="h-1 w-full bg-white/5 rounded-full overflow-hidden">
                <motion.div 
                  initial={{ width: 0 }}
                  animate={{ width: `${availability}%` }}
                  className="h-full bg-gradient-to-r from-[var(--accent-purple)] to-[var(--accent-teal)]" 
                />
              </div>
            </div>
            <div className="text-right">
              <span className="text-xs font-black text-white italic">{totalSold}/{totalSupply}</span>
            </div>
          </div>

          {/* Price + CTA */}
          <div className="flex items-center justify-between">
            <div className="flex flex-col">
              <span className="text-[8px] text-[var(--accent-teal)] font-black uppercase tracking-widest opacity-60">Price From</span>
              <span className="text-xl font-black text-white tracking-tighter">{lowestPrice} ETH</span>
            </div>
            
            {showEtherscan ? (
              <a 
                href={`https://sepolia.etherscan.io/address/${config.contractAddress}`}
                target="_blank"
                rel="noopener noreferrer"
                className="px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-[9px] font-black uppercase text-white/60 hover:text-[var(--accent-teal)] hover:border-[var(--accent-teal)]/50 transition-all"
                onClick={(e) => e.stopPropagation()}
              >
                Etherscan
              </a>
            ) : (
              <motion.div 
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className="px-6 py-2.5 rounded-xl bg-white text-black text-[10px] font-black uppercase tracking-widest shadow-xl hover:shadow-white/10 transition-all italic"
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

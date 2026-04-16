import React from 'react';
import { motion } from 'framer-motion';

export const Skeleton: React.FC<{ className?: string }> = ({ className }) => (
  <div className={`relative overflow-hidden bg-white/5 rounded-2xl ${className}`}>
    <motion.div
      animate={{
        x: ['-100%', '100%'],
      }}
      transition={{
        duration: 1.5,
        repeat: Infinity,
        ease: "linear",
      }}
      className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent shadow-[0_0_20px_rgba(255,255,255,0.05)]"
    />
  </div>
);

export const EventCardSkeleton: React.FC = () => (
  <div className="h-[360px] glass-panel rounded-3xl p-6 border border-[var(--border-glass)] space-y-4">
    <Skeleton className="h-40 w-full" />
    <Skeleton className="h-6 w-3/4" />
    <Skeleton className="h-4 w-1/2" />
    <div className="flex justify-between items-center pt-8">
      <div className="space-y-2">
        <Skeleton className="h-3 w-12" />
        <Skeleton className="h-6 w-20" />
      </div>
      <Skeleton className="h-10 w-24 rounded-xl" />
    </div>
  </div>
);

export const DashboardStatsSkeleton: React.FC = () => (
  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
    {[1, 2, 3, 4].map(i => (
      <div key={i} className="glass-panel p-8 rounded-[2rem] border border-[var(--border-glass)] space-y-4">
        <Skeleton className="w-12 h-12 rounded-xl" />
        <div className="space-y-2">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-10 w-32" />
        </div>
      </div>
    ))}
  </div>
);

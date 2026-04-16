import React from 'react';
import { Search } from 'lucide-react';

export const FilterSidebar: React.FC = () => {
  return (
    <aside className="hidden lg:block w-72 flex-shrink-0 space-y-8">
      {/* Search */}
      <div className="relative group">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--text-secondary)] group-focus-within:text-[var(--accent-purple)] transition-colors" size={20} />
        <input 
          type="text" 
          placeholder="Search events..." 
          className="w-full bg-white/5 border border-[var(--border-glass)] rounded-2xl py-4 pl-12 pr-4 focus:outline-none focus:border-[var(--accent-purple)]/50 focus:ring-1 focus:ring-[var(--accent-purple)]/20 transition-all font-medium"
        />
      </div>

      {/* Categories */}
      <div className="space-y-4">
        <h3 className="text-sm font-bold uppercase tracking-widest text-[var(--text-secondary)]">Categories</h3>
        <div className="flex flex-col gap-2">
          {['All', 'Music', 'Web3', 'Conference', 'Sports', 'Art'].map((cat) => (
            <button 
              key={cat}
              className={`flex items-center justify-between px-4 py-3 rounded-xl border border-transparent transition-all ${cat === 'All' ? 'bg-[var(--accent-purple)]/10 border-[var(--accent-purple)]/30 text-[var(--text-primary)]' : 'hover:bg-white/5 text-[var(--text-secondary)]'}`}
            >
              <span className="font-semibold">{cat}</span>
              {cat === 'All' && <div className="w-2 h-2 rounded-full bg-[var(--accent-purple)]" />}
            </button>
          ))}
        </div>
      </div>

      {/* Price Range */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold uppercase tracking-widest text-[var(--text-secondary)]">Price Range</h3>
          <span className="text-xs font-bold text-[var(--accent-teal)]">ETH</span>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <input type="number" placeholder="Min" className="bg-white/5 border border-[var(--border-glass)] rounded-xl py-3 px-4 focus:outline-none focus:border-[var(--accent-teal)]/50 transition-all text-sm" />
          <input type="number" placeholder="Max" className="bg-white/5 border border-[var(--border-glass)] rounded-xl py-3 px-4 focus:outline-none focus:border-[var(--accent-teal)]/50 transition-all text-sm" />
        </div>
      </div>

      {/* Status */}
      <div className="space-y-4">
        <h3 className="text-sm font-bold uppercase tracking-widest text-[var(--text-secondary)]">Verification</h3>
        <label className="flex items-center gap-3 cursor-pointer group">
          <div className="w-6 h-6 rounded-md border-2 border-[var(--border-glass)] group-hover:border-[var(--accent-purple)] flex items-center justify-center transition-all">
            <div className="w-3 h-3 rounded-sm bg-[var(--accent-purple)] scale-0 group-aria-checked:scale-100 transition-transform" />
          </div>
          <span className="text-sm font-semibold text-[var(--text-secondary)] transition-colors group-hover:text-[var(--text-primary)]">Verified Organizers Only</span>
        </label>
      </div>

      {/* Reset */}
      <button className="w-full py-4 rounded-2xl border border-[var(--border-glass)] text-[var(--text-secondary)] font-bold hover:bg-white/5 transition-all text-sm">
        Reset All Filters
      </button>
    </aside>
  );
};

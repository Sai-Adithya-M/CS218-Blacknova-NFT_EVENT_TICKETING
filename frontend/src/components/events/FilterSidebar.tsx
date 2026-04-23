import React from 'react';
import { Search, X } from 'lucide-react';

interface FilterSidebarProps {
  filters: {
    search: string;
    category: string;
    minPrice: string;
    maxPrice: string;
  };
  setFilters: React.Dispatch<React.SetStateAction<{
    search: string;
    category: string;
    minPrice: string;
    maxPrice: string;
  }>>;
}

export const FilterSidebar: React.FC<FilterSidebarProps> = ({ filters, setFilters }) => {
  const categories = ['All', 'Music', 'Tech & Crypto', 'Digital Art', 'Sports & Gaming', 'Conference'];

  const handleReset = () => {
    setFilters({
      search: '',
      category: 'All',
      minPrice: '',
      maxPrice: '',
    });
  };

  return (
    <aside className="w-72 flex-shrink-0 space-y-8">
      {/* Search */}
      <div className="relative group">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--text-secondary)] group-focus-within:text-[var(--accent-purple)] transition-colors" size={20} />
        <input 
          type="text" 
          placeholder="Search events..." 
          value={filters.search}
          onChange={(e) => setFilters(prev => ({ ...prev, search: e.target.value }))}
          className="w-full bg-white/5 border border-[var(--border-glass)] rounded-2xl py-4 pl-12 pr-4 focus:outline-none focus:border-[var(--accent-purple)]/50 focus:ring-1 focus:ring-[var(--accent-purple)]/20 transition-all font-medium"
        />
      </div>

      {/* Categories */}
      <div className="space-y-4">
        <h3 className="text-sm font-bold uppercase tracking-widest text-[var(--text-secondary)]">Categories</h3>
        <div className="flex flex-col gap-2">
          {categories.map((cat) => (
            <button 
              key={cat}
              onClick={() => setFilters(prev => ({ ...prev, category: cat }))}
              className={`flex items-center justify-between px-4 py-3 rounded-xl border border-transparent transition-all ${filters.category === cat ? 'bg-[var(--accent-purple)]/10 border-[var(--accent-purple)]/30 text-[var(--text-primary)]' : 'hover:bg-white/5 text-[var(--text-secondary)]'}`}
            >
              <span className="font-semibold">{cat}</span>
              {filters.category === cat && <div className="w-2 h-2 rounded-full bg-[var(--accent-purple)]" />}
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
          <input 
            type="number" 
            placeholder="Min" 
            value={filters.minPrice}
            onChange={(e) => setFilters(prev => ({ ...prev, minPrice: e.target.value }))}
            className="bg-white/5 border border-[var(--border-glass)] rounded-xl py-3 px-4 focus:outline-none focus:border-[var(--accent-teal)]/50 transition-all text-sm" 
          />
          <input 
            type="number" 
            placeholder="Max" 
            value={filters.maxPrice}
            onChange={(e) => setFilters(prev => ({ ...prev, maxPrice: e.target.value }))}
            className="bg-white/5 border border-[var(--border-glass)] rounded-xl py-3 px-4 focus:outline-none focus:border-[var(--accent-teal)]/50 transition-all text-sm" 
          />
        </div>
      </div>

      {/* Reset */}
      <button 
        onClick={handleReset}
        className="w-full py-4 rounded-2xl border border-[var(--border-glass)] text-[var(--text-secondary)] font-bold hover:bg-white/5 transition-all text-sm flex items-center justify-center gap-2"
      >
        <X size={16} />
        Reset All Filters
      </button>
    </aside>
  );
};


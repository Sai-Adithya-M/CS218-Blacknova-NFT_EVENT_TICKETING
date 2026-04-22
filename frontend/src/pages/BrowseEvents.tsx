import React, { useState, useMemo } from 'react';
import { useEventStore } from '../store/useEventStore';
import { EventCard } from '../components/events/EventCard';
import { EventDetailModal } from '../components/events/EventDetailModal';
import { FilterSidebar } from '../components/events/FilterSidebar';
import { SlidersHorizontal, SearchX, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import type { Event } from '../store/useEventStore';

export const BrowseEvents: React.FC = () => {
  const { events, isLoading } = useEventStore();
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [showMobileFilters, setShowMobileFilters] = useState(false);
  const [filters, setFilters] = useState({
    search: '',
    category: 'All',
    minPrice: '',
    maxPrice: '',
  });

  const filteredEvents = useMemo(() => {
    return events.filter(event => {
      // Basic status and expiration filter
      const isActive = event.status === 'active' && new Date(event.date) > new Date();
      if (!isActive) return false;

      // Search filter (title, location, description)
      if (filters.search) {
        const searchLower = filters.search.toLowerCase();
        const matchesSearch = 
          event.title.toLowerCase().includes(searchLower) || 
          event.location.toLowerCase().includes(searchLower) ||
          event.description.toLowerCase().includes(searchLower);
        if (!matchesSearch) return false;
      }

      // Category filter
      if (filters.category !== 'All') {
        const eventCategory = event.category.toLowerCase();
        const selectedCategory = filters.category.toLowerCase();
        // Handle "Music" vs "Music & Concerts"
        if (!eventCategory.includes(selectedCategory) && !selectedCategory.includes(eventCategory)) {
          return false;
        }
      }

      // Price filter
      const lowestPrice = event.tiers?.length ? Math.min(...event.tiers.map(t => t.price)) : 0;
      if (filters.minPrice && lowestPrice < parseFloat(filters.minPrice)) {
        return false;
      }
      if (filters.maxPrice && lowestPrice > parseFloat(filters.maxPrice)) {
        return false;
      }

      return true;
    });
  }, [events, filters]);

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: { opacity: 1, transition: { staggerChildren: 0.1 } }
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0 }
  };

  const clearFilters = () => {
    setFilters({
      search: '',
      category: 'All',
      minPrice: '',
      maxPrice: '',
    });
  };

  const hasActiveFilters = filters.search || filters.category !== 'All' || filters.minPrice || filters.maxPrice;

  return (
    <motion.div
      initial="hidden"
      animate="visible"
      variants={containerVariants}
      className="px-12 pt-32 pb-12"
    >
      <motion.div variants={itemVariants} className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-12">
        <div>
          <h1 className="text-6xl font-black tracking-tighter mb-2 italic text-white flex items-center gap-4">
            MARKETPLACE
            {hasActiveFilters && (
              <button 
                onClick={clearFilters}
                className="text-xs font-black uppercase tracking-widest text-[var(--accent-purple)] hover:text-white transition-colors bg-[var(--accent-purple)]/10 px-3 py-1 rounded-full border border-[var(--accent-purple)]/20"
              >
                Clear Filters
              </button>
            )}
          </h1>
          <p className="text-white/60 max-w-lg font-medium">
            Discover and trade digital collectible tickets for the world's most exclusive experiences.
          </p>
        </div>

        <button 
          onClick={() => setShowMobileFilters(!showMobileFilters)}
          className="lg:hidden flex items-center gap-2 px-6 py-3 rounded-2xl glass-panel border border-white/10 font-bold text-sm"
        >
          <SlidersHorizontal size={18} />
          Filters {hasActiveFilters && <span className="w-2 h-2 rounded-full bg-[var(--accent-purple)]" />}
        </button>
      </motion.div>

      <div className="flex gap-12 relative">
        {/* Desktop Sidebar */}
        <motion.div variants={itemVariants} className="hidden lg:block sticky top-32 h-fit">
          <FilterSidebar filters={filters} setFilters={setFilters} />
        </motion.div>

        {/* Mobile Sidebar Overlay */}
        <AnimatePresence>
          {showMobileFilters && (
            <motion.div 
              initial={{ opacity: 0, x: -100 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -100 }}
              className="fixed inset-0 z-50 lg:hidden p-6 pt-32 bg-black overflow-y-auto"
            >
              <div className="flex justify-between items-center mb-8">
                <h2 className="text-2xl font-black italic">FILTERS</h2>
                <button onClick={() => setShowMobileFilters(false)} className="p-2 glass-panel rounded-xl">
                  <X size={24} />
                </button>
              </div>
              <FilterSidebar filters={filters} setFilters={setFilters} />
              <button 
                onClick={() => setShowMobileFilters(false)}
                className="w-full mt-8 py-4 rounded-2xl bg-[var(--accent-purple)] text-white font-black uppercase tracking-widest"
              >
                Show Results
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="flex-1">
          {isLoading ? (
            <div className="h-96 flex flex-col items-center justify-center">
              <div className="w-12 h-12 border-4 border-[var(--accent-purple)]/20 border-t-[var(--accent-purple)] rounded-full animate-spin mb-4" />
              <p className="text-[10px] font-black uppercase tracking-[0.4em] text-white/40 italic animate-pulse">Syncing Blockchain...</p>
            </div>
          ) : filteredEvents.length > 0 ? (
            <motion.div
              variants={containerVariants}
              className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8"
            >
              {filteredEvents.map((event, i) => (
                <motion.div
                  key={event.id}
                  variants={itemVariants}
                  onClick={() => setSelectedEvent(event)}
                >
                  <EventCard event={event} index={i} />
                </motion.div>
              ))}
            </motion.div>
          ) : (
            <motion.div
              variants={itemVariants}
              className="h-96 flex flex-col items-center justify-center glass-panel rounded-[3rem] border border-dashed border-white/10 text-center p-12"
            >
              <div className="w-16 h-16 rounded-2xl bg-white/5 flex items-center justify-center mb-6">
                <SearchX className="text-white/20" size={32} />
              </div>
              <h3 className="text-xl font-bold mb-2">No Matches Found</h3>
              <p className="text-[var(--text-secondary)]">Try adjusting your filters or search terms.</p>
              {hasActiveFilters && (
                <button 
                  onClick={clearFilters}
                  className="mt-6 px-8 py-3 rounded-2xl bg-[var(--accent-purple)]/10 border border-[var(--accent-purple)]/30 text-[var(--accent-purple)] font-bold text-sm hover:bg-[var(--accent-purple)]/20 transition-all"
                >
                  Clear All Filters
                </button>
              )}
            </motion.div>
          )}
        </div>
      </div>

      {/* Event Detail / Purchase Modal */}
      <EventDetailModal
        event={selectedEvent}
        isOpen={!!selectedEvent}
        onClose={() => setSelectedEvent(null)}
      />
    </motion.div>
  );
};


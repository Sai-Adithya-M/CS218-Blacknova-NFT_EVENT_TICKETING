import React, { useState } from 'react';
import { useEventStore } from '../store/useEventStore';
import { EventCard } from '../components/events/EventCard';
import { EventDetailModal } from '../components/events/EventDetailModal';
import { FilterSidebar } from '../components/events/FilterSidebar';
import { SlidersHorizontal, SearchX } from 'lucide-react';
import { motion } from 'framer-motion';
import type { Event } from '../store/useEventStore';

export const BrowseEvents: React.FC = () => {
  const { events, isLoading } = useEventStore();
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);

  const activeEvents = events.filter(e => e.status === 'active' && new Date(e.date) > new Date());

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: { opacity: 1, transition: { staggerChildren: 0.1 } }
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0 }
  };

  return (
    <motion.div
      initial="hidden"
      animate="visible"
      variants={containerVariants}
      className="px-12 pt-32 pb-12"
    >
      <motion.div variants={itemVariants} className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-12">
        <div>
          <h1 className="text-6xl font-black tracking-tighter mb-2 italic text-white">MARKETPLACE</h1>
          <p className="text-white/60 max-w-lg font-medium">
            Discover and trade digital collectible tickets for the world's most exclusive experiences.
          </p>
        </div>

        <button className="lg:hidden flex items-center gap-2 px-6 py-3 rounded-2xl glass-panel border border-white/10 font-bold text-sm">
          <SlidersHorizontal size={18} />
          Filters
        </button>
      </motion.div>

      <div className="flex gap-12">
        <motion.div variants={itemVariants} className="hidden lg:block">
          <FilterSidebar />
        </motion.div>

        <div className="flex-1">
          {isLoading ? (
            <div className="h-96 flex flex-col items-center justify-center">
              <div className="w-12 h-12 border-4 border-[var(--accent-purple)]/20 border-t-[var(--accent-purple)] rounded-full animate-spin mb-4" />
              <p className="text-[10px] font-black uppercase tracking-[0.4em] text-white/40 italic animate-pulse">Syncing Blockchain...</p>
            </div>
          ) : activeEvents.length > 0 ? (
            <motion.div
              variants={containerVariants}
              className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8"
            >
              {activeEvents.map((event, i) => (
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
              <h3 className="text-xl font-bold mb-2">No Events Yet</h3>
              <p className="text-[var(--text-secondary)]">Be the first to create an event and list it on the marketplace.</p>
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

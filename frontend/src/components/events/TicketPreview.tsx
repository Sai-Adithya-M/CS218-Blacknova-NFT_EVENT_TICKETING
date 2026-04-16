import React from 'react';
import { Sparkles, Calendar, MapPin, Ticket } from 'lucide-react';

interface TicketPreviewProps {
  formData: {
    title: string;
    description: string;
    date: string;
    price: string;
    location: string;
  };
}

export const TicketPreview: React.FC<TicketPreviewProps> = ({ formData }) => {
  const date = formData.date ? new Date(formData.date) : null;

  return (
    <div className="sticky top-32">
      <h3 className="text-sm font-bold uppercase tracking-widest text-[var(--text-secondary)] mb-6">Live NFT Preview</h3>
      
      <div className="relative group perspective-1000">
        <div className="relative w-full aspect-[3/4] glass-panel rounded-[2.5rem] p-8 border border-[var(--border-glass)] shadow-2xl overflow-hidden transition-all duration-500 group-hover:rotate-y-12 group-hover:shadow-[var(--accent-purple)]/20 shadow-[0_0_50px_-12px_rgba(0,0,0,0.5)] bg-gradient-to-br from-white/5 to-white/[0.02]">
          {/* Holographic Effect Overlay */}
          <div className="absolute inset-0 bg-gradient-to-tr from-[var(--accent-purple)]/10 via-transparent to-[var(--accent-teal)]/10 opacity-50 group-hover:opacity-100 transition-opacity" />
          
          {/* Header */}
          <div className="relative flex justify-between items-start mb-12">
            <div className="w-12 h-12 rounded-2xl bg-[var(--accent-purple)] flex items-center justify-center shadow-lg shadow-[var(--accent-purple)]/20">
              <Sparkles className="text-white" size={24} />
            </div>
            <div className="text-right">
              <div className="text-[10px] font-black tracking-[0.2em] text-[var(--accent-purple)] uppercase mb-1">Authentic NFT</div>
              <div className="text-[var(--text-secondary)] text-xs font-mono">#0001 / 1000</div>
            </div>
          </div>

          {/* Event Content */}
          <div className="relative space-y-6">
            <h2 className="text-3xl font-black tracking-tighter leading-[1.1] text-transparent bg-clip-text bg-gradient-to-r from-white to-[var(--text-secondary)]">
              {formData.title || 'Your Event Title'}
            </h2>
            
            <p className="text-sm text-[var(--text-secondary)] line-clamp-3 leading-relaxed">
              {formData.description || 'Describe the magic of your experience here...'}
            </p>

            <div className="space-y-3 pt-4">
              <div className="flex items-center gap-3 text-sm font-semibold">
                <Calendar size={18} className="text-[var(--accent-teal)]" />
                <span>{date ? date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : 'Set a date'}</span>
              </div>
              <div className="flex items-center gap-3 text-sm font-semibold">
                <MapPin size={18} className="text-[var(--accent-teal)]" />
                <span>{formData.location || 'Define a location'}</span>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="absolute bottom-8 left-8 right-8 flex items-end justify-between border-t border-white/10 pt-6">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-secondary)] mb-1">Value</div>
              <div className="text-2xl font-black text-[var(--accent-teal)]">{formData.price || '0.00'} ETH</div>
            </div>
            <div className="w-16 h-16 bg-white/[0.03] backdrop-blur-md border border-white/10 rounded-2xl flex items-center justify-center">
              <Ticket className="text-[var(--text-secondary)]/50" size={32} />
            </div>
          </div>
          
          {/* Decorative Elements */}
          <div className="absolute -bottom-20 -right-20 w-40 h-40 bg-[var(--accent-purple)]/20 rounded-full blur-[60px]" />
        </div>
      </div>
    </div>
  );
};

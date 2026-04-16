import React, { type ReactNode } from 'react';
import { Navbar } from '../components/layout/Navbar';
import { BackgroundAtmosphere } from '../components/ui/BackgroundAtmosphere';

interface LayoutProps {
  children: ReactNode;
}

export const AppLayout: React.FC<LayoutProps> = ({ children }) => {
  return (
    <div className="min-h-screen bg-[#000] text-[#F5F5F0] selection:bg-[var(--accent-purple)]/30 selection:text-white">
      <BackgroundAtmosphere />
      <Navbar />
      <main className="relative z-10">
        {children}
      </main>
    </div>
  );
};

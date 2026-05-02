import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, UserPlus, ShieldCheck, Loader2 } from 'lucide-react';
import { ethers } from 'ethers';
import { config } from '../../config';
import toast from 'react-hot-toast';

interface ScannerManagementModalProps {
  isOpen: boolean;
  onClose: () => void;
  eventId: string;
  eventName: string;
}

const ABI = [
  "function addScanner(uint256 eventId, address scanner) external",
  "function removeScanner(uint256 eventId, address scanner) external",
  "function eventScanners(uint256 eventId, address scanner) public view returns (bool)"
];

export const ScannerManagementModal: React.FC<ScannerManagementModalProps> = ({
  isOpen,
  onClose,
  eventId,
  eventName
}) => {
  const [newScanner, setNewScanner] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const numericEventId = parseInt(eventId.replace('evt_', ''), 10);

  const handleAddScanner = async () => {
    if (!ethers.isAddress(newScanner)) {
      toast.error("Invalid Ethereum address");
      return;
    }

    setIsProcessing(true);
    try {
      const provider = new ethers.BrowserProvider((window as any).ethereum);
      const signer = await provider.getSigner();
      const contract = new ethers.Contract(config.contractAddress, ABI, signer);

      const tx = await contract.addScanner(numericEventId, newScanner);
      await tx.wait();
      
      toast.success("Scanner added successfully!");
      setNewScanner('');
    } catch (err: any) {
      console.error(err);
      toast.error(err.reason || err.message || "Failed to add scanner");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/80 backdrop-blur-sm"
          />
          
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="relative w-full max-w-lg rounded-[2.5rem] border border-white/10 bg-[#0a0a0f] shadow-2xl overflow-hidden"
          >
            <div className="p-8 space-y-8">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-[10px] font-black tracking-[0.4em] uppercase text-[var(--accent-teal)] mb-1 italic">Security Access</h2>
                  <h3 className="text-2xl font-black uppercase tracking-tighter italic">Authorized Scanners</h3>
                  <p className="text-[10px] text-white/40 font-bold uppercase mt-1">Event: {eventName}</p>
                </div>
                <button onClick={onClose} className="p-2 rounded-full hover:bg-white/5 transition-colors">
                  <X size={20} className="text-white/40" />
                </button>
              </div>

              <div className="space-y-4">
                <div className="relative group">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-white/20 group-focus-within:text-[var(--accent-teal)]">
                    <UserPlus size={18} />
                  </div>
                  <input
                    value={newScanner}
                    onChange={(e) => setNewScanner(e.target.value)}
                    placeholder="Enter Wallet Address (0x...)"
                    className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 pl-12 pr-4 text-sm font-bold placeholder:text-white/20 focus:outline-none focus:border-[var(--accent-teal)] transition-all"
                  />
                </div>
                <button
                  onClick={handleAddScanner}
                  disabled={isProcessing || !newScanner}
                  className="w-full py-4 rounded-2xl bg-[var(--accent-teal)] text-black font-black uppercase tracking-widest text-xs shadow-lg disabled:opacity-50 transition-all flex items-center justify-center gap-2"
                >
                  {isProcessing ? <Loader2 size={16} className="animate-spin" /> : <ShieldCheck size={16} />}
                  Authorize Scanner
                </button>
              </div>

              <div className="pt-6 border-t border-white/5">
                <div className="flex items-center justify-between mb-4">
                  <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-white/30 italic">On-Chain Scanners</h4>
                  <span className="text-[8px] font-black uppercase bg-white/5 px-2 py-1 rounded text-white/20">Syncing...</span>
                </div>
                
                {/* Note: In a full app, we would fetch and list the scanners here. 
                    For now, we provide the tool to add/remove. */}
                <div className="bg-white/[0.02] border border-white/5 rounded-2xl p-6 text-center">
                   <p className="text-[10px] text-white/20 font-bold uppercase leading-relaxed">
                     Scanner addresses are stored directly on the blockchain. Use the input above to manage access for your event staff.
                   </p>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

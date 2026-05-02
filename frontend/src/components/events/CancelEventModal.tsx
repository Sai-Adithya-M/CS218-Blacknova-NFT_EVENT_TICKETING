import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Loader2, AlertTriangle, CheckCircle2, ShieldAlert, ArrowRight, Ban } from 'lucide-react';
import { ethers } from 'ethers';
import { config } from '../../config';
import { type Event } from '../../store/useEventStore';

interface CancelEventModalProps {
  event: Event;
  onClose: () => void;
}

export const CancelEventModal: React.FC<CancelEventModalProps> = ({ event, onClose }) => {
  const [step, setStep] = useState<'confirm' | 'liability' | 'processing' | 'success'>('confirm');
  const [liability, setLiability] = useState<string | null>(null);
  const [isFetchingLiability, setIsFetchingLiability] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchLiability = async () => {
    setIsFetchingLiability(true);
    setError(null);
    try {
      if (!(window as any).ethereum) throw new Error("MetaMask not found");
      const provider = new ethers.BrowserProvider((window as any).ethereum);
      const contract = new ethers.Contract(config.contractAddress, [
        "function eventRefundLiability(uint256) public view returns (uint256)"
      ], provider);
      const eventIdNum = event.id.replace('evt_', '');
      const liabilityWei = await contract.eventRefundLiability(eventIdNum);
      setLiability(ethers.formatEther(liabilityWei));
      setStep('liability');
    } catch (err: any) {
      console.error(err);
      setError("Failed to fetch refund liability.");
    } finally {
      setIsFetchingLiability(false);
    }
  };

  const handleCancel = async () => {
    setStep('processing');
    setError(null);
    try {
      const provider = new ethers.BrowserProvider((window as any).ethereum);
      const signer = await provider.getSigner();
      const contract = new ethers.Contract(config.contractAddress, [
        "function cancelEvent(uint256 eventId) external payable"
      ], signer);
      
      const eventIdNum = event.id.replace('evt_', '');
      const liabilityWei = ethers.parseEther(liability!);
      
      const tx = await contract.cancelEvent(eventIdNum, { value: liabilityWei });
      await tx.wait();
      setStep('success');
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Cancellation failed");
      setStep('liability');
    }
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/90 backdrop-blur-md">
        <motion.div
          initial={{ opacity: 0, scale: 0.9, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9, y: 20 }}
          className="bg-[#0a0a0f] border border-white/10 rounded-[2.5rem] w-full max-w-md overflow-hidden shadow-[0_0_50px_rgba(0,0,0,0.5)]"
        >
          {/* Header */}
          <div className="p-8 pb-4 flex justify-between items-start">
             <div className={`p-4 rounded-2xl ${step === 'success' ? 'bg-green-500/10' : 'bg-red-500/10'} border border-white/5`}>
                {step === 'success' ? <CheckCircle2 className="text-green-400" size={24} /> : <Ban className="text-red-400" size={24} />}
             </div>
             {step !== 'processing' && (
                <button onClick={onClose} className="p-2 hover:bg-white/5 rounded-full transition-all text-white/20 hover:text-white">
                  <X size={20} />
                </button>
             )}
          </div>

          <div className="px-8 pb-8">
            {step === 'confirm' && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
                <div>
                  <h2 className="text-2xl font-black italic tracking-tight text-white mb-2 uppercase">Cancel Event?</h2>
                  <p className="text-sm text-white/40 leading-relaxed font-medium">
                    This will permanently cancel <span className="text-white">"{event.title}"</span>. You must deposit ETH to cover all ticket refunds.
                  </p>
                </div>
                
                <div className="p-4 rounded-2xl bg-orange-500/5 border border-orange-500/20 flex gap-3">
                   <AlertTriangle className="text-orange-400 shrink-0" size={18} />
                   <p className="text-[10px] font-bold text-orange-400/80 uppercase tracking-widest leading-normal">
                      This action is irreversible. All sold tickets will become eligible for immediate full refunds.
                   </p>
                </div>

                <button
                  onClick={fetchLiability}
                  disabled={isFetchingLiability}
                  className="w-full py-4 rounded-2xl bg-white text-black font-black uppercase tracking-widest text-xs flex items-center justify-center gap-2 hover:scale-[1.02] active:scale-[0.98] transition-all shadow-xl"
                >
                  {isFetchingLiability ? <Loader2 className="animate-spin" size={16} /> : <ArrowRight size={16} />}
                  Check Refund Liability
                </button>
              </motion.div>
            )}

            {step === 'liability' && (
              <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-6">
                <div>
                  <h2 className="text-2xl font-black italic tracking-tight text-white mb-2 uppercase">Deposit Required</h2>
                  <p className="text-sm text-white/40 leading-relaxed font-medium">
                    To enable refunds for all ticket holders, you must deposit the following amount:
                  </p>
                </div>

                <div className="p-8 rounded-[2rem] bg-white/[0.03] border border-white/10 text-center">
                   <span className="text-[10px] font-black uppercase tracking-[0.3em] text-white/20 mb-2 block">Total Liability</span>
                   <div className="text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-white to-white/40 italic">
                      {liability} ETH
                   </div>
                </div>

                {error && (
                  <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-[10px] font-bold flex items-center gap-2">
                    <ShieldAlert size={14} />
                    {error}
                  </div>
                )}

                <div className="flex gap-3">
                  <button
                    onClick={() => setStep('confirm')}
                    className="flex-1 py-4 rounded-2xl bg-white/5 border border-white/10 text-white font-black uppercase tracking-widest text-xs hover:bg-white/10 transition-all"
                  >
                    Go Back
                  </button>
                  <button
                    onClick={handleCancel}
                    className="flex-[2] py-4 rounded-2xl bg-orange-500 text-white font-black uppercase tracking-widest text-xs shadow-[0_10px_20px_rgba(249,115,22,0.2)] hover:scale-[1.02] active:scale-[0.98] transition-all"
                  >
                    Confirm & Deposit
                  </button>
                </div>
              </motion.div>
            )}

            {step === 'processing' && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="py-12 flex flex-col items-center justify-center text-center">
                <div className="relative mb-8">
                   <div className="absolute inset-0 bg-orange-500/20 blur-2xl rounded-full" />
                   <Loader2 size={64} className="text-orange-500 animate-spin relative z-10" />
                </div>
                <h3 className="text-xl font-black uppercase tracking-tight italic text-white mb-2">Processing...</h3>
                <p className="text-xs text-white/30 font-bold uppercase tracking-[0.2em]">Executing On-Chain Cancellation</p>
              </motion.div>
            )}

            {step === 'success' && (
              <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="space-y-6 text-center">
                <div className="py-4">
                  <h2 className="text-3xl font-black italic tracking-tighter text-white mb-3 uppercase leading-tight">EVENT<br/>CANCELLED</h2>
                  <p className="text-sm text-white/40 leading-relaxed font-medium">
                    The event has been successfully terminated on the blockchain. All ticket holders can now claim their full refunds.
                  </p>
                </div>

                <button
                  onClick={() => window.location.reload()}
                  className="w-full py-4 rounded-2xl bg-green-500 text-white font-black uppercase tracking-widest text-xs shadow-[0_10px_20px_rgba(34,197,94,0.2)] hover:scale-[1.02] active:scale-[0.98] transition-all"
                >
                  Done
                </button>
              </motion.div>
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

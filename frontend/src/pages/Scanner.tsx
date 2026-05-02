import React, { useEffect, useState, useRef } from 'react';
import { Html5QrcodeScanner } from 'html5-qrcode';
import { ethers } from 'ethers';
import { config } from '../config';
import { motion, AnimatePresence } from 'framer-motion';
import { ShieldAlert, CheckCircle2, Loader2, Camera } from 'lucide-react';
import toast from 'react-hot-toast';
import { useParams } from 'react-router-dom';

export const Scanner: React.FC = () => {
  const { eventId } = useParams<{ eventId: string }>();
  const [scanResult, setScanResult] = useState<any>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [verificationStatus, setVerificationStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const scannerRef = useRef<Html5QrcodeScanner | null>(null);

  useEffect(() => {
    if (!scannerRef.current) {
      scannerRef.current = new Html5QrcodeScanner(
        "reader",
        { fps: 10, qrbox: { width: 250, height: 250 } },
        /* verbose= */ false
      );
      scannerRef.current.render(onScanSuccess, onScanFailure);
    }

    return () => {
      if (scannerRef.current) {
        scannerRef.current.clear().catch(console.error);
        scannerRef.current = null;
      }
    };
  }, []);

  async function onScanSuccess(decodedText: string) {
    if (isVerifying || verificationStatus !== 'idle') return;
    
    try {
      const data = JSON.parse(decodedText);
      if (!data.t || !data.o || !data.n || !data.s) throw new Error("Invalid QR format");
      
      setScanResult(data);
      verifyTicket(data);
    } catch (err) {
      console.error(err);
      toast.error("Invalid ticket QR");
    }
  }

  function onScanFailure() {
    // Quietly fail as it scans constantly
  }

  const verifyTicket = async (data: any) => {
    setIsVerifying(true);
    setVerificationStatus('idle');
    setErrorMsg(null);

    try {
      if (!(window as any).ethereum) throw new Error("MetaMask not found");
      const provider = new ethers.BrowserProvider((window as any).ethereum);
      
      const contract = new ethers.Contract(config.contractAddress, [
        "function ownerOf(uint256) public view returns (address)",
        "function usedTickets(uint256) public view returns (bool)",
        "function validateTicketEntry(uint256, address) external",
        "function fetchEventData(uint256) public view returns (address organiser, uint8 royaltyBps)",
        "function tokenToEvent(uint256) public view returns (uint256)",
        "function eventScanners(uint256, address) public view returns (bool)"
      ], provider);

      // 1. Check expiration (5 minutes = 300 seconds)
      const now = Math.floor(Date.now() / 1000);
      if (now - data.ts > 300) {
        throw new Error("QR Code has expired (valid for 5 mins)");
      }

      // 2. Event Match Check: Ensure ticket is for THIS event
      if (data.e !== eventId) {
        throw new Error(`Ticket is for a different event (${data.e}). Access Denied.`);
      }

      // 3. Recompute message and verify signature
      const message = `Authorize Entry\nToken ID: ${data.t}\nEvent ID: ${data.e}\nNonce: ${data.n}\nTimestamp: ${data.ts}`;
      const recoveredAddress = ethers.verifyMessage(message, data.s);

      if (recoveredAddress.toLowerCase() !== data.o.toLowerCase()) {
        throw new Error("Signature verification failed");
      }

      // 2. Check current owner on-chain
      const currentOwner = await contract.ownerOf(data.t);
      if (currentOwner.toLowerCase() !== recoveredAddress.toLowerCase()) {
        throw new Error("Signer is no longer the owner of this ticket");
      }

      // 3. Check if already used
      const isUsed = await contract.usedTickets(data.t);
      if (isUsed) {
        throw new Error("Ticket has already been used for entry");
      }

      // 4. On-chain validation (requires current signer to be the organizer)
      const signer = await provider.getSigner();
      const scannerAddress = await signer.getAddress();
      
      // Fetch event organiser to pre-verify
      const numericEventId = parseInt(eventId?.replace('evt_', '') || '0', 10);
      const eventData = await contract.fetchEventData(numericEventId);
      
      if (eventData.organiser.toLowerCase() !== scannerAddress.toLowerCase()) {
        // Double check authorized scanners mapping
        const isAuthorizedScanner = await contract.eventScanners(numericEventId, scannerAddress);
        if (!isAuthorizedScanner) {
          throw new Error("Not authorized: You are not the organizer of this event.");
        }
      }

      const contractWithSigner = contract.connect(signer) as any;
      
      console.log("Submitting validation for Token:", data.t, "Attendee:", data.o);
      const tx = await contractWithSigner.validateTicketEntry(data.t, data.o);
      await tx.wait();

      setVerificationStatus('success');
      toast.success("Access Granted!");
    } catch (err: any) {
      console.error("Verification Error:", err);
      setVerificationStatus('error');
      
      // Extract revert reason if possible
      let friendlyMsg = "Verification failed";
      
      const msg = err.message || "";
      if (msg.includes("Already used") || msg.includes("already been used")) {
        friendlyMsg = "Ticket has already been used for entry";
      } else if (msg.includes("Not authorized") || msg.includes("not authorized")) {
        friendlyMsg = "You are not authorized to scan for this event. Please use the organizer's wallet.";
      } else if (msg.includes("Cancelled") || msg.includes("cancelled")) {
        friendlyMsg = "This event has been cancelled. Ticket is invalid.";
      } else if (err.message?.includes("Refunded")) {
        friendlyMsg = "This ticket has been refunded and is no longer valid.";
      } else if (err.reason) {
        friendlyMsg = err.reason;
      } else if (err.message) {
        // Handle common ethers error structures
        if (err.message.includes("execution reverted")) {
          friendlyMsg = "Transaction reverted on-chain. The ticket may have already been used.";
        } else {
          friendlyMsg = err.message.split('(')[0].trim(); // Get the main error message
        }
      }
      
      setErrorMsg(friendlyMsg);
      toast.error("Access Denied");
    } finally {
      setIsVerifying(false);
    }
  };

  const resetScanner = () => {
    setScanResult(null);
    setVerificationStatus('idle');
    setErrorMsg(null);
  };

  return (
    <div className="min-h-screen bg-[#050505] text-white pt-24 pb-12 px-4">
      <div className="max-w-xl mx-auto space-y-8">
        <div className="text-center space-y-2">
          <h1 className="text-4xl font-black italic tracking-tighter uppercase">Gate Scanner</h1>
          <div className="flex items-center justify-center gap-2">
             <p className="text-[10px] font-black uppercase tracking-[0.4em] text-[var(--accent-teal)]">Event: {eventId}</p>
          </div>
        </div>

        <div className="relative glass-panel rounded-[2.5rem] border border-white/5 overflow-hidden bg-white/[0.02]">
          <div id="reader" className="w-full"></div>
          
          <AnimatePresence>
            {(isVerifying || verificationStatus !== 'idle') && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-md p-8"
              >
                <div className="w-full space-y-8 text-center">
                  {isVerifying ? (
                    <div className="space-y-6">
                      <div className="relative w-24 h-24 mx-auto">
                        <div className="absolute inset-0 bg-[var(--accent-teal)]/20 blur-2xl rounded-full animate-pulse" />
                        <Loader2 size={96} className="text-[var(--accent-teal)] animate-spin relative z-10" />
                      </div>
                      <div className="space-y-2">
                        <h3 className="text-2xl font-black italic uppercase">Verifying...</h3>
                        <p className="text-[10px] font-bold uppercase tracking-widest text-white/30">Checking Cryptographic Signature & Ownership</p>
                      </div>
                    </div>
                  ) : verificationStatus === 'success' ? (
                    <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} className="space-y-6">
                      <div className="w-24 h-24 bg-green-500/20 rounded-full flex items-center justify-center mx-auto border border-green-500/50">
                        <CheckCircle2 size={64} className="text-green-400" />
                      </div>
                      <div className="space-y-2">
                        <h3 className="text-3xl font-black italic uppercase text-green-400">ACCESS GRANTED</h3>
                        <p className="text-xs font-bold uppercase tracking-widest text-white/50">Token ID #{scanResult?.t} Validated</p>
                      </div>
                      <button
                        onClick={resetScanner}
                        className="w-full py-4 rounded-2xl bg-green-500 text-black font-black uppercase tracking-widest text-xs shadow-[0_10px_30px_rgba(34,197,94,0.3)] hover:scale-[1.02] active:scale-[0.98] transition-all"
                      >
                        Scan Next
                      </button>
                    </motion.div>
                  ) : (
                    <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} className="space-y-6">
                      <div className="w-24 h-24 bg-red-500/20 rounded-full flex items-center justify-center mx-auto border border-red-500/50">
                        <ShieldAlert size={64} className="text-red-400" />
                      </div>
                      <div className="space-y-2">
                        <h3 className="text-3xl font-black italic uppercase text-red-400">ACCESS DENIED</h3>
                        <p className="text-xs font-bold text-red-400/60 max-w-[250px] mx-auto uppercase tracking-tighter">{errorMsg}</p>
                      </div>
                      <button
                        onClick={resetScanner}
                        className="w-full py-4 rounded-2xl bg-white/10 border border-white/20 text-white font-black uppercase tracking-widest text-xs hover:bg-white/20 transition-all"
                      >
                        Try Again
                      </button>
                    </motion.div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="p-6 rounded-[2rem] bg-white/[0.03] border border-white/10 flex items-start gap-4">
           <div className="p-3 bg-white/5 rounded-2xl text-white/40">
              <Camera size={20} />
           </div>
           <div className="space-y-1">
              <p className="text-xs font-black uppercase tracking-wider">Instructions</p>
              <p className="text-[10px] text-white/30 leading-relaxed font-medium">
                 Position the ticket QR code within the frame. The system will automatically verify the owner's signature against on-chain data and the ticket's one-time use status. Only organizers can mark tickets as used.
              </p>
           </div>
        </div>
      </div>
    </div>
  );
};

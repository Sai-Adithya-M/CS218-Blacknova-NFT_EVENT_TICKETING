/**
 * IPFS Upload Utilities via Pinata
 * Uploads files to IPFS and converts CIDs to gateway URLs for display.
 */

const PINATA_JWT = import.meta.env.VITE_PINATA_JWT;

/**
 * Ordered list of public IPFS gateways.
 * We include multiple gateways to ensure high availability and speed.
 */
export const IPFS_GATEWAYS = [
  'https://gateway.pinata.cloud/ipfs',
  'https://cloudflare-ipfs.com/ipfs',
  'https://ipfs.io/ipfs',
  'https://nftstorage.link/ipfs',
  'https://dweb.link/ipfs',
  'https://w3s.link/ipfs',
  'https://4everland.io/ipfs',
  'https://cf-ipfs.com/ipfs',
  'https://storry.tv/ipfs',
  'https://gateway.ipfs.io/ipfs',
];

export const FALLBACK_IMG = 'https://images.unsplash.com/photo-1492684223066-81342ee5ff30?auto=format&fit=crop&q=80';

/**
 * Robustly extract a CID from various formats:
 */
export function extractCid(url?: string): string | null {
  if (!url) return null;
  
  const pathMatch = url.match(/\/ipfs\/([a-zA-Z0-9]+)/);
  if (pathMatch) return pathMatch[1];

  if (url.startsWith('ipfs://')) return url.replace('ipfs://', '').trim();

  const trimmed = url.trim();
  if (trimmed.startsWith('Qm') || trimmed.startsWith('ba') || (trimmed.startsWith('b') && trimmed.length > 30)) {
    return trimmed;
  }

  return null;
}

/**
 * Races multiple gateways to fetch content from IPFS.
 * Uses a staggered approach to avoid unnecessary network load while ensuring speed.
 */
export async function fetchFromIPFS(
  cidOrUrl: string, 
  options: { json?: boolean, timeout?: number, returnUrl?: boolean } = {}
): Promise<any> {
  const cid = extractCid(cidOrUrl);
  if (!cid) {
    console.warn('[IPFS] No CID found in:', cidOrUrl);
    return null;
  }

  const { json = true, timeout = 20000, returnUrl = false } = options;
  console.log(`[IPFS] Starting fetch for CID: ${cid} (ReturnUrl: ${returnUrl})`);

  const controller = new AbortController();
  const timer = setTimeout(() => {
    console.log(`[IPFS] Global timeout reached for CID: ${cid}`);
    controller.abort();
  }, timeout);

  const attemptGateway = async (baseUrl: string) => {
    const url = `${baseUrl}/${cid}`;
    const start = Date.now();
    
    try {
      // For probing (returnUrl: true), we try a very lightweight check.
      // We use GET with a short timeout and potentially a Range header.
      const response = await fetch(url, { 
        signal: controller.signal,
        method: returnUrl ? 'GET' : 'GET', // Stick to GET for maximum compatibility
        headers: returnUrl ? { 'Range': 'bytes=0-0' } : {}
      });

      if (!response.ok) {
        throw new Error(`Status ${response.status}`);
      }
      
      const duration = Date.now() - start;
      console.log(`[IPFS] ✅ Gateway success: ${baseUrl} (${duration}ms)`);
      
      if (returnUrl) {
        return url;
      }
      
      const data = json ? await response.json() : response;
      return data;
    } catch (e: any) {
      if (e.name === 'AbortError') {
        // Silent failure for aborted requests
      } else {
        console.warn(`[IPFS] ❌ Gateway failed: ${baseUrl} (${e.message})`);
      }
      throw e;
    }
  };


  // Staggered Tiers: Try fast ones immediately, then expand
  const tiers = [
    IPFS_GATEWAYS.slice(0, 4), // Aggressive first tier
    IPFS_GATEWAYS.slice(4, 7),
    IPFS_GATEWAYS.slice(7),
  ];

  try {
    const allPromises = [
      ...tiers[0].map(gw => attemptGateway(gw)),
      ...tiers[1].map(gw => new Promise((_, rej) => {
        const t = setTimeout(() => {
          attemptGateway(gw).then(_).catch(rej);
        }, 500);
        controller.signal.addEventListener('abort', () => clearTimeout(t));
      })),
      ...tiers[2].map(gw => new Promise((_, rej) => {
        const t = setTimeout(() => {
          attemptGateway(gw).then(_).catch(rej);
        }, 1500);
        controller.signal.addEventListener('abort', () => clearTimeout(t));
      })),
    ];

    const result = await Promise.any(allPromises);
    clearTimeout(timer);
    
    // Once one succeeds, abort all others to save bandwidth
    controller.abort();
    
    return result;
  } catch (error) {
    clearTimeout(timer);
    console.error(`[IPFS] 🛑 All gateways failed for CID: ${cid}`);
    return null;
  }
}




/**
 * Upload a file to IPFS using Pinata's pinning API.
 */
export async function uploadToIPFS(file: File): Promise<string> {
  if (!PINATA_JWT) {
    throw new Error('Pinata JWT not configured. Set VITE_PINATA_JWT in your .env file.');
  }

  const formData = new FormData();
  formData.append('file', file);

  const metadata = JSON.stringify({
    name: `netix-event-${Date.now()}-${file.name}`,
  });
  formData.append('pinataMetadata', metadata);

  const res = await fetch('https://api.pinata.cloud/pinning/pinFileToIPFS', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${PINATA_JWT}`,
    },
    body: formData,
  });

  if (!res.ok) {
    const errBody = await res.text();
    console.error('Pinata upload failed:', errBody);
    throw new Error(`IPFS upload failed (${res.status})`);
  }

  const data = await res.json();
  return data.IpfsHash;
}

/**
 * Upload JSON metadata to IPFS using Pinata.
 */
export async function uploadJSONToIPFS(jsonData: any): Promise<string> {
  if (!PINATA_JWT) {
    throw new Error('Pinata JWT not configured. Set VITE_PINATA_JWT in your .env file.');
  }

  const res = await fetch('https://api.pinata.cloud/pinning/pinJSONToIPFS', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${PINATA_JWT}`,
    },
    body: JSON.stringify({
      pinataOptions: { cidVersion: 1 },
      pinataMetadata: { name: `netix-event-${Date.now()}.json` },
      pinataContent: jsonData,
    }),
  });

  if (!res.ok) {
    const errBody = await res.text();
    console.error('Pinata JSON upload failed:', errBody);
    throw new Error(`IPFS JSON upload failed (${res.status})`);
  }

  const data = await res.json();
  return data.IpfsHash;
}

/**
 * Convert an IPFS CID or URL to a prioritized HTTP gateway URL.
 */
export function ipfsToHttpUrl(cidOrUrl: string): string {
  if (!cidOrUrl) return '';
  const cid = extractCid(cidOrUrl);
  if (!cid) return cidOrUrl;
  return `${IPFS_GATEWAYS[0]}/${cid}`;
}


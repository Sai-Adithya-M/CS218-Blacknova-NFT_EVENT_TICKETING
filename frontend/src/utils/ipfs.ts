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
// In-memory cache for in-flight requests to prevent duplicate network calls
const inFlightRequests = new Map<string, Promise<any>>();

/**
 * Races multiple gateways to fetch content from IPFS.
 */
export async function fetchFromIPFS(
  cidOrUrl: string, 
  options: { json?: boolean, timeout?: number, returnUrl?: boolean } = {}
): Promise<any> {
  const cid = extractCid(cidOrUrl);
  if (!cid) return null;

  const { json = true, timeout = 20000, returnUrl = false } = options;

  // 1. Check LocalStorage Cache (only for JSON metadata)
  if (json && !returnUrl) {
    const cached = localStorage.getItem(`ipfs_cache_${cid}`);
    if (cached) {
      try {
        return JSON.parse(cached);
      } catch (e) {
        localStorage.removeItem(`ipfs_cache_${cid}`);
      }
    }
  }

  // 2. Check In-Flight Requests
  const requestKey = `${cid}_${json}_${returnUrl}`;
  if (inFlightRequests.has(requestKey)) {
    return inFlightRequests.get(requestKey);
  }

  const fetchPromise = (async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);

    const attemptGateway = async (baseUrl: string) => {
      const url = `${baseUrl}/${cid}`;
      try {
        const response = await fetch(url, { 
          signal: controller.signal,
          headers: returnUrl ? { 'Range': 'bytes=0-0' } : {}
        });

        if (!response.ok) throw new Error(`Status ${response.status}`);
        
        if (returnUrl) return url;
        
        const data = json ? await response.json() : response;
        
        // Cache successful JSON responses
        if (json && !returnUrl && data) {
          localStorage.setItem(`ipfs_cache_${cid}`, JSON.stringify(data));
        }
        
        return data;
      } catch (e: any) {
        throw e;
      }
    };

    const tiers = [
      IPFS_GATEWAYS.slice(0, 3), 
      IPFS_GATEWAYS.slice(3, 6),
      IPFS_GATEWAYS.slice(6),
    ];

    try {
      const allPromises = [
        ...tiers[0].map(gw => attemptGateway(gw)),
        ...tiers[1].map(gw => new Promise((res, rej) => {
          setTimeout(() => attemptGateway(gw).then(res).catch(rej), 800);
        })),
        ...tiers[2].map(gw => new Promise((res, rej) => {
          setTimeout(() => attemptGateway(gw).then(res).catch(rej), 2000);
        })),
      ];

      const result = await Promise.any(allPromises);
      clearTimeout(timer);
      controller.abort();
      return result;
    } catch (error) {
      clearTimeout(timer);
      return null;
    } finally {
      inFlightRequests.delete(requestKey);
    }
  })();

  inFlightRequests.set(requestKey, fetchPromise);
  return fetchPromise;
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


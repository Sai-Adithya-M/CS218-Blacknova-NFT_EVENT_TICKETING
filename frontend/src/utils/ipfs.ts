/**
 * IPFS Upload Utilities via Pinata
 * Uploads files to IPFS and converts CIDs to gateway URLs for display.
 */

const PINATA_JWT = import.meta.env.VITE_PINATA_JWT;

/**
 * CORS-verified public IPFS gateways (all return Access-Control-Allow-Origin: *).
 * Ordered by reliability / speed.
 */
export const IPFS_GATEWAYS = [
  'https://gateway.pinata.cloud/ipfs',   // Pinata — CORS ✅, fastest for pinned content
  'https://ipfs.io/ipfs',                // Protocol Labs — CORS ✅
  'https://nftstorage.link/ipfs',        // NFT.Storage — CORS ✅
  'https://cloudflare-ipfs.com/ipfs',    // Cloudflare — CORS ✅
  'https://dweb.link/ipfs',              // Protocol Labs dweb — CORS ✅
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
  if (!cid) return null;

  const { json = true, timeout = 25000, returnUrl = false } = options;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  const attemptGateway = async (baseUrl: string) => {
    const url = `${baseUrl}/${cid}`;
    // Build headers — add Pinata JWT if hitting Pinata's gateway
    const headers: HeadersInit = {};
    if (baseUrl.includes('pinata.cloud') && PINATA_JWT) {
      headers['Authorization'] = `Bearer ${PINATA_JWT}`;
    }
    try {
      const method = returnUrl ? 'HEAD' : 'GET';
      const response = await fetch(url, { 
        signal: controller.signal,
        method,
        mode: 'cors',   // Explicit CORS mode — drops non-CORS responses cleanly
        headers,
      });
      if (!response.ok) throw new Error(`Gateway ${baseUrl} returned ${response.status}`);
      
      if (returnUrl) return url;
      const data = json ? await response.json() : response;
      return data;
    } catch (e) {
      if (returnUrl) {
        // Some gateways block HEAD; fall back to GET for probing
        try {
          const retryRes = await fetch(url, { signal: controller.signal, mode: 'cors', headers });
          if (retryRes.ok) return url;
        } catch { }
      }
      throw e;
    }
  };


  // Tier 0: Pinata + ipfs.io — tried immediately (fastest, CORS guaranteed)
  // Tier 1: nftstorage + cloudflare — staggered 600ms
  // Tier 2: dweb.link — staggered 2.5s fallback
  const tiers = [
    IPFS_GATEWAYS.slice(0, 2),
    IPFS_GATEWAYS.slice(2, 4),
    IPFS_GATEWAYS.slice(4),
  ];

  try {
    const allPromises = [
      ...tiers[0].map(gw => attemptGateway(gw)),
      ...tiers[1].map(gw => new Promise(r => setTimeout(r, 600)).then(() => attemptGateway(gw))),
      ...tiers[2].map(gw => new Promise(r => setTimeout(r, 2500)).then(() => attemptGateway(gw))),
    ];

    const result = await Promise.any(allPromises);
    clearTimeout(timer);
    return result;
  } catch (error) {
    clearTimeout(timer);
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


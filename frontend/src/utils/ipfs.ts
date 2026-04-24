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
  'https://ipfs.io/ipfs',
  'https://nftstorage.link/ipfs',
  'https://cloudflare-ipfs.com/ipfs',
  'https://dweb.link/ipfs',
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
  if (!cid) return null;

  const { json = true, timeout = 25000, returnUrl = false } = options;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  const attemptGateway = async (baseUrl: string) => {
    const url = `${baseUrl}/${cid}`;
    try {
      const response = await fetch(url, { 
        signal: controller.signal,
        method: returnUrl ? 'HEAD' : 'GET' 
      });
      if (!response.ok) throw new Error('Gateway failed');
      
      if (returnUrl) return url;
      
      const data = json ? await response.json() : response;
      return data;
    } catch (e) {
      if (returnUrl) {
         // Some gateways don't support HEAD, fallback to GET for probing
         try {
           const retryRes = await fetch(url, { signal: controller.signal });
           if (retryRes.ok) return url;
         } catch(err) {}
      }
      throw e;
    }
  };


  // Staggered Tiers: Try fast ones immediately, then expand if they take too long
  const tiers = [
    IPFS_GATEWAYS.slice(0, 3), // Aggressive first tier
    IPFS_GATEWAYS.slice(3, 6),
    IPFS_GATEWAYS.slice(6),
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


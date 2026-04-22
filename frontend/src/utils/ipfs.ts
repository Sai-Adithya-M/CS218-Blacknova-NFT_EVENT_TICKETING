/**
 * IPFS Upload Utilities via Pinata
 * Uploads files to IPFS and converts CIDs to gateway URLs for display.
 */

const PINATA_JWT = import.meta.env.VITE_PINATA_JWT;

/**
 * Ordered list of public IPFS gateways.
 * We prioritize dweb.link and cloudflare as they are generally more reliable for browsers.
 */
export const IPFS_GATEWAYS = [
  'https://gateway.pinata.cloud/ipfs',
  'https://cloudflare-ipfs.com/ipfs',
  'https://dweb.link/ipfs',
  'https://ipfs.io/ipfs',
];

export const FALLBACK_IMG = 'https://images.unsplash.com/photo-1492684223066-81342ee5ff30?auto=format&fit=crop&q=80';

/**
 * Robustly extract a CID from various formats:
 * - Full gateway URL: https://cloudflare-ipfs.com/ipfs/Qm...
 * - Protocol URL: ipfs://Qm...
 * - Raw CID: Qm...
 */
export function extractCid(url?: string): string | null {
  if (!url) return null;
  
  // Case 1: CID is part of a URL path (e.g., /ipfs/Qm...)
  const pathMatch = url.match(/\/ipfs\/([a-zA-Z0-9]+)/);
  if (pathMatch) return pathMatch[1];

  // Case 2: protocol format (ipfs://Qm...)
  if (url.startsWith('ipfs://')) return url.replace('ipfs://', '').trim();

  // Case 3: Raw CID (starts with Qm or ba)
  if (url.startsWith('Qm') || url.startsWith('ba')) return url.trim();

  return null;
}

/**
 * Upload a file to IPFS using Pinata's pinning API.
 * Returns the IPFS CID (Content Identifier) string.
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
 * Convert an IPFS CID or URL to a prioritized HTTP gateway URL.
 */
export function ipfsToHttpUrl(cidOrUrl: string): string {
  if (!cidOrUrl) return '';
  const cid = extractCid(cidOrUrl);
  if (!cid) return cidOrUrl; // Return as-is if it's already a URL or we can't parse it
  return `${IPFS_GATEWAYS[0]}/${cid}`;
}

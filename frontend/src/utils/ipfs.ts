/**
 * IPFS Upload Utilities via Pinata
 * Uploads files to IPFS and converts CIDs to gateway URLs for display.
 */

const PINATA_JWT = import.meta.env.VITE_PINATA_JWT;

/**
 * Ordered list of public IPFS gateways (most reliable first).
 * Pinata's public gateway is rate-limited, so we prefer Cloudflare & dweb.link.
 */
const IPFS_GATEWAYS = [
  'https://cloudflare-ipfs.com/ipfs',
  'https://dweb.link/ipfs',
  'https://ipfs.io/ipfs',
  'https://gateway.pinata.cloud/ipfs',
];

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

  // Optional: add metadata for easier identification in Pinata dashboard
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
  return data.IpfsHash; // e.g. "QmX7bF3..."
}

/**
 * Convert an IPFS CID to a publicly accessible HTTP gateway URL.
 * Uses the most reliable gateway (Cloudflare) as default.
 */
export function ipfsToHttpUrl(cid: string): string {
  if (!cid || cid.trim() === '') return '';
  // If it's already a full URL, return as-is
  if (cid.startsWith('http')) return cid;
  // Strip ipfs:// prefix if present
  const cleanCid = cid.replace('ipfs://', '').trim();
  if (!cleanCid) return '';
  return `${IPFS_GATEWAYS[0]}/${cleanCid}`;
}

/**
 * Get all possible gateway URLs for a CID (for fallback purposes).
 */
export function getGatewayUrls(cid: string): string[] {
  if (!cid || cid.trim() === '') return [];
  const cleanCid = cid.replace('ipfs://', '').trim();
  if (!cleanCid) return [];
  return IPFS_GATEWAYS.map(gw => `${gw}/${cleanCid}`);
}

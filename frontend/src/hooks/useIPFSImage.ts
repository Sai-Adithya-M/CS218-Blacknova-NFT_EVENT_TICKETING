import { useState, useEffect } from 'react';
import { extractCid, IPFS_GATEWAYS, FALLBACK_IMG } from '../utils/ipfs';

// In-memory cache for resolved gateway URLs
const resolvedCache: Record<string, string> = {};

export function useIPFSImage(ipfsUrl?: string | null) {
  const [src, setSrc] = useState<string>(FALLBACK_IMG);
  const [loading, setLoading] = useState<boolean>(true);
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    if (!ipfsUrl) {
      setSrc(FALLBACK_IMG);
      setLoading(false);
      return;
    }

    const cid = extractCid(ipfsUrl);
    if (!cid) {
      setSrc(ipfsUrl || FALLBACK_IMG);
      setLoading(false);
      return;
    }

    if (resolvedCache[cid]) {
      setSrc(resolvedCache[cid]);
      setLoading(false);
      return;
    }

    setLoading(true);
    let isMounted = true;

    const urls = IPFS_GATEWAYS.map(gw => `${gw}/${cid}`);

    // Race first 3 gateways for speed
    const promises = urls.slice(0, 3).map(url => {
      return new Promise<string>((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(url);
        img.onerror = () => reject(url);
        img.src = url;
        // 10 second timeout for image loading
        setTimeout(() => reject(url), 10000);
      });
    });

    Promise.any(promises)
      .then(fastestUrl => {
        if (isMounted) {
          resolvedCache[cid] = fastestUrl;
          setSrc(fastestUrl);
          setLoading(false);
        }
      })
      .catch(() => {
        if (isMounted) {
          // If all fail, we show fallback but schedule a retry
          setSrc(FALLBACK_IMG);
          setLoading(false);
          
          // Retry in 30 seconds if it's a new image (propagation delay)
          setTimeout(() => {
            if (isMounted) setRetryCount(prev => prev + 1);
          }, 30000);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [ipfsUrl, retryCount]);

  return { src, loading };
}

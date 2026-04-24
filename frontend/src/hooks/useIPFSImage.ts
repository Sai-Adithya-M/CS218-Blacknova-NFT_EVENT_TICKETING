import { useState, useEffect } from 'react';
import { extractCid, FALLBACK_IMG, fetchFromIPFS } from '../utils/ipfs';

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

    fetchFromIPFS(cid, { returnUrl: true, timeout: 20000 })
      .then(fastestUrl => {
        if (isMounted && fastestUrl) {
          resolvedCache[cid] = fastestUrl;
          setSrc(fastestUrl);
          setLoading(false);
        } else if (isMounted) {
          // If it returns null, treat as failure
          throw new Error('Failed to fetch image');
        }
      })
      .catch(() => {
        if (isMounted) {
          setSrc(FALLBACK_IMG);
          setLoading(false);
          
          // Retry faster initially, then slower
          const nextRetry = retryCount < 3 ? 5000 : 30000;
          setTimeout(() => {
            if (isMounted) setRetryCount(prev => prev + 1);
          }, nextRetry);
        }
      });


    return () => {
      isMounted = false;
    };
  }, [ipfsUrl, retryCount]);

  return { src, loading };
}

import { useState, useEffect } from 'react';
import { extractCid, FALLBACK_IMG, fetchFromIPFS } from '../utils/ipfs';

// Persistent cache for resolved gateway URLs using localStorage
const CACHE_KEY = 'netix_ipfs_cache_v1';

const getCache = (): Record<string, string> => {
  try {
    const cached = localStorage.getItem(CACHE_KEY);
    return cached ? JSON.parse(cached) : {};
  } catch {
    return {};
  }
};

const setCache = (cid: string, url: string) => {
  try {
    const cache = getCache();
    cache[cid] = url;
    // Keep cache size reasonable (e.g., last 100 entries)
    const keys = Object.keys(cache);
    if (keys.length > 100) {
      delete cache[keys[0]];
    }
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch (e) {
    console.warn('Failed to save IPFS cache', e);
  }
};

const invalidateCache = (cid: string) => {
  try {
    const cache = getCache();
    delete cache[cid];
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
    console.log(`[useIPFSImage] Cache invalidated for CID: ${cid}`);
  } catch (e) {}
};

export function useIPFSImage(ipfsUrl?: string | null) {
  const [src, setSrc] = useState<string>(FALLBACK_IMG);
  const [loading, setLoading] = useState<boolean>(true);
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    let isMounted = true;
    
    const handleFailure = (cid?: string) => {
      if (!isMounted) return;
      console.warn(`[useIPFSImage] Failed to load image for: ${ipfsUrl}`);
      setSrc(FALLBACK_IMG);
      setLoading(false);
      
      if (cid) invalidateCache(cid);

      // Exponential backoff for retries
      const delay = Math.min(1000 * Math.pow(2, retryCount), 30000);
      const timer = setTimeout(() => {
        if (isMounted) {
          console.log(`[useIPFSImage] Retrying... (Attempt ${retryCount + 1})`);
          setRetryCount(prev => prev + 1);
        }
      }, delay);
      return () => clearTimeout(timer);
    };

    if (!ipfsUrl) {
      setSrc(FALLBACK_IMG);
      setLoading(false);
      return;
    }

    const cid = extractCid(ipfsUrl);
    if (!cid) {
      if (ipfsUrl.startsWith('http')) {
        setSrc(ipfsUrl);
        setLoading(false);
      } else {
        setSrc(FALLBACK_IMG);
        setLoading(false);
      }
      return;
    }

    const cache = getCache();
    if (cache[cid]) {
      console.log(`[useIPFSImage] Cache hit for CID: ${cid} -> ${cache[cid]}`);
      // Optimistically set the cached URL
      setSrc(cache[cid]);
      setLoading(false);

      // Verify cached URL still works (background check)
      fetch(cache[cid], { method: 'HEAD', mode: 'no-cors' })
        .catch(() => {
          console.warn(`[useIPFSImage] Cached URL failed verification, re-discovering...`);
          invalidateCache(cid);
          // Don't update UI immediately, let discovery handle it if needed
        });
      return;
    }

    console.log(`[useIPFSImage] Discovering gateway for CID: ${cid}...`);
    setLoading(true);

    fetchFromIPFS(cid, { returnUrl: true, timeout: 15000 })
      .then(fastestUrl => {
        if (isMounted && fastestUrl) {
          console.log(`[useIPFSImage] Successfully resolved CID: ${cid} to ${fastestUrl}`);
          setCache(cid, fastestUrl);
          setSrc(fastestUrl);
          setLoading(false);
        } else if (isMounted) {
          handleFailure(cid);
        }
      })
      .catch(() => {
        handleFailure(cid);
      });

    return () => {
      isMounted = false;
    };
  }, [ipfsUrl, retryCount]);

  return { src, loading };
}

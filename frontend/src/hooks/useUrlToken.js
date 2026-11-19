import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

/**
 * Reads the one-time `?token=` from an emailed link (verify, reset) once, then drops it from
 * the address bar so it doesn't stay in history, bookmarks or a copied URL. Other query
 * params and the hash are kept.
 * @returns {string|null}
 */
export function useUrlToken() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [token] = useState(() => searchParams.get('token'));

  useEffect(() => {
    if (!searchParams.has('token')) return;
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      next.delete('token');
      return next;
    }, { replace: true });
  }, [searchParams, setSearchParams]);

  return token;
}

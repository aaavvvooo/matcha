import { useEffect, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';

/**
 * Reads the one-time `?token=` from an emailed link (verify, reset) once, then drops it from
 * the address bar so it doesn't stay in history, bookmarks or a copied URL.
 * @returns {string|null}
 */
export function useUrlToken() {
  const [searchParams] = useSearchParams();
  const [token] = useState(() => searchParams.get('token'));
  const { pathname } = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    if (searchParams.has('token')) navigate(pathname, { replace: true });
  }, [searchParams, pathname, navigate]);

  return token;
}

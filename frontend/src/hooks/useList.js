import { useCallback, useEffect, useRef, useState } from 'react';

/** Loads a list. A failed load is the 'error' state, never an empty list.
 * @param {() => Promise<object[]>} load  memoize it; null waits (stays 'loading')
 * @returns {{items: object[], setItems: Function, state: 'loading'|'ready'|'error', reload: () => void}} */
export function useList(load) {
  const [items, setItems] = useState([]);
  const [state, setState] = useState('loading');
  // Only the latest request may answer (reload, unmount, changed `load`).
  const requestRef = useRef(0);

  const reload = useCallback(() => {
    const request = ++requestRef.current;
    if (!load) return;
    setState('loading');
    load()
      .then(data => {
        if (request !== requestRef.current) return;
        setItems(data);
        setState('ready');
      })
      .catch(() => {
        if (request === requestRef.current) setState('error');
      });
  }, [load]);

  useEffect(() => {
    reload();
    return () => { requestRef.current += 1; };
  }, [reload]);

  return { items, setItems, state, reload };
}

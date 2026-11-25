import { createContext, useContext, useLayoutEffect, useState } from 'react';

// Two contexts: a page only needs the setter, so it does not re-render with the header.
const PageHeaderContext = createContext(null);
const SetPageHeaderContext = createContext(() => {});

export function HeaderProvider({ children }) {
  const [pageHeader, setPageHeader] = useState(null);
  return (
    <SetPageHeaderContext.Provider value={setPageHeader}>
      <PageHeaderContext.Provider value={pageHeader}>{children}</PageHeaderContext.Provider>
    </SetPageHeaderContext.Provider>
  );
}

export const usePageHeaderConfig = () => useContext(PageHeaderContext);

/** Puts the page's title, back button and tools in the site header.
 * @param {undefined | null | {title: string, titleNode?: React.ReactNode, phoneTitle?: boolean,
 *   onBack?: () => void, tools?: React.ReactNode, overlay?: boolean, solid?: boolean}} config
 *   Memoize it; undefined leaves the header to another component. `titleNode` replaces the plain
 *   title. `phoneTitle: false` keeps the brand on phones. `tools` show on desktop only. On phones
 *   `overlay` lays the header over the page: transparent, with the brand, until `solid`. */
export function usePageHeader(config) {
  const setPageHeader = useContext(SetPageHeaderContext);
  useLayoutEffect(() => {
    if (config === undefined) return undefined;
    setPageHeader(config);
    return () => setPageHeader(null);
  }, [config, setPageHeader]);
}

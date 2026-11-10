import { useEffect } from 'react';

// A file dropped anywhere the page doesn't handle makes the browser navigate to it
// (leaving the app). While mounted, cancel dragover/drop for file drags window-wide;
// drop zones still receive their own events first and set their own dropEffect.
export function useBlockFileDrops() {
  useEffect(() => {
    const hasFiles = (e) => Array.from(e.dataTransfer?.types || []).includes('Files');
    const onDragOver = (e) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      if (!(e.target instanceof Element && e.target.closest('.photo-dropzone'))) {
        e.dataTransfer.dropEffect = 'none';
      }
    };
    const onDrop = (e) => {
      if (hasFiles(e)) e.preventDefault();
    };
    window.addEventListener('dragover', onDragOver);
    window.addEventListener('drop', onDrop);
    return () => {
      window.removeEventListener('dragover', onDragOver);
      window.removeEventListener('drop', onDrop);
    };
  }, []);
}

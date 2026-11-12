import { useRef, useState, useId } from 'react';
import { checkPhotoFiles, PHOTO_ACCEPT } from '../../utils/photoFiles';
import { useBlockFileDrops } from '../../hooks/useBlockFileDrops';

/**
 * Drag-and-drop (native HTML5) or click/keyboard file picker for photos.
 * Validates type/size/count for UX and reports `onFiles(accepted)` and
 * `onErrors(messages)`; the server re-validates everything.
 */
export default function PhotoDropZone({
  onFiles,
  onErrors,
  slots,
  disabled = false,
  multiple = true,
  busy = false,
  children,
  style,
  label = 'Add photos',
}) {
  const inputRef = useRef(null);
  const depth = useRef(0);
  const [over, setOver] = useState(false);
  const hintId = useId();
  const inactive = disabled || busy || slots <= 0;
  useBlockFileDrops();

  function handle(fileList) {
    const files = Array.from(fileList || []);
    if (!files.length) return;
    const { accepted, errors } = checkPhotoFiles(files, multiple ? slots : Math.min(slots, 1));
    // Accepted files first: onFiles handlers reset the message area, which would wipe the
    // rejections of a mixed drop (some files fine, some not) if they were reported before.
    if (accepted.length) onFiles(accepted);
    onErrors?.(errors);
  }

  function open() {
    if (!inactive) inputRef.current?.click();
  }

  const hasFiles = (e) => Array.from(e.dataTransfer?.types || []).includes('Files');

  return (
    <div
      role="button"
      tabIndex={inactive ? -1 : 0}
      aria-label={label}
      aria-describedby={hintId}
      aria-disabled={inactive}
      aria-busy={busy}
      onClick={open}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          open();
        }
      }}
      // Always cancel file drags (even when inactive): otherwise the browser would
      // navigate to the dropped file. An inactive zone just shows the "no drop" cursor.
      onDragEnter={(e) => {
        if (!hasFiles(e)) return;
        e.preventDefault();
        if (inactive) return;
        depth.current += 1;
        setOver(true);
      }}
      onDragOver={(e) => {
        if (!hasFiles(e)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = inactive ? 'none' : 'copy';
      }}
      onDragLeave={(e) => {
        if (inactive || !hasFiles(e)) return;
        depth.current = Math.max(0, depth.current - 1);
        if (depth.current === 0) setOver(false);
      }}
      onDrop={(e) => {
        if (!hasFiles(e)) return;
        e.preventDefault();
        depth.current = 0;
        setOver(false);
        if (!inactive) handle(e.dataTransfer.files);
      }}
      className="photo-dropzone"
      style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        gap: 4, textAlign: 'center', padding: 14,
        borderRadius: 'var(--r-sm)',
        background: over ? 'var(--cream2)' : 'var(--cream)',
        border: `1.5px dashed ${over ? 'var(--spice)' : 'var(--sand)'}`,
        color: 'var(--ink3)', fontSize: 13,
        cursor: busy ? 'wait' : inactive ? 'default' : 'pointer',
        opacity: inactive && !busy ? 0.6 : 1,
        transition: 'var(--transition-base)',
        ...style,
      }}
    >
      {children}
      <span id={hintId} style={{ fontSize: 11, color: 'var(--ink4)' }}>
        JPEG, PNG or WebP, up to 5 MB each
      </span>
      <input
        ref={inputRef}
        type="file"
        accept={PHOTO_ACCEPT}
        multiple={multiple}
        tabIndex={-1}
        aria-hidden="true"
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => {
          handle(e.target.files);
          e.target.value = '';
        }}
        style={{ display: 'none' }}
        disabled={inactive}
      />
    </div>
  );
}

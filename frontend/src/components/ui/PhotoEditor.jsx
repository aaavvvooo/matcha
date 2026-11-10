import { useEffect, useRef, useState, useCallback, useId } from 'react';
import { RotateCcw, RotateCw } from 'lucide-react';
import Btn from './Btn';
import Chip from './Chip';
import { fetchPhotoBlob } from '../../api/profilesApi';
import { apiError } from '../../api/errors';
import {
  FILTERS, ASPECTS, PREVIEW_SIDE,
  rotatedSize, drawRotated, applyAdjustments, exportEdited,
} from '../../utils/photoEdit';

const FULL = { x: 0, y: 0, w: 1, h: 1 };
const MIN = 0.08; // smallest crop edge, as a fraction of the image
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// Largest centred crop with the given pixel aspect ratio (null = whole image).
function fitCrop(ratio, w, h) {
  if (!ratio) return FULL;
  const imageRatio = w / h;
  if (imageRatio > ratio) {
    const cw = ratio / imageRatio;
    return { x: (1 - cw) / 2, y: 0, w: cw, h: 1 };
  }
  const ch = imageRatio / ratio;
  return { x: 0, y: (1 - ch) / 2, w: 1, h: ch };
}

/**
 * Crop / rotate / filter modal. `source` is either { file } (a file about to be
 * uploaded) or { url } (an existing photo, fetched as a Blob through the API
 * client so the canvas is never tainted). `onSave(file)` receives the edited
 * JPEG; the editor stays open and shows the error if it rejects.
 */
export default function PhotoEditor({ source, title = 'Edit photo', saveLabel = 'Save', onSave, onCancel }) {
  const titleId = useId();
  const dialogRef = useRef(null);
  const canvasRef = useRef(null);
  const overlayRef = useRef(null);
  const dragRef = useRef(null);
  const imgRef = useRef(null);

  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [rot, setRot] = useState(0);
  const [aspect, setAspect] = useState('free');
  const [crop, setCrop] = useState(FULL);
  const [filter, setFilter] = useState('none');
  const [brightness, setBrightness] = useState(1);
  const [contrast, setContrast] = useState(1);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);

  const ratio = ASPECTS.find(a => a.id === aspect)?.ratio ?? null;

  // Load the source into an <img>. The object URL is revoked as soon as the
  // image has decoded and again on unmount.
  useEffect(() => {
    let cancelled = false;
    let objectUrl = null;
    (async () => {
      try {
        const blob = source.file ?? (await fetchPhotoBlob(source.url));
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        const img = new Image();
        img.src = objectUrl;
        await img.decode();
        if (cancelled) return;
        imgRef.current = img;
        setLoaded(true);
      } catch {
        if (!cancelled) setLoadError('Could not open this image for editing');
      } finally {
        if (objectUrl) URL.revokeObjectURL(objectUrl);
      }
    })();
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
    // The source is fixed for the lifetime of the modal.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Redraw the preview (whole rotated image with filters; the crop is an overlay).
  useEffect(() => {
    const img = imgRef.current;
    const canvas = canvasRef.current;
    if (!loaded || !img || !canvas) return;
    const dims = rotatedSize(img, rot, PREVIEW_SIDE);
    canvas.width = dims.w;
    canvas.height = dims.h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, dims.w, dims.h);
    drawRotated(ctx, img, rot, dims);
    applyAdjustments(ctx, dims.w, dims.h, { filter, brightness, contrast });
  }, [loaded, rot, filter, brightness, contrast]);

  const imageDims = useCallback(() => {
    const img = imgRef.current;
    return img ? rotatedSize(img, rot, PREVIEW_SIDE) : { w: 1, h: 1 };
  }, [rot]);

  function rotate(step) {
    const next = (rot + step + 4) % 4;
    setRot(next);
    const img = imgRef.current;
    const w = next % 2 ? img.naturalHeight : img.naturalWidth;
    const h = next % 2 ? img.naturalWidth : img.naturalHeight;
    setCrop(fitCrop(ratio, w, h)); // crop coordinates belong to the rotated image
  }

  function chooseAspect(id) {
    setAspect(id);
    const { w, h } = imageDims();
    setCrop(fitCrop(ASPECTS.find(a => a.id === id)?.ratio ?? null, w, h));
  }

  // ---- crop box: pointer events (mouse, touch, pen) ----
  function startDrag(e, mode) {
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    const rect = overlayRef.current.getBoundingClientRect();
    dragRef.current = { mode, rect, startX: e.clientX, startY: e.clientY, start: crop };
  }

  function onDrag(e) {
    const d = dragRef.current;
    if (!d) return;
    const dx = (e.clientX - d.startX) / d.rect.width;
    const dy = (e.clientY - d.startY) / d.rect.height;
    const s = d.start;
    if (d.mode === 'move') {
      setCrop({ ...s, x: clamp(s.x + dx, 0, 1 - s.w), y: clamp(s.y + dy, 0, 1 - s.h) });
      return;
    }
    // Resize from a corner: the opposite corner stays fixed.
    const left = d.mode.includes('w');
    const top = d.mode.includes('n');
    const ax = left ? s.x + s.w : s.x;
    const ay = top ? s.y + s.h : s.y;
    const px = clamp((left ? s.x : s.x + s.w) + dx, 0, 1);
    const py = clamp((top ? s.y : s.y + s.h) + dy, 0, 1);
    let nw = Math.abs(px - ax);
    let nh = Math.abs(py - ay);
    if (ratio) {
      const { w, h } = imageDims();
      const hPerW = w / h / ratio; // normalised height for a normalised width
      nw = Math.min(nw, nh / hPerW);
      nh = nw * hPerW;
    }
    if (nw < MIN || nh < MIN) return;
    setCrop({ x: px < ax ? ax - nw : ax, y: py < ay ? ay - nh : ay, w: nw, h: nh });
  }

  function endDrag() {
    dragRef.current = null;
  }

  // Keyboard alternative for the crop box: arrows move, +/- resize.
  function onCropKey(e) {
    const step = e.shiftKey ? 0.05 : 0.01;
    const moves = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    if (moves[e.key]) {
      e.preventDefault();
      const [mx, my] = moves[e.key];
      setCrop(c => ({ ...c, x: clamp(c.x + mx, 0, 1 - c.w), y: clamp(c.y + my, 0, 1 - c.h) }));
    } else if (e.key === '+' || e.key === '=' || e.key === '-') {
      e.preventDefault();
      const f = e.key === '-' ? 0.95 : 1 / 0.95;
      setCrop(c => {
        const nw = clamp(c.w * f, MIN, 1);
        const nh = clamp(c.h * f, MIN, 1);
        const k = Math.min(nw / c.w, nh / c.h); // keeps the aspect ratio intact
        const w = c.w * k;
        const h = c.h * k;
        return {
          x: clamp(c.x + (c.w - w) / 2, 0, 1 - w),
          y: clamp(c.y + (c.h - h) / 2, 0, 1 - h),
          w, h,
        };
      });
    }
  }

  async function handleSave() {
    if (saving) return;
    setSaving(true);
    setSaveError(null);
    try {
      const file = await exportEdited(imgRef.current, { rot, crop, filter, brightness, contrast });
      if (!file) {
        setSaveError('Could not export the edited photo — try a smaller crop');
        return;
      }
      await onSave(file);
    } catch (err) {
      setSaveError(apiError(err, 'Could not save the edited photo — try again'));
    } finally {
      setSaving(false);
    }
  }

  // Dialog behaviour: focus on open, Esc closes, Tab stays inside, focus restored after.
  useEffect(() => {
    const previous = document.activeElement;
    dialogRef.current?.focus();
    return () => {
      if (previous && typeof previous.focus === 'function') previous.focus();
    };
  }, []);

  function onDialogKey(e) {
    if (e.key === 'Escape' && !saving) {
      e.stopPropagation();
      onCancel();
    } else if (e.key === 'Tab') {
      const focusable = dialogRef.current.querySelectorAll(
        'button:not([disabled]), input:not([disabled]), [tabindex="0"]'
      );
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  }

  const handle = (mode, cursor, pos) => (
    <div
      onPointerDown={e => startDrag(e, mode)}
      onPointerMove={onDrag}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      style={{
        position: 'absolute', width: 28, height: 28, touchAction: 'none', cursor,
        ...pos,
      }}
    >
      <div style={{
        position: 'absolute', width: 14, height: 14, background: '#fff',
        border: '2px solid var(--spice)', borderRadius: 3,
        left: 7, top: 7,
      }}/>
    </div>
  );

  const label = { display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--ink2)', marginBottom: 6 };

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 3000, background: 'rgba(0,0,0,0.6)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 8,
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onKeyDown={onDialogKey}
        style={{
          background: 'var(--white)', borderRadius: 'var(--r-md)', boxShadow: 'var(--shadow-lg)',
          width: '100%', maxWidth: 520, maxHeight: '100%', display: 'flex', flexDirection: 'column',
          outline: 'none',
        }}
      >
        <div id={titleId} style={{
          padding: '14px 16px', fontFamily: 'var(--font-display)', fontStyle: 'italic',
          fontSize: 20, fontWeight: 600, color: 'var(--ink)', borderBottom: '1.5px solid var(--cream3)',
        }}>{title}</div>

        <div style={{ flex: 1, overflow: 'auto', padding: 16, minHeight: 0 }}>
          {loadError ? (
            <div className="error-msg" role="alert">{loadError}</div>
          ) : !loaded ? (
            <div role="status" style={{ textAlign: 'center', color: 'var(--ink3)', padding: 32 }}>Loading photo…</div>
          ) : (
            <>
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 14 }}>
                <div style={{ position: 'relative', lineHeight: 0, maxWidth: '100%', background: 'var(--cream2)' }}>
                  <canvas
                    ref={canvasRef}
                    role="img"
                    aria-label="Photo preview"
                    style={{ display: 'block', maxWidth: '100%', maxHeight: '45vh', width: 'auto', height: 'auto' }}
                  />
                  <div ref={overlayRef} style={{ position: 'absolute', inset: 0, overflow: 'hidden', touchAction: 'none' }}>
                    <div
                      tabIndex={0}
                      role="group"
                      aria-label="Crop area. Arrow keys move it, plus and minus resize it."
                      onKeyDown={onCropKey}
                      onPointerDown={e => startDrag(e, 'move')}
                      onPointerMove={onDrag}
                      onPointerUp={endDrag}
                      onPointerCancel={endDrag}
                      style={{
                        position: 'absolute',
                        left: `${crop.x * 100}%`, top: `${crop.y * 100}%`,
                        width: `${crop.w * 100}%`, height: `${crop.h * 100}%`,
                        boxShadow: '0 0 0 9999px rgba(0,0,0,0.5)',
                        border: '2px solid #fff', boxSizing: 'border-box',
                        cursor: 'move', touchAction: 'none',
                      }}
                    >
                      {handle('nw', 'nwse-resize', { left: -14, top: -14 })}
                      {handle('ne', 'nesw-resize', { right: -14, top: -14 })}
                      {handle('sw', 'nesw-resize', { left: -14, bottom: -14 })}
                      {handle('se', 'nwse-resize', { right: -14, bottom: -14 })}
                    </div>
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
                <Btn variant="secondary" onClick={() => rotate(-1)} style={{ padding: '8px 14px', fontSize: 13 }}>
                  <RotateCcw size={15} aria-hidden="true"/> Rotate left
                </Btn>
                <Btn variant="secondary" onClick={() => rotate(1)} style={{ padding: '8px 14px', fontSize: 13 }}>
                  <RotateCw size={15} aria-hidden="true"/> Rotate right
                </Btn>
              </div>

              <div style={{ marginBottom: 14 }}>
                <div style={label}>Crop shape</div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {ASPECTS.map(a => (
                    <Chip key={a.id} label={a.label} active={aspect === a.id} onClick={() => chooseAspect(a.id)}/>
                  ))}
                </div>
              </div>

              <div style={{ marginBottom: 14 }}>
                <div style={label}>Filter</div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {FILTERS.map(f => (
                    <Chip key={f.id} label={f.label} active={filter === f.id} onClick={() => setFilter(f.id)}/>
                  ))}
                </div>
              </div>

              <label style={{ display: 'block', marginBottom: 10 }}>
                <span style={label}>Brightness</span>
                <input
                  type="range" min="0.5" max="1.5" step="0.05" value={brightness}
                  onChange={e => setBrightness(Number(e.target.value))}
                  style={{ width: '100%', display: 'block' }}
                />
              </label>
              <label style={{ display: 'block' }}>
                <span style={label}>Contrast</span>
                <input
                  type="range" min="0.5" max="1.5" step="0.05" value={contrast}
                  onChange={e => setContrast(Number(e.target.value))}
                  style={{ width: '100%', display: 'block' }}
                />
              </label>
            </>
          )}

          {saveError && <div className="error-msg" role="alert" style={{ marginTop: 12 }}>{saveError}</div>}
        </div>

        <div style={{
          display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap',
          padding: '12px 16px', borderTop: '1.5px solid var(--cream3)',
        }}>
          <Btn variant="secondary" onClick={onCancel} disabled={saving} style={{ padding: '10px 20px' }}>Cancel</Btn>
          <Btn onClick={handleSave} disabled={!loaded || saving} style={{ padding: '10px 20px' }}>
            {saving ? 'Saving…' : saveLabel}
          </Btn>
        </div>
      </div>
    </div>
  );
}

// Canvas helpers for the photo editor. Pixel filters are done by hand (not
// ctx.filter) so they behave the same in every browser.
import { MAX_PHOTO_BYTES } from './photoFiles';

export const MAX_EDIT_SIDE = 2048; // longest side of an exported photo
export const PREVIEW_SIDE = 800;   // longest side of the on-screen preview

export const FILTERS = [
  { id: 'none', label: 'Original' },
  { id: 'grayscale', label: 'Grayscale' },
  { id: 'sepia', label: 'Sepia' },
];

export const ASPECTS = [
  { id: 'free', label: 'Free', ratio: null },
  { id: '1:1', label: '1:1', ratio: 1 },
  { id: '4:5', label: '4:5', ratio: 4 / 5 },
  { id: '3:4', label: '3:4', ratio: 3 / 4 },
];

/** Size of the source after scaling to fit `maxSide` and rotating by rot * 90 degrees. */
export function rotatedSize(img, rot, maxSide) {
  const s = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.max(1, Math.round(img.naturalWidth * s));
  const h = Math.max(1, Math.round(img.naturalHeight * s));
  return { scale: s, iw: w, ih: h, w: rot % 2 ? h : w, h: rot % 2 ? w : h };
}

/** Draw the rotated image into ctx, offset so (cropX, cropY) lands at the canvas origin. */
export function drawRotated(ctx, img, rot, dims, cropX = 0, cropY = 0) {
  ctx.save();
  ctx.translate(-cropX, -cropY);
  ctx.translate(dims.w / 2, dims.h / 2);
  ctx.rotate((rot * Math.PI) / 2);
  ctx.drawImage(img, -dims.iw / 2, -dims.ih / 2, dims.iw, dims.ih);
  ctx.restore();
}

/** In-place grayscale / sepia / brightness / contrast on a canvas. */
export function applyAdjustments(ctx, width, height, { filter, brightness, contrast }) {
  if (filter === 'none' && brightness === 1 && contrast === 1) return;
  const image = ctx.getImageData(0, 0, width, height);
  const d = image.data;
  for (let i = 0; i < d.length; i += 4) {
    let r = d[i];
    let g = d[i + 1];
    let b = d[i + 2];
    if (filter === 'grayscale') {
      r = g = b = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    } else if (filter === 'sepia') {
      const nr = 0.393 * r + 0.769 * g + 0.189 * b;
      const ng = 0.349 * r + 0.686 * g + 0.168 * b;
      const nb = 0.272 * r + 0.534 * g + 0.131 * b;
      r = nr; g = ng; b = nb;
    }
    d[i] = (r * brightness - 128) * contrast + 128;
    d[i + 1] = (g * brightness - 128) * contrast + 128;
    d[i + 2] = (b * brightness - 128) * contrast + 128;
  }
  ctx.putImageData(image, 0, 0);
}

function toBlob(canvas, type, quality) {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

/**
 * Render the cropped, rotated, filtered result as a JPEG File under the 5 MB cap.
 * `crop` is normalised (0..1) relative to the rotated image. Returns null if the
 * browser cannot encode.
 */
export async function exportEdited(img, { rot, crop, filter, brightness, contrast }) {
  let side = MAX_EDIT_SIDE;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const dims = rotatedSize(img, rot, side);
    const cx = Math.round(crop.x * dims.w);
    const cy = Math.round(crop.y * dims.h);
    const cw = Math.max(1, Math.min(dims.w - cx, Math.round(crop.w * dims.w)));
    const ch = Math.max(1, Math.min(dims.h - cy, Math.round(crop.h * dims.h)));
    const canvas = document.createElement('canvas');
    canvas.width = cw;
    canvas.height = ch;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    ctx.fillStyle = '#fff'; // JPEG has no alpha: flatten transparent PNG/WebP onto white
    ctx.fillRect(0, 0, cw, ch);
    drawRotated(ctx, img, rot, dims, cx, cy);
    applyAdjustments(ctx, cw, ch, { filter, brightness, contrast });
    for (const quality of [0.9, 0.8, 0.65]) {
      const blob = await toBlob(canvas, 'image/jpeg', quality);
      if (!blob) return null;
      if (blob.size <= MAX_PHOTO_BYTES) {
        return new File([blob], `edited-${Date.now()}.jpg`, { type: 'image/jpeg' });
      }
    }
    side = Math.round(Math.max(cw, ch) * 0.75); // still too big: shrink and retry
  }
  return null;
}

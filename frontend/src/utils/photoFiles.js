// Client-side pre-checks for photo uploads. UX only: the server re-validates
// magic bytes, size and the photo cap and is the authority.
export const MAX_PHOTOS = 5;
export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
export const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
export const PHOTO_ACCEPT = PHOTO_TYPES.join(',');

/**
 * Split files into accepted and rejected (with a human message per rejection).
 * `slots` is how many more photos may still be added.
 */
export function checkPhotoFiles(files, slots) {
  const accepted = [];
  const errors = [];
  for (const file of files) {
    if (!PHOTO_TYPES.includes(file.type)) {
      errors.push(`${file.name}: only JPEG, PNG and WebP images are allowed`);
    } else if (file.size > MAX_PHOTO_BYTES) {
      errors.push(`${file.name}: file size must not exceed 5 MB`);
    } else if (file.size === 0) {
      errors.push(`${file.name}: the file is empty`);
    } else if (accepted.length >= slots) {
      errors.push(`${file.name}: you can have at most ${MAX_PHOTOS} photos`);
    } else {
      accepted.push(file);
    }
  }
  return { accepted, errors };
}

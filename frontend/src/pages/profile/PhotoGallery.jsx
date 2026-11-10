import { useState, useRef, useEffect } from 'react';
import { ChevronLeft, ChevronRight, Pencil, X } from 'lucide-react';
import Btn from '../../components/ui/Btn';
import PhotoDropZone from '../../components/ui/PhotoDropZone';
import PhotoEditor from '../../components/ui/PhotoEditor';
import {
  getMyProfile, uploadPhoto, deletePhotos, setProfilePic, reorderPhotos,
} from '../../api/profilesApi';
import { apiError } from '../../api/errors';
import { MAX_PHOTOS } from '../../utils/photoFiles';

const TILE = 72;
const iconBtn = {
  flex: 1, height: 28, minWidth: 0, padding: 0, border: '1px solid var(--sand)',
  background: 'var(--cream2)', color: 'var(--ink2)', borderRadius: 'var(--r-xs)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
};

let nextStagedId = 1;

/**
 * Photo gallery for the profile edit page: drag-and-drop / click upload, a
 * "ready to upload" tray (where photos can be edited first), drag-to-reorder
 * with move buttons as the keyboard/touch fallback, and editing of existing photos.
 *
 * Editing an existing photo produces a NEW image that goes through the normal
 * upload endpoint and then replaces the old one (see uploadItem).
 */
export default function PhotoGallery({ photos, onPhotosChange, onOpen, onDelete }) {
  const [staged, setStaged] = useState([]); // { id, file, url, replaces?, error? }
  const [editing, setEditing] = useState(null); // { staged: item } | { photo }
  const [messages, setMessages] = useState([]);
  const [busy, setBusy] = useState(false); // uploading or reordering
  const [dragId, setDragId] = useState(null);
  const [overId, setOverId] = useState(null);
  const [announce, setAnnounce] = useState('');

  const photosRef = useRef(photos);
  photosRef.current = photos;
  const stagedRef = useRef(staged);
  stagedRef.current = staged;

  // Object URLs for the tray are revoked when removed and when the page unmounts.
  useEffect(() => () => stagedRef.current.forEach(s => URL.revokeObjectURL(s.url)), []);

  const plainStaged = staged.filter(s => !s.replaces).length;
  const slots = MAX_PHOTOS - photos.length - plainStaged;

  function stage(files, replaces) {
    setStaged(list => [
      ...list,
      ...files.map(file => ({ id: nextStagedId++, file, url: URL.createObjectURL(file), replaces })),
    ]);
  }

  function unstage(id) {
    setStaged(list => {
      const item = list.find(s => s.id === id);
      if (item) URL.revokeObjectURL(item.url);
      return list.filter(s => s.id !== id);
    });
  }

  async function refreshPhotos() {
    try {
      const fresh = await getMyProfile();
      photosRef.current = fresh.photos || [];
      onPhotosChange(photosRef.current);
    } catch {
      /* keep what we have; the next action will resync */
    }
  }

  // ---- upload tray ----
  async function uploadItem(item) {
    const current = photosRef.current;
    const old = item.replaces ? current.find(p => p.id === item.replaces) : null;
    const oldIdx = old ? current.findIndex(p => p.id === old.id) : -1;
    const full = current.length >= MAX_PHOTOS;
    if (!old && full) throw new Error(`You can have at most ${MAX_PHOTOS} photos`);

    // At the cap there is no room for the new image until the old one is gone, so it
    // goes first. Otherwise the original stays until the edited copy is safely saved.
    let deletedOld = false;
    if (old && full) {
      await deletePhotos([old.id]);
      deletedOld = true;
    }
    const created = (await uploadPhoto([item.file]))[0];
    if (!created) return 'duplicate'; // identical image already in the gallery

    if (!old && current.length === 0) await setProfilePic(created.id);
    if (old?.is_main) await setProfilePic(created.id);
    if (old && deletedOld) {
      const ids = current.filter(p => p.id !== old.id).map(p => p.id);
      ids.splice(oldIdx, 0, created.id);
      await reorderPhotos(ids);
    } else if (old) {
      const ids = current.map(p => (p.id === old.id ? created.id : p.id));
      ids.push(old.id);
      await reorderPhotos(ids);
      await deletePhotos([old.id]);
    }
    return 'ok';
  }

  async function uploadAll() {
    if (busy) return;
    setBusy(true);
    setMessages([]);
    const problems = [];
    for (const item of stagedRef.current) {
      try {
        const result = await uploadItem(item);
        if (result === 'duplicate') problems.push(`${item.file.name}: this photo is already in your gallery`);
        unstage(item.id);
        await refreshPhotos(); // next item must see the new gallery
      } catch (err) {
        problems.push(`${item.file.name}: ${apiError(err, err?.message || 'upload failed')}`);
        setStaged(list => list.map(s => (s.id === item.id ? { ...s, error: true } : s)));
        // A failed call can leave the gallery changed (e.g. old photo already removed).
        await refreshPhotos();
        break;
      }
    }
    await refreshPhotos();
    setMessages(problems);
    setBusy(false);
  }

  // ---- reorder ----
  async function commitOrder(next, movedId) {
    if (busy) return;
    const before = photosRef.current;
    onPhotosChange(next);
    setBusy(true);
    setMessages([]);
    try {
      const saved = await reorderPhotos(next.map(p => p.id));
      onPhotosChange(saved);
      setAnnounce(`Photo moved to position ${saved.findIndex(p => p.id === movedId) + 1} of ${saved.length}`);
    } catch (err) {
      onPhotosChange(before);
      setMessages([apiError(err, 'Could not save the new photo order — try again')]);
    } finally {
      setBusy(false);
    }
  }

  function move(index, delta) {
    const target = index + delta;
    if (target < 0 || target >= photos.length) return;
    const next = [...photos];
    const [item] = next.splice(index, 1);
    next.splice(target, 0, item);
    commitOrder(next, item.id);
  }

  function dropOn(targetId) {
    const from = photos.findIndex(p => p.id === dragId);
    const to = photos.findIndex(p => p.id === targetId);
    setDragId(null);
    setOverId(null);
    if (from < 0 || to < 0 || from === to) return;
    const next = [...photos];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    commitOrder(next, item.id);
  }

  // ---- editor ----
  function saveEdit(file) {
    if (editing.staged) {
      const old = editing.staged;
      URL.revokeObjectURL(old.url);
      setStaged(list => list.map(s => (
        s.id === old.id ? { ...s, file, url: URL.createObjectURL(file), error: false } : s
      )));
    } else {
      stage([file], editing.photo.id);
    }
    setEditing(null);
  }

  const editorSource = editing && (editing.staged ? { file: editing.staged.file } : { url: editing.photo.url });

  return (
    <div>
      <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--ink2)', marginBottom: 12 }}>
        Photos <span style={{ color: 'var(--ink4)', fontWeight: 400 }}>({photos.length}/{MAX_PHOTOS})</span>
      </div>

      {photos.length > 0 && (
        <ul style={{
          listStyle: 'none', margin: 0, padding: 0, display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12,
        }}>
          {photos.map((photo, i) => (
            <li
              key={photo.id}
              className={`photo-tile${dragId === photo.id ? ' dragging' : ''}${overId === photo.id && dragId !== photo.id ? ' drop-target' : ''}`}
              draggable={!busy}
              onDragStart={e => {
                setDragId(photo.id);
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', String(photo.id));
              }}
              onDragEnd={() => { setDragId(null); setOverId(null); }}
              onDragOver={e => {
                if (dragId === null) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                if (overId !== photo.id) setOverId(photo.id);
              }}
              onDrop={e => {
                if (dragId === null) return;
                e.preventDefault();
                dropOn(photo.id);
              }}
              style={{ width: TILE }}
            >
              <div style={{ position: 'relative', width: TILE, height: TILE }}>
                <button
                  type="button"
                  className="photo-tile-btn photo-thumb"
                  onClick={() => onOpen(photo)}
                  aria-label={`View photo ${i + 1}${photo.is_main ? ' (profile picture)' : ''}`}
                  style={{
                    width: TILE, height: TILE, padding: 0, borderRadius: 'var(--r-sm)',
                    background: `url(${photo.url}) center/cover`,
                    border: `1.5px solid ${photo.is_main ? 'var(--spice)' : 'var(--clay)'}`,
                    cursor: 'inherit',
                  }}
                />
                {photo.is_main && (
                  <div aria-hidden="true" style={{
                    position: 'absolute', bottom: 3, right: 3, width: 10, height: 10, borderRadius: '50%',
                    background: 'var(--spice)', border: '1.5px solid #fff',
                  }}/>
                )}
                <button
                  type="button"
                  className="photo-tile-btn"
                  onClick={() => onDelete(photo.id)}
                  aria-label={`Delete photo ${i + 1}`}
                  style={{
                    position: 'absolute', top: -6, right: -6, width: 22, height: 22, borderRadius: '50%',
                    background: 'var(--rose)', border: 'none', color: '#fff', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
                  }}
                ><X size={12} aria-hidden="true"/></button>
              </div>
              <div style={{ display: 'flex', gap: 2, marginTop: 4 }}>
                <button
                  type="button" className="photo-tile-btn" style={{ ...iconBtn, opacity: i === 0 || busy ? 0.4 : 1 }}
                  disabled={i === 0 || busy} onClick={() => move(i, -1)}
                  aria-label={`Move photo ${i + 1} left`}
                ><ChevronLeft size={14} aria-hidden="true"/></button>
                <button
                  type="button" className="photo-tile-btn" style={iconBtn}
                  onClick={() => setEditing({ photo })}
                  aria-label={`Edit photo ${i + 1}`}
                ><Pencil size={13} aria-hidden="true"/></button>
                <button
                  type="button" className="photo-tile-btn"
                  style={{ ...iconBtn, opacity: i === photos.length - 1 || busy ? 0.4 : 1 }}
                  disabled={i === photos.length - 1 || busy} onClick={() => move(i, 1)}
                  aria-label={`Move photo ${i + 1} right`}
                ><ChevronRight size={14} aria-hidden="true"/></button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {photos.length > 1 && (
        <div style={{ fontSize: 11, color: 'var(--ink4)', marginBottom: 12 }}>
          Drag photos or use the arrows to reorder. The dotted photo stays your profile picture.
        </div>
      )}

      {staged.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--ink2)', marginBottom: 6 }}>Ready to upload</div>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {staged.map(item => (
              <li key={item.id} style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: 6,
                border: `1.5px solid ${item.error ? 'var(--rose)' : 'var(--cream3)'}`, borderRadius: 'var(--r-sm)',
              }}>
                <div style={{
                  width: 44, height: 44, flexShrink: 0, borderRadius: 'var(--r-xs)',
                  background: `url(${item.url}) center/cover`,
                }}/>
                <div style={{ flex: 1, minWidth: 0, fontSize: 12, color: 'var(--ink2)' }}>
                  <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.file.name}</div>
                  {item.replaces && <div style={{ color: 'var(--ink4)' }}>Replaces an existing photo</div>}
                </div>
                <button
                  type="button" className="photo-tile-btn" style={{ ...iconBtn, flex: '0 0 32px' }}
                  disabled={busy} onClick={() => setEditing({ staged: item })}
                  aria-label={`Edit ${item.file.name}`}
                ><Pencil size={13} aria-hidden="true"/></button>
                <button
                  type="button" className="photo-tile-btn" style={{ ...iconBtn, flex: '0 0 32px' }}
                  disabled={busy} onClick={() => unstage(item.id)}
                  aria-label={`Remove ${item.file.name} from the upload list`}
                ><X size={13} aria-hidden="true"/></button>
              </li>
            ))}
          </ul>
          <Btn onClick={uploadAll} disabled={busy} style={{ marginTop: 8, padding: '9px 20px', fontSize: 14 }}>
            {busy ? 'Uploading…' : staged.some(s => s.error) ? 'Retry upload' : `Upload ${staged.length} photo${staged.length > 1 ? 's' : ''}`}
          </Btn>
        </div>
      )}

      {slots > 0 && (
        <PhotoDropZone
          slots={slots}
          busy={busy}
          onFiles={files => { setMessages([]); stage(files); }}
          onErrors={errs => { if (errs.length) setMessages(errs); }}
          label="Add photos: drop files here or press Enter to browse"
        >
          <span style={{ fontSize: 20, color: 'var(--sand)', lineHeight: 1 }} aria-hidden="true">+</span>
          <span>Drop photos here or click to browse</span>
        </PhotoDropZone>
      )}
      {slots <= 0 && photos.length >= MAX_PHOTOS && staged.length === 0 && (
        <div style={{ fontSize: 12, color: 'var(--ink4)' }}>
          You have {MAX_PHOTOS} photos. Delete one to add another, or edit a photo to replace it.
        </div>
      )}

      {messages.length > 0 && (
        <div className="error-msg" role="alert" style={{ marginTop: 10 }}>
          {messages.map((m, i) => <div key={i}>{m}</div>)}
        </div>
      )}
      <div role="status" aria-live="polite" style={{
        position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)',
      }}>{announce}</div>

      {editing && (
        <PhotoEditor
          source={editorSource}
          title={editing.staged ? 'Edit before uploading' : 'Edit photo'}
          saveLabel={editing.staged ? 'Apply edits' : 'Save as replacement'}
          onSave={saveEdit}
          onCancel={() => setEditing(null)}
        />
      )}
    </div>
  );
}

import client from './client'

export const setProfile = (data) => client.post('/profile/set', data).then(r => r.data)
export const getMyProfile = () => client.get('/profile/get').then(r => r.data)
export const updateProfile = (data) => client.patch('/profile/update', data).then(r => r.data)
export const getAllTags = () => client.get('/profile/get-all-tags').then(r => r.data)
export const browse = (params) => client.get('/profiles/browse', { params }).then(r => r.data)
export const search = (params) => client.get('/profiles/search', { params }).then(r => r.data)
// Users inside a viewport box; positions come back snapped to a ~2 km grid. `signal` aborts a stale request.
export const getMapUsers = (params, signal) => client.get('/profiles/map', { params, signal }).then(r => r.data)
export const uploadPhoto = (files) => {
  const form = new FormData()
  const arr = Array.isArray(files) ? files : [files]
  arr.forEach(f => form.append('files', f))
  return client.post('/profile/upload-photo', form, { headers: { 'Content-Type': 'multipart/form-data' } }).then(r => r.data)
}
export const deletePhotos = (photo_ids) => client.delete('/profile/delete-photos', { data: { photo_ids } }).then(r => r.data)
export const setProfilePic = (photo_id) => client.post('/profile/set-profpic', { photo_id }).then(r => r.data)
export const setLocation = (data) => client.patch('/profile/location', data).then(r => r.data)
// Replace one of the caller's photos with a new image in a single atomic request:
// the new image takes the old one's position and profile-picture status, and the
// original is removed only if the replacement is saved.
export const replacePhoto = (file, replaces) => {
  const form = new FormData()
  form.append('files', file)
  form.append('replaces', String(replaces))
  return client.post('/profile/upload-photo', form, { headers: { 'Content-Type': 'multipart/form-data' } }).then(r => r.data[0])
}
export const reorderPhotos = (photo_ids) => client.patch('/profile/photo-order', { photo_ids }).then(r => r.data)
// Photos are served cross-origin (API origin != app origin), so a canvas drawn from an
// <img src=url> would be tainted and toBlob would throw. Fetching the bytes through the
// API client gives a Blob that is same-origin to the page and safe to draw and export.
export const fetchPhotoBlob = (url) => client.get(url, { responseType: 'blob' }).then(r => r.data)

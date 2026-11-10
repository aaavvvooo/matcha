import client from './client'

export const setProfile = (data) => client.post('/profile/set', data).then(r => r.data)
export const getMyProfile = () => client.get('/profile/get').then(r => r.data)
export const updateProfile = (data) => client.patch('/profile/update', data).then(r => r.data)
export const getAllTags = () => client.get('/profile/get-all-tags').then(r => r.data)
export const browse = (params) => client.get('/profiles/browse', { params }).then(r => r.data)
export const search = (params) => client.get('/profiles/search', { params }).then(r => r.data)
export const uploadPhoto = (files) => {
  const form = new FormData()
  const arr = Array.isArray(files) ? files : [files]
  arr.forEach(f => form.append('files', f))
  return client.post('/profile/upload-photo', form, { headers: { 'Content-Type': 'multipart/form-data' } }).then(r => r.data)
}
export const deletePhotos = (photo_ids) => client.delete('/profile/delete-photos', { data: { photo_ids } }).then(r => r.data)
export const setProfilePic = (photo_id) => client.post('/profile/set-profpic', { photo_id }).then(r => r.data)
export const setLocation = (data) => client.patch('/profile/location', data).then(r => r.data)
export const reorderPhotos = (photo_ids) => client.patch('/profile/photo-order', { photo_ids }).then(r => r.data)
// Photos are served cross-origin (API origin != app origin), so a canvas drawn from an
// <img src=url> would be tainted and toBlob would throw. Fetching the bytes through the
// API client gives a Blob that is same-origin to the page and safe to draw and export.
export const fetchPhotoBlob = (url) => client.get(url, { responseType: 'blob' }).then(r => r.data)

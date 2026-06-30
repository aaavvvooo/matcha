import client from './client'

export const setProfile = (data) => client.post('/profile/set', data).then(r => r.data)
export const getMyProfile = (userId) => client.get('/profile/get', { params: { user_id: userId } }).then(r => r.data)
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

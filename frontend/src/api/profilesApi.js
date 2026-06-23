import client from './client'

export const setProfile = (data) => client.post('/profile/set', data).then(r => r.data)
export const getMyProfile = (userId) => client.get('/profile/get', { params: { user_id: userId } }).then(r => r.data)
export const updateProfile = (data) => client.patch('/profile/update', data).then(r => r.data)
export const getAllTags = () => client.get('/profile/get-all-tags').then(r => r.data)
export const browse = (params) => client.get('/profiles/browse', { params }).then(r => r.data)
export const search = (params) => client.get('/profiles/search', { params }).then(r => r.data)

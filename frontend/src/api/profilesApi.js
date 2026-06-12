import client from './client'

export const getMyProfile = () => client.get('/profile/get', { params: { user_id: 'me' } }).then(r => r.data)
export const updateProfile = (data) => client.patch('/profile/update', data).then(r => r.data)
export const browse = (params) => client.get('/profiles/browse', { params }).then(r => r.data)
export const search = (params) => client.get('/profiles/search', { params }).then(r => r.data)

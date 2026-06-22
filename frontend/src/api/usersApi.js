import client from './client'

export const getMe = () => client.get('/users/me').then(r => r.data)
export const updateMe = (data) => client.patch('/users/me', data).then(r => r.data)
export const getUser = (id) => client.get(`/users/${id}`).then(r => r.data)
export const getViews = (id) => client.get(`/users/${id}/views`).then(r => r.data)
export const getLikes = (id) => client.get(`/users/${id}/likes`).then(r => r.data)
export const likeUser = (id) => client.post(`/users/${id}/like`).then(r => r.data)
export const unlikeUser = (id) => client.delete(`/users/${id}/like`).then(r => r.data)
export const blockUser = (id) => client.post(`/users/${id}/block`).then(r => r.data)
export const reportUser = (id) => client.post(`/users/${id}/report`).then(r => r.data)

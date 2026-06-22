import client from './client'

export const getNotifications = () => client.get('/notifications').then(r => r.data)
export const markRead = () => client.post('/notifications/read').then(r => r.data)

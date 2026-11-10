import client from './client'

export const getNotifications = () => client.get('/notifications').then(r => r.data)
export const getUnreadCount = () => client.get('/notifications/unread-count').then(r => r.data.unread)
export const markRead = () => client.post('/notifications/read').then(r => r.data)

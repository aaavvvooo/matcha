import client from './client'

export const getConversations = () => client.get('/chat/conversations').then(r => r.data)

// Oldest-to-newest page; pass beforeId to page back from the oldest message you have.
export const getMessages = (userId, { limit, beforeId } = {}) =>
  client.get(`/chat/messages/${userId}`, { params: { limit, before_id: beforeId } }).then(r => r.data)

export const markThreadRead = (userId) => client.post(`/chat/messages/${userId}/read`).then(r => r.data)

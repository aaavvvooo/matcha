import client from './client'

// An empty body can come back as a "successful" empty string when Firefox cuts a request short
// (page reload mid-load); a list must be an array, anything else counts as a failed load.
export const getConversations = () => client.get('/chat/conversations').then(r => (
  Array.isArray(r.data) ? r.data : Promise.reject(new Error('Unexpected conversations response'))
))

// Oldest-to-newest page; pass beforeId to page back from the oldest message you have.
export const getMessages = (userId, { limit, beforeId } = {}) =>
  client.get(`/chat/messages/${userId}`, { params: { limit, before_id: beforeId } }).then(r => r.data)

export const markThreadRead = (userId) => client.post(`/chat/messages/${userId}/read`).then(r => r.data)

// STUN / TURN servers for WebRTC calls: { ice_servers: [{ urls: [...], username?, credential? }] }.
export const getIceServers = () => client.get('/chat/ice-servers').then(r => r.data)

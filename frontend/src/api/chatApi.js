import client from './client'

export const getConversations = () => client.get('/chat/conversations').then(r => r.data)
export const getMessages = (userId) => client.get(`/chat/messages/${userId}`).then(r => r.data)

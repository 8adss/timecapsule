import request from './request'

// 与「过去的你」对话（人设来自时间胶囊）
export const chatWithPastSelf = (data) => request.post('/chat/past-self', data)

export const getChatHistory = (userId, capsuleId) =>
  request.get('/chat/history', { params: { userId, capsuleId } })

// 与「何时的自己」对话（人设来自知识库蒸馏出的分身）
export const chatWithPersona = (data) => request.post('/chat/persona', data)

export const getPersonaHistory = (userId, personaId) =>
  request.get('/chat/persona-history', { params: { userId, personaId } })

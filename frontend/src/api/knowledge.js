import request from './request'

// 知识库接口：导入的个人资料，是生成「自己的分身」的原料
export const listDocs = (userId) => request.get('/knowledge', { params: { userId } })

export const getDoc = (id, userId) => request.get(`/knowledge/${id}`, { params: { userId } })

export const createDoc = (data) => request.post('/knowledge', data)

export const deleteDoc = (id, userId) =>
  request.delete(`/knowledge/${id}`, { params: { userId } })

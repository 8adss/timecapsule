import request from './request'

// 「自己的分身」接口：把知识库蒸馏成某个时间点的自己
export const listPersonas = (userId) => request.get('/personas', { params: { userId } })

/** 详情里包含 persona 与它引用的文档；前端也用它轮询生成状态 */
export const getPersona = (id, userId) => request.get(`/personas/${id}`, { params: { userId } })

export const createPersona = (data) => request.post('/personas', data)

export const regeneratePersona = (id, userId) =>
  request.post(`/personas/${id}/regenerate`, null, { params: { userId } })

export const deletePersona = (id, userId) =>
  request.delete(`/personas/${id}`, { params: { userId } })

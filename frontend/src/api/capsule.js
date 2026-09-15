import request from './request'

// 时间胶囊接口
export const listCapsules = (userId) => request.get('/capsules', { params: { userId } })

// 只取已开启的胶囊（对话页选择用）
export const listOpenedCapsules = (userId) => request.get('/capsules/opened', { params: { userId } })

export const createCapsule = (data) => request.post('/capsules', data)

export const openCapsule = (id, userId) =>
  request.post(`/capsules/${id}/open`, null, { params: { userId } })

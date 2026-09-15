import request from './request'

// 任务接口
// 注意：按 id 的写操作都要带上 userId，后端会校验这条任务是否属于当前用户
export const listTasks = (userId) => request.get('/tasks', { params: { userId } })

export const createTask = (data) => request.post('/tasks', data)

export const updateTask = (id, data) => request.put(`/tasks/${id}`, data)

export const deleteTask = (id, userId) => request.delete(`/tasks/${id}`, { params: { userId } })

export const completeTask = (id, userId) =>
  request.post(`/tasks/${id}/complete`, null, { params: { userId } })

export const abandonTask = (id, userId) =>
  request.post(`/tasks/${id}/abandon`, null, { params: { userId } })

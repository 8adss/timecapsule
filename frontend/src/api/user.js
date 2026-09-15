import request from './request'

// 用户接口
export const login = (openid) => request.get('/users/login', { params: { openid } })

export const getUser = (id) => request.get(`/users/${id}`)

export const updateUser = (id, data) => request.put(`/users/${id}`, data)

/**
 * 上传头像。字段名固定为 file，后端按 MIME 类型校验并重新生成文件名。
 * 这里用 FormData，axios 会自动带上 multipart 的 boundary。
 */
export const uploadAvatar = (id, userId, file) => {
  const form = new FormData()
  form.append('file', file)
  return request.post(`/users/${id}/avatar`, form, { params: { userId } })
}

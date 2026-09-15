import axios from 'axios'
import { ElMessage } from 'element-plus'

// 统一请求封装：baseURL=/api，本地由 Vite 代理到后端 4114
const request = axios.create({
  baseURL: '/api',
  // AI 对话最长可能等 60 秒（后端 read-timeout 也是 60 秒），这里留一点余量
  timeout: 90000
})

request.interceptors.response.use(
  (res) => {
    const body = res.data
    // 后端约定：HTTP 状态码恒为 200，业务结果看 body.code
    if (body && typeof body.code !== 'undefined' && body.code !== 200) {
      const error = new Error(body.message || '请求失败')
      error.code = body.code
      ElMessage.error(error.message)
      return Promise.reject(error)
    }
    return body ? body.data : null
  },
  (err) => {
    const message = err.response?.data?.message || err.message || '网络错误'
    ElMessage.error(`请求失败：${message}`)
    return Promise.reject(new Error(message))
  }
)

export default request

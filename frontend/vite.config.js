import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// 本地开发端口约定：
//   前端 dev server  4113   ← 浏览器访问这个
//   后端 Spring Boot 4114   ← 由下面的 proxy 转发过去
//
// strictPort：端口被占用时直接报错退出，而不是自动顺延到 4114。
// 顺延会和后端端口撞上，问题反而更难查。
const BACKEND_PORT = 4114
const FRONTEND_PORT = 4113

export default defineConfig({
  plugins: [vue()],
  server: {
    port: FRONTEND_PORT,
    strictPort: true,
    proxy: {
      '/api': {
        target: `http://localhost:${BACKEND_PORT}`,
        changeOrigin: true
      },
      // 用户上传的图片（头像）由后端提供，也必须代理过去，
      // 否则 <img src="/uploads/avatars/xxx.png"> 会被当成前端路由而 404
      '/uploads': {
        target: `http://localhost:${BACKEND_PORT}`,
        changeOrigin: true
      }
    }
  },
  preview: {
    port: FRONTEND_PORT,
    strictPort: true
  }
})

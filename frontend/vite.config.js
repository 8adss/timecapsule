import { readFileSync } from 'node:fs'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'))

// 开发端口。strictPort：端口被占用时直接报错退出，而不是静默顺延到别的端口——
// 顺延会让人以为服务没起来，问题反而更难查。
const DEV_PORT = 4113

export default defineConfig({
  plugins: [vue()],

  // 应用内（设置页的「关于」）需要显示版本号，从 package.json 注入，避免两处手改
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version)
  },

  server: {
    port: DEV_PORT,
    strictPort: true
    // 这里原本有 /api 与 /uploads 两个转发到后端 4114 的代理。
    // 本地优先改造之后应用不再访问后端，代理已移除；
    // 将来若接入外接存储需要走网络，再按那时的端点加回来。
  },

  preview: {
    port: DEV_PORT,
    strictPort: true
  }
})

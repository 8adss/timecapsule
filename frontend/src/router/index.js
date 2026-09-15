import { createRouter, createWebHistory } from 'vue-router'

/**
 * 路由表。
 *
 * 第一版只保留**纯本地**的功能页。以下三个页面依赖后端 AI 能力，已从路由中移除，
 * 但它们对应的 `.vue` 文件与 `src/api/` 模块仍保留在仓库里——二期接 AI 时
 * 直接挂回来即可：
 *   - `/chat`       与过去的自己对话
 *   - `/knowledge`  知识库
 *   - `/personas`   我的分身
 *
 * 之所以不删文件：这三个页面的界面与交互是已经验证过的，删掉之后二期要重写一遍。
 * 它们不参与打包——Vite 只会打包路由真正引用到的模块。
 *
 * M3 会把 `path: '/'` 换成官网落地页，应用页整体挪到 `/app` 之下。
 */
const routes = [
  { path: '/', redirect: '/tasks' },
  { path: '/tasks', component: () => import('../views/TaskView.vue'), meta: { title: '任务' } },
  { path: '/capsules', component: () => import('../views/CapsuleView.vue'), meta: { title: '时间胶囊' } },
  { path: '/profile', component: () => import('../views/ProfileView.vue'), meta: { title: '我的 / 成就' } },
  { path: '/settings', component: () => import('../views/SettingsView.vue'), meta: { title: '设置' } },

  // 兜底路由：任何未匹配的路径都回到任务页。
  //
  // 这一条不是可选的保险，而是必须的：vue-router 对未匹配的 location
  // **不会中止导航**，而是把 matched 置空，于是 <router-view> 什么都不渲染——
  // 用户看到侧边栏还在、内容区一片空白，刷新也回不来（静态托管下若缺
  // SPA fallback 还会直接 404）。任何一个残留的旧链接或页面内的硬编码跳转
  // 都能触发它，兜底比逐个排查可靠。
  { path: '/:pathMatch(.*)*', redirect: '/tasks' }
]

export default createRouter({
  history: createWebHistory(),
  routes
})

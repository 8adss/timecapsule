import { createRouter, createWebHistory } from 'vue-router'

/** 站点名，用于拼 document.title。 */
const SITE_NAME = 'TimeCapsule'

/**
 * 路由表分成三部分：官网、应用、以及历史路径的重定向。
 *
 * `App.vue` 是空的根组件，套哪一层布局由这里决定：
 *   `/`      → LandingView（独立落地页，不带侧边栏）
 *   `/app/*` → AppShell（侧边栏外壳）→ 各功能页
 *
 * 以下页面依赖后端 AI 能力，第一版未挂载，但对应的 `.vue` 与 `src/api/` 模块
 * 仍保留在仓库里，二期直接挂回来即可：
 *   - 与过去的自己对话、知识库、我的分身
 * 它们不参与打包——Vite 只打包路由真正引用到的模块。
 *
 * 所有 `component` 都用动态 import：官网访客不会下载到应用外壳与功能页的代码，
 * 反过来应用内切换也只按需加载当前页。
 */
const routes = [
  {
    path: '/',
    name: 'landing',
    component: () => import('../views/LandingView.vue'),
    meta: { title: '写给未来的自己' }
  },

  {
    path: '/app',
    component: () => import('../layouts/AppShell.vue'),
    children: [
      { path: '', redirect: '/app/tasks' },
      { path: 'tasks', component: () => import('../views/TaskView.vue'), meta: { title: '任务' } },
      { path: 'capsules', component: () => import('../views/CapsuleView.vue'), meta: { title: '时间胶囊' } },
      { path: 'profile', component: () => import('../views/ProfileView.vue'), meta: { title: '我的 / 成就' } },
      { path: 'settings', component: () => import('../views/SettingsView.vue'), meta: { title: '设置' } }
    ]
  },

  // 历史路径。应用页从 `/tasks` 挪到了 `/app/tasks`，这里把旧地址接住，
  // 否则用户按 F5 或点旧书签会落到兜底路由上，以为数据没了。
  { path: '/tasks', redirect: '/app/tasks' },
  { path: '/capsules', redirect: '/app/capsules' },
  { path: '/profile', redirect: '/app/profile' },
  { path: '/settings', redirect: '/app/settings' },

  // 兜底：未知路径回官网首页。
  //
  // 这一条不是可选的保险，而是必须的：vue-router 对未匹配的 location
  // **不会中止导航**，而是把 matched 置空，于是 <router-view> 什么都不渲染——
  // 用户看到的是整片空白，刷新也回不来。指向首页至少能让他知道这是哪儿。
  { path: '/:pathMatch(.*)*', redirect: '/' }
]

const router = createRouter({
  history: createWebHistory(),
  routes,
  // 切换页面回到顶部。应用页在 AppShell 里是独立滚动容器，
  // 这里只管官网那种整页滚动的场景。
  scrollBehavior: () => ({ top: 0 })
})

/** 用路由的 meta.title 更新标签页标题，没有声明时退回站点名。 */
router.afterEach((to) => {
  const title = to.meta && to.meta.title
  document.title = title ? `${title} · ${SITE_NAME}` : SITE_NAME
})

export default router

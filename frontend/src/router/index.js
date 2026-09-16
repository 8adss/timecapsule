import { watch } from 'vue'
import { createRouter, createWebHistory } from 'vue-router'
import { i18n } from '../i18n'

/** 站点名，用于拼 document.title。 */
const SITE_NAME = 'TimeCapsule'

/**
 * 路由表分成三部分：官网、应用、以及历史路径的重定向。
 *
 * `App.vue` 是空的根组件，套哪一层布局由这里决定：
 *   `/`      → LandingView（独立落地页，不带侧边栏）
 *   `/app/*` → AppShell（侧边栏外壳）→ 各功能页
 *
 * 知识库与我的分身都已经挂回来了（`/app/knowledge`、`/app/persona`）：
 * 它们原本也走后端，但改造时换成了本地存储，一行 AI 代码都不需要。
 *
 * **仍然未挂载**的是真正依赖大模型的对话页：
 *   - 与过去的自己对话
 * 它保留在仓库里（`.vue` 与 `src/api/` 模块都在），接回 AI 时再挂上；
 * 在那之前不参与打包——Vite 只打包路由真正引用到的模块。
 *
 * 所有 `component` 都用动态 import：官网访客不会下载到应用外壳与功能页的代码，
 * 反过来应用内切换也只按需加载当前页。
 */
const routes = [
  {
    path: '/',
    name: 'landing',
    component: () => import('../views/LandingView.vue'),
    meta: { title: 'route.landing' }
  },

  {
    path: '/app',
    component: () => import('../layouts/AppShell.vue'),
    children: [
      { path: '', redirect: '/app/tasks' },
      { path: 'tasks', component: () => import('../views/TaskView.vue'), meta: { title: 'route.tasks' } },
      { path: 'capsules', component: () => import('../views/CapsuleView.vue'), meta: { title: 'route.capsules' } },
      { path: 'knowledge', component: () => import('../views/KnowledgeView.vue'), meta: { title: 'route.knowledge' } },
      { path: 'persona', component: () => import('../views/PersonaView.vue'), meta: { title: 'route.persona' } },
      { path: 'profile', component: () => import('../views/ProfileView.vue'), meta: { title: 'route.profile' } },
      { path: 'settings', component: () => import('../views/SettingsView.vue'), meta: { title: 'route.settings' } }
    ]
  },

  // 历史路径。应用页从 `/tasks` 挪到了 `/app/tasks`，这里把旧地址接住，
  // 否则用户按 F5 或点旧书签会落到兜底路由上，以为数据没了。
  { path: '/tasks', redirect: '/app/tasks' },
  { path: '/capsules', redirect: '/app/capsules' },
  { path: '/knowledge', redirect: '/app/knowledge' },
  { path: '/persona', redirect: '/app/persona' },
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

/** 用路由的 meta.title 更新标签页标题，没有声明时退回站点名。
 *
 *  meta.title 里存的是**语言键**而不是文案。路由表在应用启动时就固定了，
 *  写死中文的话英文用户会一直看到中文标题；存键则可以在渲染时按当前语言取。 */
function applyTitle(route) {
  const key = route.meta && route.meta.title
  document.title = key ? `${i18n.global.t(key)} · ${SITE_NAME}` : SITE_NAME
}

router.afterEach(applyTitle)

// 切换语言后当前页的标题也要跟着变。afterEach 只在导航时触发，
// 而语言是可以在设置页原地切换的——不补这一下，标题会一直停在旧语言上。
watch(i18n.global.locale, () => applyTitle(router.currentRoute.value))

export default router

import { createRouter, createWebHistory } from 'vue-router'

const routes = [
  { path: '/', redirect: '/tasks' },
  { path: '/tasks', component: () => import('../views/TaskView.vue'), meta: { title: '任务' } },
  { path: '/capsules', component: () => import('../views/CapsuleView.vue'), meta: { title: '时间胶囊' } },
  { path: '/knowledge', component: () => import('../views/KnowledgeView.vue'), meta: { title: '知识库' } },
  { path: '/personas', component: () => import('../views/PersonaView.vue'), meta: { title: '我的分身' } },
  { path: '/chat', component: () => import('../views/ChatView.vue'), meta: { title: '与过去的你对话' } },
  { path: '/profile', component: () => import('../views/ProfileView.vue'), meta: { title: '我的 / 成就' } },
  { path: '/settings', component: () => import('../views/SettingsView.vue'), meta: { title: '设置' } }
]

export default createRouter({
  history: createWebHistory(),
  routes
})

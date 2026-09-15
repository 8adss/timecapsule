import { defineStore } from 'pinia'
import { login, getUser, updateUser } from '../api/user'

const OPENID_KEY = 'timecapsule.openid'
const USER_ID_KEY = 'timecapsule.userId'

// 数据库脚本里预置的测试账号，有完整虚拟数据（任务/胶囊/对话/成就）
const DEFAULT_OPENID = 'test-openid-001'

// 用户状态。
// 关键修复：userId 会持久化到 localStorage，并且在应用启动时（main.js）
// 先登录拿到 userId 再渲染，否则首屏 /tasks 会带着 userId=null 发请求，
// 后端必然 400，页面是一片空白。
export const useUserStore = defineStore('user', {
  state: () => ({
    userId: Number(localStorage.getItem(USER_ID_KEY)) || null,
    openid: localStorage.getItem(OPENID_KEY) || DEFAULT_OPENID,
    nickname: '',
    avatarUrl: '',
    streakDays: 0,
    growthLevel: 1,
    ready: false
  }),

  getters: {
    isLoggedIn: (state) => !!state.userId,
    displayName: (state) => state.nickname || '未登录',
    avatarText: (state) => (state.nickname || '?').slice(0, 1)
  },

  actions: {
    setUser(user) {
      if (!user) return
      this.userId = user.id
      this.openid = user.openid
      this.nickname = user.nickname || ''
      this.avatarUrl = user.avatarUrl || ''
      this.streakDays = user.streakDays ?? 0
      this.growthLevel = user.growthLevel ?? 1
      localStorage.setItem(USER_ID_KEY, String(user.id))
      localStorage.setItem(OPENID_KEY, user.openid)
    },

    /** 按当前 openid 登录（不存在会后端自动注册），并同步用户信息 */
    async ensureLogin() {
      const user = await login(this.openid || DEFAULT_OPENID)
      this.setUser(user)
      this.ready = true
      return user
    },

    /** 重新拉一次用户信息（完成/放弃任务后等级与打卡会变） */
    async refresh() {
      return this.ensureLogin()
    },

    /** 修改昵称 / 头像 */
    async saveProfile({ nickname, avatarUrl }) {
      const user = await updateUser(this.userId, { userId: this.userId, nickname, avatarUrl })
      this.setUser(user)
      return user
    },

    /** 切换测试账号（本地演示用） */
    async switchOpenid(openid) {
      this.clear()
      this.openid = openid
      return this.ensureLogin()
    },

    clear() {
      this.userId = null
      this.nickname = ''
      this.avatarUrl = ''
      this.streakDays = 0
      this.growthLevel = 1
      localStorage.removeItem(USER_ID_KEY)
      localStorage.removeItem(OPENID_KEY)
    }
  }
})

export { DEFAULT_OPENID }

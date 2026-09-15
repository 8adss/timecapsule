/**
 * 本机档案状态。
 *
 * 与改造前的区别：**没有登录、没有 openid、没有多账号切换**。
 * 数据属于这台浏览器，打开即用。
 *
 * 之所以仍用 Pinia 而不是让页面各自读仓储：档案的显示值（昵称、头像、等级、
 * 连续天数）在侧边栏、我的页、任务页都要用到，完成一次任务后需要同时刷新它们。
 * 集中放一处可以避免每个页面各自重复读取。
 */
import { defineStore } from 'pinia'
import { getProfile, updateProfile, uploadAvatar } from '../api/user'

export const useUserStore = defineStore('user', {
  state: () => ({
    /** 本机档案，形状与旧后端的 User 一致：{ id, nickname, avatarUrl, streakDays, growthLevel, ... } */
    profile: null,
    /** 是否已完成首次读取。页面据此决定要不要显示骨架屏。 */
    ready: false
  }),

  getters: {
    nickname: (state) => state.profile?.nickname ?? '',
    avatarUrl: (state) => state.profile?.avatarUrl ?? '',
    streakDays: (state) => state.profile?.streakDays ?? 0,
    growthLevel: (state) => state.profile?.growthLevel ?? 1,
    displayName: (state) => state.profile?.nickname || '本机用户',
    /** 没有头像时显示昵称首字 */
    avatarText: (state) => (state.profile?.nickname || '?').slice(0, 1)
  },

  actions: {
    /**
     * 读取本机档案。首次调用会在存储里创建一条默认档案。
     */
    async load() {
      this.profile = await getProfile()
      this.ready = true
      return this.profile
    },

    /**
     * 重新读取档案。
     *
     * 完成任务、开启胶囊都会改变连续打卡与成长等级，调用方需要据此刷新侧边栏。
     */
    async refresh() {
      return this.load()
    },

    /**
     * 直接写入一份档案对象（不再回读），用于接口已经返回了最新值的场景。
     * @param {object} profile
     */
    setProfile(profile) {
      if (profile) {
        this.profile = profile
      }
    },

    /**
     * 保存昵称与头像。
     * @param {{ nickname?: string, avatarUrl?: string }} patch
     */
    async saveProfile(patch) {
      this.profile = await updateProfile(patch)
      return this.profile
    },

    /**
     * 更换头像。文件会在浏览器里压缩成 dataURL 后存本地。
     * @param {File} file
     */
    async changeAvatar(file) {
      this.profile = await uploadAvatar(file)
      return this.profile
    }
  }
})

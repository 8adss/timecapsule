/**
 * 用户画像仓储。
 *
 * 本地化之后不再有「用户」这个概念——没有账号、没有 openid、没有多用户列表。
 * 但上层（Pinia store、页面）一直在用 `{ id, nickname, avatarUrl, streakDays,
 * growthLevel }` 这个形状，所以本模块**刻意维持该形状不变**，
 * 让页面与 store 一行都不用改。
 *
 * 头像从「上传到服务器磁盘、返回 /uploads/... 地址」改为「读成 dataURL 存本地」。
 * 字段名仍是 `avatarUrl`——它现在装的是一个 data: 开头的字符串。这是有意的妥协：
 * 改名会让 ProfileView 与 App.vue 的侧边栏头像同时要改，收益不抵风险。
 */
import { read, write, KEY } from '../storage/index.js'
import { withWriteLock } from '../storage/lock.js'
import { nowDateTimeString } from '../domain/time.js'
import { computeStats } from '../domain/stats.js'

/** 本机档案的固定标识。单用户，不需要真的生成 id，但要保证形状完整（导出合并时按它去重）。 */
const LOCAL_ID = 'local'

/** 首次使用时写入的默认档案，对应后端 `findOrCreateByOpenid` 的初始值。 */
function defaultProfile(now = new Date()) {
  return {
    id: LOCAL_ID,
    nickname: '新朋友',
    avatarUrl: '',
    streakDays: 0,
    growthLevel: 1,
    createdAt: nowDateTimeString(now),
    updatedAt: nowDateTimeString(now)
  }
}

/**
 * 读取档案；不存在则**创建并落盘**后返回。
 *
 * 直接落盘而不是只在内存里造一个默认值，是有原因的：`createdAt` 要成为
 * 真实可导出的数据，否则每次刷新都会把「注册时间」刷成当下。
 *
 * @param {Date} [now] - 参考时刻
 * @returns {Promise<object>} 形状与旧后端 User 一致的档案对象
 */
export async function loadProfile(now = new Date()) {
  const stored = await read(KEY.profile, null)
  if (stored !== null && typeof stored === 'object') {
    return { ...defaultProfile(now), ...stored }
  }
  const created = defaultProfile(now)
  await write(KEY.profile, created)
  return created
}

/**
 * 写回档案。**调用方必须已持有写锁。**
 * @param {object} profile
 * @returns {Promise<void>}
 */
export async function saveProfile(profile) {
  await write(KEY.profile, profile)
}

/**
 * 依据任务记录回算连续打卡与成长等级。**调用方必须已持有写锁。**
 *
 * 与后端 `UserService.refreshStats` 一致：整体回算而非增量累加。
 *
 * @param {object} profile - 当前档案
 * @param {Array} tasks - 全部任务
 * @param {Date} [now] - 参考时刻
 * @returns {{ profile: object, stats: object }} 回算后的档案与统计值
 */
export function recomputeStatsWithinLock(profile, tasks, now = new Date()) {
  const stats = computeStats(tasks, now)
  const changed = profile.streakDays !== stats.streakDays
    || profile.growthLevel !== stats.growthLevel

  if (!changed) {
    return { profile, stats }
  }

  return {
    profile: {
      ...profile,
      streakDays: stats.streakDays,
      growthLevel: stats.growthLevel,
      updatedAt: nowDateTimeString(now)
    },
    stats
  }
}

/**
 * 供页面调用的只读查询。
 * @returns {Promise<object>}
 */
export async function get() {
  return loadProfile()
}

/**
 * 修改昵称与头像。
 *
 * 与后端 `updateProfile` 一致：空字符串表示「不修改」而不是「清空」。
 * 这一点很关键：否则「先传头像、再保存昵称」会把刚上传的头像抹掉。
 *
 * @param {{ nickname?: string, avatarUrl?: string }} patch
 * @returns {Promise<object>} 更新后的档案
 */
export async function update(patch) {
  return withWriteLock(async () => {
    const profile = await loadProfile()
    const next = { ...profile }

    if (typeof patch.nickname === 'string' && patch.nickname.trim() !== '') {
      next.nickname = patch.nickname.trim()
    }
    if (typeof patch.avatarUrl === 'string' && patch.avatarUrl.trim() !== '') {
      next.avatarUrl = patch.avatarUrl.trim()
    }
    next.updatedAt = nowDateTimeString()

    await saveProfile(next)
    return next
  })
}

/**
 * 直接设置头像（用于 dataURL 场景，允许清空）。
 * @param {string} dataUrl - data:image/... 开头的字符串，空串表示恢复默认
 * @returns {Promise<object>}
 */
export async function setAvatar(dataUrl) {
  return withWriteLock(async () => {
    const profile = await loadProfile()
    const next = {
      ...profile,
      avatarUrl: typeof dataUrl === 'string' ? dataUrl : '',
      updatedAt: nowDateTimeString()
    }
    await saveProfile(next)
    return next
  })
}

export { LOCAL_ID }

/**
 * 成就仓储。
 *
 * 加锁约定：本模块暴露两类函数——
 * - `list()` 是只读查询，自己不加锁；
 * - `loadAchievements` / `saveAchievements` / `grantWithinLock` 是**锁内的**低层操作。
 *
 * 之所以不在这里自己加锁，是因为一次「完成任务」要同时改任务、成就、画像三份数据，
 * 它们应当共用同一把锁才能保证整体一致。若各仓储各加一把，就会出现
 * 「任务写成功、成就没写进去」的中间态；而 Web Locks 不支持嵌套获取，
 * 内层再要一次锁会直接死锁。所以锁由最外层的业务操作持有。
 */
import { read, write, KEY } from '../storage/index.js'
import { newId } from '../domain/id.js'
import { nowDateTimeString } from '../domain/time.js'
import {
  grantedValuesOf,
  newMilestones,
  sortAchievements
} from '../domain/achievement.js'

/**
 * 读取全部成就（含逻辑删除之外的记录，成就本身没有删除语义）。
 * @returns {Promise<Array>}
 */
export async function loadAchievements() {
  const list = await read(KEY.achievements, [])
  return Array.isArray(list) ? list : []
}

/**
 * 写回全部成就。
 * @param {Array} list
 * @returns {Promise<void>}
 */
export async function saveAchievements(list) {
  await write(KEY.achievements, list)
}

/**
 * 按里程碑追加新解锁的成就。**调用方必须已持有写锁。**
 *
 * 幂等：已发放过的里程碑不会重复追加。这正是从旧备份导入后不会出现
 * 重复成就的原因——判定依据是「该类型下已存在的 value 集合」，与后端
 * 唯一索引 `uk_user_type_value` 的语义一致。
 *
 * @param {Array} all - 当前全部成就
 * @param {string} type - 成就类型
 * @param {number} current - 当前累计值
 * @param {Date} [now] - 解锁时刻
 * @returns {{ list: Array, created: Array }} 追加后的新数组，以及本次新解锁的成就
 */
export function grantWithinLock(all, type, current, now = new Date()) {
  const pending = newMilestones(type, current, grantedValuesOf(all, type))
  if (pending.length === 0) {
    return { list: all, created: [] }
  }

  const unlockedAt = nowDateTimeString(now)
  const created = pending.map((value) => ({
    id: newId(),
    type,
    value,
    unlockedAt
  }))

  return { list: [...all, ...created], created }
}

/**
 * 供页面调用的只读查询：按类型、再按数值升序返回。
 * @returns {Promise<Array>}
 */
export async function list() {
  return sortAchievements(await loadAchievements())
}

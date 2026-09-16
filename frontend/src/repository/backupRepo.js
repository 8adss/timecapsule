/**
 * 备份仓储：导出、导入、快照回滚。
 *
 * 导入是本模块唯一处理**外部输入**的地方，三条顺序不能调换：
 *
 * 1. **先全量校验，再碰存储。** `validateBackup` 在写锁之外执行，
 *    不合法就直接抛错——此时存储里一个字节都没改过。
 *    「边校验边写」会让一次失败的导入留下半份数据，比直接拒绝危险得多。
 *
 * 2. **落盘前先存快照。** 且快照与新数据放在**同一个 `writeMany`** 里，
 *    保证「覆盖成功」与「快照可回滚」同时成立。若分两次写，中间失败就会出现
 *    「数据被覆盖了但没有快照」——正是最需要回滚的那种情况。
 *
 * 3. **落盘后回算派生数据。** 统计与成就里程碑都是从任务/胶囊推出来的，
 *    导入进来的那份可能与之不符（例如只导入了任务没导入成就）。
 *    回算是幂等的，不会重复发放。
 */
import { read, writeMany, remove, KEY } from '../storage/index.js'
import { withWriteLock } from '../storage/lock.js'
import { nowDateTimeString } from '../domain/time.js'
import { DomainError } from '../domain/errors.js'
import { ACHIEVEMENT_TYPE } from '../domain/constants.js'
import { countOpened } from '../domain/capsule.js'
import { countDoneTasks } from '../domain/stats.js'
import {
  buildBackup,
  mergeData,
  replaceData,
  validateBackup
} from '../domain/backup.js'
import { grantWithinLock } from './achievementRepo.js'
import { loadProfile, recomputeStatsWithinLock } from './profileRepo.js'

/** 导入模式。 */
export const IMPORT_MODE = Object.freeze({
  /** 合并：按 id 去重，冲突取较新的一份 */
  MERGE: 'merge',
  /** 替换：清空后整体写入 */
  REPLACE: 'replace'
})

/**
 * 读取当前全部数据（按逻辑分区名，与备份文件的 data 字段一致）。
 * @returns {Promise<{profile: object|null, tasks: Array, capsules: Array, achievements: Array, settings: object, knowledge: Array}>}
 */
export async function readAll() {
  const [profile, tasks, capsules, achievements, settings, knowledge] = await Promise.all([
    read(KEY.profile, null),
    read(KEY.tasks, []),
    read(KEY.capsules, []),
    read(KEY.achievements, []),
    read(KEY.settings, {}),
    read(KEY.knowledge, [])
  ])
  return {
    profile: profile ?? null,
    tasks: Array.isArray(tasks) ? tasks : [],
    capsules: Array.isArray(capsules) ? capsules : [],
    achievements: Array.isArray(achievements) ? achievements : [],
    settings: settings && typeof settings === 'object' ? settings : {},
    knowledge: Array.isArray(knowledge) ? knowledge : []
  }
}

/**
 * 生成一份可导出的备份对象。
 * @param {Date} [now] - 导出时刻
 * @returns {Promise<object>}
 */
export async function createBackup(now = new Date()) {
  return buildBackup(await readAll(), now)
}

/**
 * 依据任务与胶囊回算派生数据。**调用方必须已持有写锁。**
 *
 * - 连续打卡与成长等级从任务整体回算（与完成任务时走的是同一套逻辑）
 * - 成就按当前计数补齐尚未发放的里程碑（幂等，不会重复发）
 *
 * @param {Array} tasks
 * @param {Array} capsules
 * @param {Array} achievements
 * @param {object} profile
 * @param {Date} now
 * @returns {{ profile: object, achievements: Array }}
 */
function reconcileWithinLock(tasks, capsules, achievements, profile, now) {
  let list = achievements
  let currentProfile = profile

  list = grantWithinLock(list, ACHIEVEMENT_TYPE.TASK_DONE, countDoneTasks(tasks), now).list

  const recomputed = recomputeStatsWithinLock(currentProfile, tasks, now)
  currentProfile = recomputed.profile

  list = grantWithinLock(list, ACHIEVEMENT_TYPE.CAPSULE_OPENED, countOpened(capsules), now).list
  list = grantWithinLock(list, ACHIEVEMENT_TYPE.STREAK, currentProfile.streakDays ?? 0, now).list

  return { profile: currentProfile, achievements: list }
}

/**
 * 导入一份备份。
 *
 * @param {unknown} raw - 已 JSON.parse 的文件内容
 * @param {'merge'|'replace'} [mode] - 导入模式，默认合并
 * @param {Date} [now] - 参考时刻
 * @returns {Promise<{ mode: string, summary: object, counts: object }>}
 * @throws {Error} 校验不通过（此时存储未被修改）
 */
export async function importBackup(raw, mode = IMPORT_MODE.MERGE, now = new Date()) {
  if (mode !== IMPORT_MODE.MERGE && mode !== IMPORT_MODE.REPLACE) {
    throw new DomainError(`未知的导入模式：${mode}`, {
      key: 'errors.unknownImportMode',
      params: { mode }
    })
  }

  // 第 1 步：全量校验。放在写锁之外——失败时存储一个字节都没动过。
  const { data: incoming } = validateBackup(raw)

  return withWriteLock(async () => {
    const current = await readAll()

    // 第 2 步：合并或替换
    const { data: draft, summary } = mode === IMPORT_MODE.REPLACE
      ? replaceData(incoming)
      : mergeData(current, incoming)

    // 第 3 步：回算派生数据。替换模式下文件里可能没有画像，补一份默认的。
    const profile = draft.profile ?? await loadProfile(now)
    const { profile: nextProfile, achievements: nextAchievements } = reconcileWithinLock(
      draft.tasks,
      draft.capsules,
      draft.achievements,
      profile,
      now
    )

    // 第 4 步：快照与新数据在同一个事务里落盘
    const timestamp = nowDateTimeString(now)
    await writeMany([
      [KEY.snapshot, { createdAt: timestamp, reason: `import:${mode}`, data: current }],
      [KEY.profile, nextProfile],
      [KEY.tasks, draft.tasks],
      [KEY.capsules, draft.capsules],
      [KEY.achievements, nextAchievements],
      [KEY.settings, draft.settings],
      [KEY.knowledge, draft.knowledge]
    ])

    return {
      mode,
      summary,
      counts: {
        tasks: draft.tasks.length,
        capsules: draft.capsules.length,
        achievements: nextAchievements.length,
        knowledge: draft.knowledge.length
      }
    }
  })
}

/**
 * 读取当前快照（若有）。
 * @returns {Promise<object|null>}
 */
export async function readSnapshot() {
  const snapshot = await read(KEY.snapshot, null)
  return snapshot && typeof snapshot === 'object' ? snapshot : null
}

/**
 * 是否有可回滚的快照。
 * @returns {Promise<boolean>}
 */
export async function hasSnapshot() {
  return (await readSnapshot()) !== null
}

/**
 * 回滚到上一次导入 / 清空之前的快照。
 *
 * 回滚本身也会先存一份「回滚前」的快照，否则误点回滚就再也回不来了。
 *
 * @param {Date} [now]
 * @returns {Promise<{ restored: object }>} 恢复出来的数据条数
 * @throws {Error} 没有快照时
 */
export async function restoreSnapshot(now = new Date()) {
  return withWriteLock(async () => {
    const snapshot = await readSnapshot()
    if (snapshot === null || !snapshot.data) {
      throw new DomainError('没有可恢复的快照', { key: 'errors.noSnapshot' })
    }

    const current = await readAll()
    const restored = snapshot.data
    const tasks = Array.isArray(restored.tasks) ? restored.tasks : []
    const capsules = Array.isArray(restored.capsules) ? restored.capsules : []
    const achievements = Array.isArray(restored.achievements) ? restored.achievements : []
    // 快照若来自「知识库还不存在的版本」，这里的 knowledge 就是 undefined，按空数组处理：
    // 与其它集合在回滚下的语义保持一致（回滚 = 回到那个时点）。
    // 这不会让资料无声消失——回滚本身会先把**当前**数据存成新快照，误删再回滚一次即可取回。
    const knowledge = Array.isArray(restored.knowledge) ? restored.knowledge : []
    const profile = restored.profile ?? await loadProfile(now)

    const { profile: nextProfile, achievements: nextAchievements } = reconcileWithinLock(
      tasks, capsules, achievements, profile, now
    )

    await writeMany([
      [KEY.snapshot, { createdAt: nowDateTimeString(now), reason: 'restore', data: current }],
      [KEY.profile, nextProfile],
      [KEY.tasks, tasks],
      [KEY.capsules, capsules],
      [KEY.achievements, nextAchievements],
      [KEY.settings, restored.settings ?? {}],
      [KEY.knowledge, knowledge]
    ])

    return {
      restored: {
        tasks: tasks.length,
        capsules: capsules.length,
        achievements: nextAchievements.length,
        knowledge: knowledge.length
      }
    }
  })
}

/**
 * 清空全部用户数据，并先存一份快照。
 *
 * 注意画像要**回算**而不是原样保留：任务清空之后，连续打卡与成长等级
 * 必须跟着归零。直接把旧画像写回去的话，用户会看到一个「0 条任务、
 * 连续打卡 7 天」的自相矛盾状态。
 *
 * 昵称与头像不在回算范围内——它们属于「人设」而不是「记录」，
 * 清空数据不该把用户给自己起的名字也抹掉。
 *
 * @param {Date} [now]
 * @returns {Promise<void>}
 */
export async function clearAllData(now = new Date()) {
  return withWriteLock(async () => {
    const current = await readAll()
    const profile = await loadProfile(now)
    const { profile: nextProfile } = reconcileWithinLock([], [], [], profile, now)

    await writeMany([
      [KEY.snapshot, { createdAt: nowDateTimeString(now), reason: 'clear', data: current }],
      [KEY.profile, nextProfile],
      [KEY.tasks, []],
      [KEY.capsules, []],
      [KEY.achievements, []],
      [KEY.settings, {}],
      // 知识库一并清空：它属于「用户数据」，而这里说的是「全部」。
      // 同样受快照保护，随时可以回滚。
      [KEY.knowledge, []]
    ])
  })
}

/** 丢弃快照。 */
export async function discardSnapshot() {
  await remove(KEY.snapshot)
}

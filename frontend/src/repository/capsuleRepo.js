/**
 * 时间胶囊仓储。
 *
 * 加锁约定见 achievementRepo 的说明：低层读写与纯计算不加锁，由最外层业务操作持有。
 */
import { read, write, writeMany, KEY } from '../storage/index.js'
import { withWriteLock } from '../storage/lock.js'
import { DomainError } from '../domain/errors.js'
import { ACHIEVEMENT_TYPE } from '../domain/constants.js'
import {
  autoOpenExpired,
  buildCapsule,
  countOpened,
  openCapsuleEntity,
  sortCapsules,
  sortOpenedCapsules,
  visibleCapsules
} from '../domain/capsule.js'
import {
  grantWithinLock,
  loadAchievements
} from './achievementRepo.js'

/**
 * 读取全部胶囊。
 * @returns {Promise<Array>}
 */
export async function loadCapsules() {
  const list = await read(KEY.capsules, [])
  return Array.isArray(list) ? list : []
}

/**
 * 写回全部胶囊。
 * @param {Array} list
 * @returns {Promise<void>}
 */
export async function saveCapsules(list) {
  await write(KEY.capsules, list)
}

/** 在列表里找一个未删除的胶囊，找不到就抛 404。 */
function findOrThrow(capsules, id) {
  const capsule = capsules.find((item) => item.id === id && item.deleted !== 1)
  if (!capsule) {
    throw new DomainError('胶囊不存在', 404)
  }
  return capsule
}

/**
 * 校验关联任务存在，并追加一条新胶囊。**调用方必须已持有写锁。**
 *
 * 供 CapsuleService.createInternal 的两个调用方共用：胶囊页单独创建，
 * 以及 TaskService 在创建任务时顺带封存——后者需要与任务写入共享同一把锁。
 *
 * @param {Array} capsules - 当前胶囊列表
 * @param {object} input - { taskId, toDate, content, voiceUrl }
 * @param {Array} tasks - 当前任务列表，用于校验关联任务
 * @param {Date} [now] - 参考时刻
 * @returns {Array} 追加后的新胶囊列表
 */
export function appendCapsuleWithinLock(capsules, input, tasks, now = new Date()) {
  if (input.taskId != null) {
    const task = tasks.find((item) => item.id === input.taskId && item.deleted !== 1)
    if (!task) {
      throw new DomainError('关联的任务不存在')
    }
  }
  return [...capsules, buildCapsule(input, now)]
}

/**
 * 供页面调用的查询：封存中的排在前面，同状态内按开启时间倒序。
 * @returns {Promise<Array>}
 */
export async function list() {
  return sortCapsules(visibleCapsules(await loadCapsules()))
}

/**
 * 已开启的胶囊，按开启时间倒序。对应后端 `listOpened`。
 * @returns {Promise<Array>}
 */
export async function listOpened() {
  const capsules = visibleCapsules(await loadCapsules())
  return sortOpenedCapsules(capsules.filter((item) => item.status === 1))
}

/**
 * 封存一条新胶囊。
 * @param {object} input - { taskId, toDate, content, voiceUrl }
 * @returns {Promise<object>} 新建的胶囊
 */
export async function create(input) {
  return withWriteLock(async () => {
    const [capsules, tasks] = await Promise.all([loadCapsules(), read(KEY.tasks, [])])
    const next = appendCapsuleWithinLock(capsules, input, Array.isArray(tasks) ? tasks : [])
    await saveCapsules(next)
    return next[next.length - 1]
  })
}

/**
 * 开启胶囊。
 *
 * 幂等：已开启的原样返回（`changed` 为 false），不重复发放成就。
 *
 * @param {string} id - 胶囊 id
 * @returns {Promise<object>} 开启后的胶囊
 */
export async function open(id) {
  return withWriteLock(async () => {
    const capsules = await loadCapsules()
    const target = findOrThrow(capsules, id)
    const { capsule, changed } = openCapsuleEntity(target)

    if (!changed) {
      return capsule
    }

    const nextCapsules = capsules.map((item) => (item.id === id ? capsule : item))

    // 业务闭环：开启数变化 → 补发成就。胶囊与成就一起落盘，
    // 避免中途失败出现「胶囊开了但成就没发」。
    const achievements = await loadAchievements()
    const { list: nextAchievements } = grantWithinLock(
      achievements,
      ACHIEVEMENT_TYPE.CAPSULE_OPENED,
      countOpened(nextCapsules)
    )

    const entries = [[KEY.capsules, nextCapsules]]
    if (nextAchievements !== achievements) {
      entries.push([KEY.achievements, nextAchievements])
    }
    await writeMany(entries)

    return capsule
  })
}

/**
 * 本地维护：开启所有到期胶囊，并补发相应成就。
 *
 * 对应后端的 `autoOpenExpired` 定时任务。本地没有调度器，改由应用启动时
 * 与每分钟的可见态定时器驱动。
 *
 * @param {Date} [now] - 参考时刻
 * @returns {Promise<number>} 本次开启的胶囊数量
 */
export async function autoOpenDue(now = new Date()) {
  return withWriteLock(async () => {
    const capsules = await loadCapsules()
    const { capsules: nextCapsules, openedCount } = autoOpenExpired(capsules, now)

    if (openedCount === 0) {
      return 0
    }

    const achievements = await loadAchievements()
    const { list: nextAchievements } = grantWithinLock(
      achievements,
      ACHIEVEMENT_TYPE.CAPSULE_OPENED,
      countOpened(nextCapsules),
      now
    )

    const entries = [[KEY.capsules, nextCapsules]]
    if (nextAchievements !== achievements) {
      entries.push([KEY.achievements, nextAchievements])
    }
    await writeMany(entries)

    return openedCount
  })
}

/**
 * 任务仓储 —— 本层是「一次业务操作」的边界，负责持有写锁并保证多份数据一起落盘。
 *
 * 加锁与原子性约定：
 * - 每个会改数据的导出函数自己 `withWriteLock`，低层读写函数不加锁；
 * - 一次操作里若改动多于一份集合，一律用 `writeMany` 走**单个 IndexedDB 事务**，
 *   避免「任务改了、成就没发」这类半途状态。本地没有数据库事务，
 *   `setMany` 是唯一的等价手段。
 */
import { read, write, writeMany, KEY } from '../storage/index.js'
import { withWriteLock } from '../storage/lock.js'
import { DomainError } from '../domain/errors.js'
import { nowDateTimeString } from '../domain/time.js'
import { ACHIEVEMENT_TYPE } from '../domain/constants.js'
import {
  abandonTask as abandonTaskEntity,
  applyTaskPatch,
  buildTask,
  completeTask as completeTaskEntity,
  markOverdue,
  overdueTaskIds,
  sortTasks,
  visibleTasks
} from '../domain/task.js'
import { resolveCapsuleToDate } from '../domain/capsule.js'
import { countDoneTasks } from '../domain/stats.js'
import {
  grantWithinLock,
  loadAchievements
} from './achievementRepo.js'
import {
  appendCapsuleWithinLock,
  loadCapsules
} from './capsuleRepo.js'
import {
  loadProfile,
  recomputeStatsWithinLock
} from './profileRepo.js'

/**
 * 读取全部任务（含逻辑删除的记录）。
 * @returns {Promise<Array>}
 */
export async function loadTasks() {
  const list = await read(KEY.tasks, [])
  return Array.isArray(list) ? list : []
}

/**
 * 写回全部任务。
 * @param {Array} list
 * @returns {Promise<void>}
 */
export async function saveTasks(list) {
  await write(KEY.tasks, list)
}

/** 在列表里找一个未删除的任务，找不到就抛 404。 */
function findOrThrow(tasks, id) {
  const task = tasks.find((item) => item.id === id && item.deleted !== 1)
  if (!task) {
    throw new DomainError('任务不存在', 404)
  }
  return task
}

/**
 * 供页面调用的查询：先按状态升序，同状态内按创建时间倒序。
 * @returns {Promise<Array>}
 */
export async function list() {
  return sortTasks(visibleTasks(await loadTasks()))
}

/**
 * 新建任务；带 `capsuleContent` 时在同一把锁内一起封存胶囊。
 *
 * 与后端 `TaskService.create` 的差异：后端用 `@Transactional` 保证「任务与胶囊
 * 一起成功或一起失败」，这里改用一次 `writeMany`。效果等价。
 *
 * @param {object} input - { title, category, description, startDate, dueDate,
 *                          remindTime, capsuleContent, capsuleToDate }
 * @returns {Promise<object>} 新建的任务
 */
export async function create(input) {
  return withWriteLock(async () => {
    const now = new Date()
    const tasks = await loadTasks()
    const task = buildTask(input, now)
    const nextTasks = [...tasks, task]

    const hasCapsule = typeof input.capsuleContent === 'string'
      && input.capsuleContent.trim() !== ''

    if (!hasCapsule) {
      await saveTasks(nextTasks)
      return task
    }

    const capsules = await loadCapsules()
    const nextCapsules = appendCapsuleWithinLock(capsules, {
      taskId: task.id,
      toDate: resolveCapsuleToDate(input, now),
      content: input.capsuleContent,
      voiceUrl: null
    }, nextTasks, now)

    await writeMany([
      [KEY.tasks, nextTasks],
      [KEY.capsules, nextCapsules]
    ])
    return task
  })
}

/**
 * 更新任务。只有领域层白名单里的字段会变——`status` 与 `completedAt`
 * 不可能被客户端直接设置，否则用户能自行把任务改成「已完成」来白刷成就。
 *
 * @param {string} id - 任务 id
 * @param {object} patch - 变更内容
 * @returns {Promise<object>} 更新后的任务
 */
export async function update(id, patch) {
  return withWriteLock(async () => {
    const tasks = await loadTasks()
    const target = findOrThrow(tasks, id)
    const next = applyTaskPatch(target, patch)
    const nextTasks = tasks.map((item) => (item.id === id ? next : item))
    await saveTasks(nextTasks)
    return next
  })
}

/**
 * 删除任务（逻辑删除，记录保留）。对应后端 `TaskService.delete`。
 * @param {string} id - 任务 id
 * @returns {Promise<void>}
 */
export async function remove(id) {
  return withWriteLock(async () => {
    const tasks = await loadTasks()
    findOrThrow(tasks, id)
    const nextTasks = tasks.map((item) => (item.id === id
      ? { ...item, deleted: 1, updatedAt: nowDateTimeString() }
      : item))
    await saveTasks(nextTasks)
  })
}

/**
 * 完成任务，并跑完整条业务闭环：
 *
 * 1. 任务置为已完成、记录完成时间（幂等，重复调用不重复发成就）
 * 2. 按累计完成数补发成就
 * 3. 整体回算连续打卡天数与成长等级
 * 4. 按连续天数补发成就
 *
 * 顺序与后端 `TaskService.complete` 严格一致——第 4 步依赖第 3 步算出的
 * 连续天数，调换顺序会少发「连续打卡」类成就。
 *
 * @param {string} id - 任务 id
 * @returns {Promise<object>} 完成后的任务
 */
export async function complete(id) {
  return withWriteLock(async () => {
    const now = new Date()
    const tasks = await loadTasks()
    const target = findOrThrow(tasks, id)
    const { task, changed } = completeTaskEntity(target, now)

    if (!changed) {
      return task
    }

    const nextTasks = tasks.map((item) => (item.id === id ? task : item))

    const originalAchievements = await loadAchievements()
    let achievements = originalAchievements

    // 第 2 步：任务完成数 → 成就
    achievements = grantWithinLock(
      achievements,
      ACHIEVEMENT_TYPE.TASK_DONE,
      countDoneTasks(nextTasks),
      now
    ).list

    // 第 3 步：回算连续打卡与成长等级
    const profile = await loadProfile(now)
    const { profile: nextProfile, stats } = recomputeStatsWithinLock(profile, nextTasks, now)

    // 第 4 步：连续天数 → 成就
    achievements = grantWithinLock(
      achievements,
      ACHIEVEMENT_TYPE.STREAK,
      stats.streakDays,
      now
    ).list

    const entries = [[KEY.tasks, nextTasks]]
    if (nextProfile !== profile) {
      entries.push([KEY.profile, nextProfile])
    }
    if (achievements !== originalAchievements) {
      entries.push([KEY.achievements, achievements])
    }

    await writeMany(entries)
    return task
  })
}

/**
 * 放弃任务（状态置 3）。已完成的任务不允许再放弃。
 * @param {string} id - 任务 id
 * @returns {Promise<object>} 更新后的任务
 */
export async function abandon(id) {
  return withWriteLock(async () => {
    const tasks = await loadTasks()
    const target = findOrThrow(tasks, id)
    const next = abandonTaskEntity(target)
    const nextTasks = tasks.map((item) => (item.id === id ? next : item))
    await saveTasks(nextTasks)
    return next
  })
}

/**
 * 本地维护：把已过截止时间且仍在进行中的任务标记为「已逾期」。
 *
 * 对应后端的 `markOverdueTasks` 定时任务。返回变更条数，未变更时不写盘。
 *
 * @param {Date} [now] - 参考时刻
 * @returns {Promise<number>} 本次标记的数量
 */
export async function markOverdueTasks(now = new Date()) {
  return withWriteLock(async () => {
    const tasks = await loadTasks()
    const changedCount = overdueTaskIds(tasks, now).length
    if (changedCount === 0) {
      return 0
    }
    const { tasks: nextTasks } = markOverdue(tasks, now)
    await saveTasks(nextTasks)
    return changedCount
  })
}

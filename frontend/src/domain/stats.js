/**
 * 统计回算：连续打卡天数与成长等级。
 *
 * 对应后端 `UserService.calcStreak` 与 `refreshStats`。
 * 这两个值**不做增量累加，而是每次从任务记录整体回算**——后端就是这么写的，
 * 好处是数据永远自洽：删掉一条已完成任务，打卡天数会跟着修正，
 * 不会像累加器那样永久偏移。
 */
import { TASK_STATUS, TASKS_PER_LEVEL } from './constants.js'
import { dateKey, shiftDay, nowDateTimeString } from './time.js'

/**
 * 已完成的任务数。
 * 排除逻辑删除的记录——后端靠 MyBatis-Plus 的 `@TableLogic` 自动追加 `deleted=0`，
 * 本地没有这层拦截，必须显式过滤，否则删掉的任务仍会被计入等级。
 *
 * @param {Array<{status: number, deleted?: number}>} tasks - 全部任务
 * @returns {number}
 */
export function countDoneTasks(tasks) {
  return tasks.filter((task) => task.deleted !== 1 && task.status === TASK_STATUS.DONE).length
}

/**
 * 连续打卡天数：从今天（或昨天）往前数，连续有任务完成的天数。
 *
 * 「今天还没完成任务时不清零、从昨天开始数」是刻意的：否则每天早上打开页面，
 * 用户都会看到自己辛苦攒的连续天数归零。
 *
 * @param {Array<{status: number, deleted?: number, completedAt?: string|null}>} tasks - 全部任务
 * @param {Date} [today] - 参考日期，测试用
 * @returns {number} 连续天数，无记录时为 0
 */
export function calcStreak(tasks, today = new Date()) {
  const days = new Set(
    tasks
      .filter((task) => task.deleted !== 1
        && task.status === TASK_STATUS.DONE
        && task.completedAt)
      .map((task) => dateKey(task.completedAt))
  )

  if (days.size === 0) {
    return 0
  }

  let cursor = dateKey(today)
  if (!days.has(cursor)) {
    cursor = shiftDay(cursor, -1)
    if (!days.has(cursor)) {
      return 0
    }
  }

  let streak = 0
  while (days.has(cursor)) {
    streak += 1
    cursor = shiftDay(cursor, -1)
  }
  return streak
}

/**
 * 成长等级：每完成 {@link TASKS_PER_LEVEL} 个任务升一级，从 1 级起步。
 * @param {number} doneCount - 已完成任务数
 * @returns {number} 等级，最小为 1
 */
export function growthLevel(doneCount) {
  return Math.floor(doneCount / TASKS_PER_LEVEL) + 1
}

/**
 * 从任务记录整体回算统计值。
 * @param {Array} tasks - 全部任务
 * @param {Date} [today] - 参考日期，测试用
 * @returns {{ doneCount: number, streakDays: number, growthLevel: number }}
 */
export function computeStats(tasks, today = new Date()) {
  const doneCount = countDoneTasks(tasks)
  return {
    doneCount,
    streakDays: calcStreak(tasks, today),
    growthLevel: growthLevel(doneCount)
  }
}

export { nowDateTimeString }

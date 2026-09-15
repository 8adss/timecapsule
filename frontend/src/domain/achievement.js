/**
 * 成就判定。
 *
 * 对应后端 `AchievementService`。核心语义：**按里程碑发放**，而不是每完成
 * 一个任务就发一条，否则成就列表会被刷屏、失去意义。
 *
 * 后端靠数据库唯一索引 `uk_user_type_value` + 捕获 `DuplicateKeyException`
 * 保证幂等（并发安全）。本地是单用户单线程，幂等改为「查一下已发的有哪些」
 * 即可，但**结论必须与后端一致**——否则从旧版本导入的成就会出现重复。
 */
import { DomainError } from './errors.js'
import { ACHIEVEMENT_TYPE, MILESTONES } from './constants.js'

/**
 * 该类型在 `current` 这个累计值下已经达到的全部里程碑。
 *
 * 注意循环里的 `break` 而不是 `continue`：里程碑是升序数组，
 * 一旦某个没达到，后面的更达不到，提前退出即可。
 *
 * @param {string} type - 成就类型，取值见 ACHIEVEMENT_TYPE
 * @param {number} current - 当前累计值（完成数 / 开启数 / 连续天数）
 * @returns {number[]} 已达成的里程碑数值，升序
 */
export function milestonesReached(type, current) {
  const all = MILESTONES[type]
  if (!all) {
    throw new DomainError(`未知的成就类型：${type}`)
  }
  const reached = []
  for (const milestone of all) {
    if (current < milestone) break
    reached.push(milestone)
  }
  return reached
}

/**
 * 在已达成的里程碑里，筛出尚未发放的那些。
 *
 * @param {string} type - 成就类型
 * @param {number} current - 当前累计值
 * @param {Iterable<number>} grantedValues - 该类型下已发放的里程碑数值
 * @returns {number[]} 本次应当新发放的里程碑，升序
 */
export function newMilestones(type, current, grantedValues) {
  const granted = new Set(grantedValues)
  return milestonesReached(type, current).filter((milestone) => !granted.has(milestone))
}

/**
 * 该类型下已发放的里程碑数值。
 * @param {Array<{type: string, value: number}>} achievements - 全部成就
 * @param {string} type - 成就类型
 * @returns {number[]}
 */
export function grantedValuesOf(achievements, type) {
  return achievements.filter((item) => item.type === type).map((item) => item.value)
}

/**
 * 成就列表的排序：先按类型，再按达成数值升序。
 * 与后端 `AchievementService.listByUser` 的 `orderByAsc(type).orderByAsc(value)` 一致。
 *
 * @param {Array<{type: string, value: number}>} achievements
 * @returns {Array} 排序后的新数组
 */
export function sortAchievements(achievements) {
  return [...achievements].sort((left, right) => {
    if (left.type !== right.type) {
      return left.type < right.type ? -1 : 1
    }
    return left.value - right.value
  })
}

export { ACHIEVEMENT_TYPE }

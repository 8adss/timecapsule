/**
 * 时间胶囊领域逻辑。
 *
 * 逐条对应后端 `CapsuleService` 与 `TaskService.resolveCapsuleToDate`。
 *
 * 这里有个**踩过坑的细节**，注释必须留下：解析开启时间时**绝不能用「当前时间」兜底**。
 * 初版就是这么写的，结果用户不填截止时间时，胶囊一创建就已经到期，
 * 下一分钟被自动开启——「写给未来」变成了「写给现在」。
 */
import { DomainError, requireText } from './errors.js'
import { newId } from './id.js'
import { CAPSULE_STATUS, DEFAULT_CAPSULE_DAYS } from './constants.js'
import { compareDateTime, isAtOrAfter, nowDateTimeString } from './time.js'

/**
 * 解析胶囊的开启时间。
 *
 * 优先级：显式指定的开启时间 → 任务截止时间 → 默认 7 天后。
 *
 * @param {{ capsuleToDate?: string|null, dueDate?: string|null }} input
 * @param {Date} [now] - 参考时刻
 * @returns {string} 开启时间
 */
export function resolveCapsuleToDate(input, now = new Date()) {
  if (input.capsuleToDate) {
    return input.capsuleToDate
  }
  if (input.dueDate) {
    return input.dueDate
  }
  const fallback = new Date(now.getTime())
  fallback.setDate(fallback.getDate() + DEFAULT_CAPSULE_DAYS)
  return nowDateTimeString(fallback)
}

/**
 * 构造一条新胶囊。
 *
 * @param {object} input
 * @param {string} input.content - 写给未来的话，必填
 * @param {string} input.toDate - 开启时间，必填且必须晚于当前时间
 * @param {string|null} [input.taskId] - 关联任务，可为空（支持独立胶囊）
 * @param {string|null} [input.voiceUrl]
 * @param {Date} [now] - 参考时刻
 * @returns {object} 新胶囊实体
 * @throws {DomainError} 内容为空 / 开启时间为空 / 开启时间不在将来
 */
export function buildCapsule(input, now = new Date()) {
  const content = requireText(input.content, '给未来的话不能为空', {
    key: 'errors.capsuleContentRequired'
  })

  if (!input.toDate) {
    throw new DomainError('胶囊开启时间不能为空', { key: 'errors.capsuleToDateRequired' })
  }
  if (!isAtOrAfter(input.toDate, nowDateTimeString(now))) {
    throw new DomainError('胶囊开启时间必须晚于当前时间', { key: 'errors.capsuleToDateMustBeFuture' })
  }

  const timestamp = nowDateTimeString(now)
  return {
    id: newId(),
    taskId: input.taskId ?? null,
    toDate: input.toDate,
    content,
    voiceUrl: input.voiceUrl ?? null,
    status: CAPSULE_STATUS.SEALED,
    openedAt: null,
    deleted: 0,
    createdAt: timestamp,
    updatedAt: timestamp
  }
}

/**
 * 开启胶囊。
 * 幂等：已经开启过的原样返回，`changed` 为 false，调用方据此不重复发成就。
 *
 * @param {object} capsule - 原胶囊
 * @param {Date} [now] - 开启时刻
 * @returns {{ capsule: object, changed: boolean }}
 */
export function openCapsuleEntity(capsule, now = new Date()) {
  if (capsule.status === CAPSULE_STATUS.OPENED) {
    return { capsule, changed: false }
  }
  const timestamp = nowDateTimeString(now)
  return {
    capsule: {
      ...capsule,
      status: CAPSULE_STATUS.OPENED,
      openedAt: timestamp,
      updatedAt: timestamp
    },
    changed: true
  }
}

/**
 * 找出到期应当自动开启的胶囊。
 * 条件：封存中 + 开启时间已到。
 *
 * @param {Array} capsules - 全部胶囊
 * @param {Date} [now] - 参考时刻
 * @returns {string[]} 需要开启的胶囊 id
 */
export function dueCapsuleIds(capsules, now = new Date()) {
  const timestamp = nowDateTimeString(now)
  return capsules
    .filter((capsule) => capsule.deleted !== 1
      && capsule.status === CAPSULE_STATUS.SEALED
      && capsule.toDate
      && isAtOrAfter(timestamp, capsule.toDate))
    .map((capsule) => capsule.id)
}

/**
 * 批量开启到期胶囊。
 * @param {Array} capsules - 全部胶囊
 * @param {Date} [now] - 参考时刻
 * @returns {{ capsules: Array, openedCount: number, changed: boolean }}
 */
export function autoOpenExpired(capsules, now = new Date()) {
  const ids = new Set(dueCapsuleIds(capsules, now))
  if (ids.size === 0) {
    return { capsules, openedCount: 0, changed: false }
  }
  const timestamp = nowDateTimeString(now)
  return {
    capsules: capsules.map((capsule) => (ids.has(capsule.id)
      ? { ...capsule, status: CAPSULE_STATUS.OPENED, openedAt: timestamp, updatedAt: timestamp }
      : capsule)),
    openedCount: ids.size,
    changed: true
  }
}

/**
 * 可见胶囊（排除逻辑删除）。
 * @param {Array} capsules
 * @returns {Array}
 */
export function visibleCapsules(capsules) {
  return capsules.filter((capsule) => capsule.deleted !== 1)
}

/**
 * 列表排序：先按状态升序（封存中的排前面），同状态内按开启时间倒序。
 * 与后端 `orderByAsc(status).orderByDesc(toDate)` 一致。
 *
 * @param {Array} capsules
 * @returns {Array} 排序后的新数组
 */
export function sortCapsules(capsules) {
  return [...capsules].sort((left, right) => {
    if (left.status !== right.status) {
      return left.status - right.status
    }
    return compareDateTime(right.toDate, left.toDate)
  })
}

/**
 * 已开启胶囊的排序：按开启时间倒序。
 * 对应后端 `listOpened` 的 `orderByDesc(openedAt)`。
 *
 * @param {Array} capsules
 * @returns {Array}
 */
export function sortOpenedCapsules(capsules) {
  return [...capsules].sort((left, right) => compareDateTime(right.openedAt, left.openedAt))
}

/**
 * 已开启的胶囊数量。
 * @param {Array} capsules
 * @returns {number}
 */
export function countOpened(capsules) {
  return capsules.filter((capsule) => capsule.deleted !== 1
    && capsule.status === CAPSULE_STATUS.OPENED).length
}

export { CAPSULE_STATUS }

/**
 * 任务领域逻辑。
 *
 * 逐条对应后端 `TaskService`。三处容易写错、需要特别留意：
 * 1. **状态不可能由客户端直接设置** —— 只能通过 complete / abandon 两个动作改变，
 *    否则用户能把任务直接改成「已完成」来白刷成就。
 * 2. **完成操作幂等** —— 重复点击不会重复发放成就。
 * 3. **逾期是派生状态** —— 由到期时间自动标记，不是用户能选的值。
 */
import { DomainError, requireText } from './errors.js'
import { newId } from './id.js'
import { DEFAULT_TASK_CATEGORY, TASK_STATUS } from './constants.js'
import { compareDateTime, isBefore, nowDateTimeString } from './time.js'

/** 只有这些字段允许被客户端修改。status / completedAt / id 不在其中。 */
const PATCHABLE_FIELDS = Object.freeze([
  'title',
  'category',
  'description',
  'startDate',
  'dueDate',
  'remindTime'
])

/**
 * 构造一条新任务。
 *
 * @param {object} input - 创建请求
 * @param {string} input.title - 任务名称，必填
 * @param {string} [input.category] - 类别，缺省为「习惯」
 * @param {string} [input.description]
 * @param {string|null} [input.startDate] - 缺省为当前时间
 * @param {string|null} [input.dueDate]
 * @param {string|null} [input.remindTime]
 * @param {Date} [now] - 参考时刻，测试用
 * @returns {object} 新任务实体
 */
export function buildTask(input, now = new Date()) {
  const timestamp = nowDateTimeString(now)
  return {
    id: newId(),
    title: requireText(input.title, '请填写任务名称', { key: 'errors.taskNameRequired' }),
    category: typeof input.category === 'string' && input.category.trim() !== ''
      ? input.category.trim()
      : DEFAULT_TASK_CATEGORY,
    description: input.description ?? null,
    startDate: input.startDate ?? timestamp,
    dueDate: input.dueDate ?? null,
    remindTime: input.remindTime ?? null,
    status: TASK_STATUS.ONGOING,
    completedAt: null,
    deleted: 0,
    createdAt: timestamp,
    updatedAt: timestamp
  }
}

/**
 * 把允许修改的字段应用到任务上，返回新对象。
 *
 * 与后端 `TaskService.update` 的两点关系，都需要说清楚：
 *
 * 1. **相同**：`title` / `category` 传空字符串时保持原值——那是「没填」而不是「清空」。
 *
 * 2. **有意不同**：其余字段（`description` / `startDate` / `dueDate` / `remindTime`）
 *    传 `null` 时会**真的写成 null**；后端则不会。
 *    原因是后端 `taskMapper.updateById(task)` 走 MyBatis-Plus 的默认
 *    NOT_NULL 更新策略（`application.yml` 里没有覆盖 `update-strategy`），
 *    null 字段被跳过，于是**用户在界面上根本清不掉截止时间**：
 *    点掉日期选择器的清除按钮、保存，回读仍是旧值。
 *    这是后端的一个缺陷，本地实现没有照抄。
 *
 *    需要留意的连带效果：清空 `dueDate` 之后该任务不再满足「有截止时间」
 *    这一条件，因此永远不会被维护任务标记为「已逾期」——这符合预期
 *    （没有截止时间就无所谓逾期），但与改造前的表现不同。
 *
 * @param {object} task - 原任务
 * @param {object} patch - 变更内容
 * @param {Date} [now] - 参考时刻，测试用
 * @returns {object} 变更后的新任务
 */
export function applyTaskPatch(task, patch, now = new Date()) {
  const next = { ...task }
  for (const field of PATCHABLE_FIELDS) {
    if (!(field in patch)) continue
    const value = patch[field]
    if ((field === 'title' || field === 'category') && typeof value === 'string' && value.trim() === '') {
      continue
    }
    next[field] = field === 'title' || field === 'category' ? value.trim() : (value ?? null)
  }
  next.updatedAt = nowDateTimeString(now)
  return next
}

/**
 * 标记任务完成。
 *
 * 幂等：已经是完成态时原样返回，调用方据此不会重复触发成就发放。
 *
 * @param {object} task - 原任务
 * @param {Date} [now] - 完成时刻
 * @returns {{ task: object, changed: boolean }} 变更后的任务与是否真的发生了变化
 */
export function completeTask(task, now = new Date()) {
  if (task.status === TASK_STATUS.DONE) {
    return { task, changed: false }
  }
  const timestamp = nowDateTimeString(now)
  return {
    task: {
      ...task,
      status: TASK_STATUS.DONE,
      completedAt: timestamp,
      updatedAt: timestamp
    },
    changed: true
  }
}

/**
 * 标记任务为已放弃。
 * 已完成的任务不允许再放弃——那会让用户抹掉一条已经计入成就的记录。
 *
 * @param {object} task - 原任务
 * @param {Date} [now] - 参考时刻
 * @returns {object} 变更后的新任务
 * @throws {DomainError} 任务已完成时
 */
export function abandonTask(task, now = new Date()) {
  if (task.status === TASK_STATUS.DONE) {
    throw new DomainError('已完成的任务不能标记为放弃', { key: 'errors.cannotAbandonDoneTask' })
  }
  return {
    ...task,
    status: TASK_STATUS.ABANDONED,
    updatedAt: nowDateTimeString(now)
  }
}

/**
 * 找出应当被标记为逾期的任务。
 *
 * 条件是「进行中 + 有截止时间 + 截止时间已过」，三者缺一不可：
 * 没有截止时间的任务永远不会逾期，已放弃的也不会。
 *
 * @param {Array} tasks - 全部任务
 * @param {Date} [now] - 参考时刻
 * @returns {string[]} 需要更新的任务 id
 */
export function overdueTaskIds(tasks, now = new Date()) {
  const timestamp = nowDateTimeString(now)
  return tasks
    .filter((task) => task.deleted !== 1
      && task.status === TASK_STATUS.ONGOING
      && task.dueDate
      && isBefore(task.dueDate, timestamp))
    .map((task) => task.id)
}

/**
 * 把逾期标记应用到任务列表。
 * @param {Array} tasks - 全部任务
 * @param {Date} [now] - 参考时刻
 * @returns {{ tasks: Array, changed: boolean }} 新列表与是否发生变更
 */
export function markOverdue(tasks, now = new Date()) {
  const ids = new Set(overdueTaskIds(tasks, now))
  if (ids.size === 0) {
    return { tasks, changed: false }
  }
  const timestamp = nowDateTimeString(now)
  return {
    tasks: tasks.map((task) => (ids.has(task.id)
      ? { ...task, status: TASK_STATUS.OVERDUE, updatedAt: timestamp }
      : task)),
    changed: true
  }
}

/**
 * 可见任务（排除逻辑删除）。
 * @param {Array} tasks
 * @returns {Array}
 */
export function visibleTasks(tasks) {
  return tasks.filter((task) => task.deleted !== 1)
}

/**
 * 列表排序：先按状态升序（进行中排最前），同状态内按创建时间倒序。
 * 与后端 `orderByAsc(status).orderByDesc(createdAt)` 一致。
 *
 * @param {Array} tasks
 * @returns {Array} 排序后的新数组
 */
export function sortTasks(tasks) {
  return [...tasks].sort((left, right) => {
    if (left.status !== right.status) {
      return left.status - right.status
    }
    return compareDateTime(right.createdAt, left.createdAt)
  })
}

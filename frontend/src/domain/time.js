/**
 * 领域层的时间工具。
 *
 * 全应用统一使用 `'yyyy-MM-dd HH:mm:ss'` 本地时间字符串，**不使用 epoch 毫秒**。
 * 理由：该格式定长且零填充，**字典序恰好等于时间序**，可以直接用 `<` `>` 比较、
 * 用 `sort()` 排序，既不必构造 Date 对象，也不会踩时区转换的坑。
 *
 * 后端原先也是这个约定（JacksonConfig 把 LocalDateTime 钉死成同一格式），
 * 所以从 MySQL 迁到本地存储时，时间字段不需要做任何换算。
 */
import { toDateTimeString, parseDateTime } from '../utils/date.js'

/** 把当前（或指定）时刻转成领域内统一的日期时间字符串。 */
export function nowDateTimeString(value = new Date()) {
  return toDateTimeString(value)
}

/**
 * 取日期部分 `'yyyy-MM-dd'`。
 * @param {string|Date|null|undefined} value - 日期时间字符串或 Date
 * @returns {string|null} 日期键，无法解析时返回 null
 */
export function dateKey(value) {
  const text = toDateTimeString(value)
  return text === null ? null : text.slice(0, 10)
}

/**
 * 日期键加减天数。
 * @param {string} key - `'yyyy-MM-dd'`
 * @param {number} delta - 天数，可为负
 * @returns {string} 新的日期键
 */
export function shiftDay(key, delta) {
  const date = parseDateTime(`${key} 00:00:00`)
  date.setDate(date.getDate() + delta)
  return dateKey(date)
}

/**
 * 比较两个日期时间字符串。
 *
 * 依赖「定长零填充 ⇒ 字典序即时间序」这一性质。若将来有人把格式改成
 * 不补零（如 `2026-9-5`），本函数与所有基于它的排序都会静默出错——
 * 这也是格式必须由本模块统一产出的原因。
 *
 * @param {string|null|undefined} a
 * @param {string|null|undefined} b
 * @returns {number} a 早于 b 返回 -1，晚于返回 1，相等或同为空返回 0
 */
export function compareDateTime(a, b) {
  if (!a && !b) return 0
  if (!a) return -1
  if (!b) return 1
  if (a === b) return 0
  return a < b ? -1 : 1
}

/** a 是否严格早于 b。 */
export function isBefore(a, b) {
  return compareDateTime(a, b) < 0
}

/** a 是否晚于或等于 b。 */
export function isAtOrAfter(a, b) {
  return compareDateTime(a, b) >= 0
}

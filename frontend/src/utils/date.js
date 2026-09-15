// 日期时间工具
//
// 背景：后端约定所有 LocalDateTime 收发都用 'yyyy-MM-dd HH:mm:ss'（本地时间）。
// 如果把 JS 的 Date 对象直接交给 JSON.stringify，会序列化成 UTC 的 ISO 字符串
// （例如 '2026-09-10T13:00:00.000Z'），后端会把它当成本地时间存进去，
// 结果整体偏移一个时区（东八区差 8 小时）。所以提交前一律转成字符串。

const pad = (n) => String(n).padStart(2, '0')

/** 把 Date（或可被 Date 解析的值）转成后端要的 'yyyy-MM-dd HH:mm:ss' */
export function toDateTimeString(value) {
  if (!value) return null
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} `
    + `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

/** 把后端的 'yyyy-MM-dd HH:mm:ss' 转成 Date，用于 el-date-picker 回填 */
export function parseDateTime(value) {
  if (!value) return null
  if (value instanceof Date) return value
  // 空格换成 T 再解析：各浏览器对 'yyyy-MM-dd HH:mm:ss' 的处理不一致，T 形式是标准写法
  const date = new Date(String(value).replace(' ', 'T'))
  return Number.isNaN(date.getTime()) ? null : date
}

/** 展示用：后端返回的字符串直接去掉 T，兼容一下 ISO 格式 */
export function formatDateTime(value) {
  if (!value) return '—'
  return String(value).replace('T', ' ').slice(0, 16)
}

/** 只显示到日期 */
export function formatDate(value) {
  if (!value) return '—'
  return String(value).replace('T', ' ').slice(0, 10)
}

/**
 * 距离目标时间还有多久，用于胶囊倒计时。
 * 返回 { expired, text }，例如 { expired: false, text: '还有 12 天' }
 */
export function countdown(target) {
  const date = parseDateTime(target)
  if (!date) return { expired: false, text: '—' }

  const diff = date.getTime() - Date.now()
  if (diff <= 0) return { expired: true, text: '已到期' }

  const minutes = Math.floor(diff / 60000)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)

  if (days > 0) return { expired: false, text: `还有 ${days} 天` }
  if (hours > 0) return { expired: false, text: `还有 ${hours} 小时` }
  if (minutes > 0) return { expired: false, text: `还有 ${minutes} 分钟` }
  return { expired: false, text: '不到 1 分钟' }
}

/** 当前时间往后 n 天，作为表单默认值 */
export function daysFromNow(days) {
  const date = new Date()
  date.setDate(date.getDate() + days)
  return date
}

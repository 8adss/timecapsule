/**
 * 备份格式的校验与合并。
 *
 * 这个模块处理的是**完全不可信的数据**：用户从网上拿到的、别人发来的、
 * 手工改过的 JSON 文件都会被喂进 `validateBackup`。所以它的写法与仓库里
 * 其他模块刻意不同，有几条不能妥协的规则：
 *
 * 1. **字段白名单，而不是黑名单。** 输出的每个对象都是逐字段显式构造的，
 *    从来不 `{...raw}`、不 `Object.assign`、不遍历输入对象的键。
 *    这样 `__proto__` / `constructor` 这类键根本进不来——如果反过来做
 *    「拷贝全部再删掉危险的」，漏掉一个键就变成原型污染漏洞。
 *
 * 2. **类型、长度、取值范围逐项校验。** 只有一个 20MB 的文件大小上限是不够的：
 *    一个 19MB 的字符串字段照样能把界面卡死。每个字段都有自己的上限。
 *
 * 3. **任何一处不合法就整份拒绝，不做部分导入。** 「能导多少导多少」听起来
 *    友好，实际是让用户在一个半损坏的数据集上继续用——远比直接报错危险。
 *
 * 4. **头像地址走协议白名单。** `avatarUrl` 最终会进 `<img :src>`，只接受
 *    `data:image/(jpeg|png|webp|gif);base64,` 与 `http(s)://`。
 *    刻意排除 `data:image/svg+xml`：SVG 可以内嵌脚本。
 */

/** 备份文件的标识与版本。 */
export const BACKUP_FORMAT = 'timecapsule-backup'
export const BACKUP_FORMAT_VERSION = 1

/** 文件大小上限（字节）。超过直接拒绝，不读进内存解析。 */
export const MAX_BACKUP_BYTES = 20 * 1024 * 1024

/** 单个集合的条目数上限，防止用超大数组拖死页面。 */
const MAX_ITEMS = 50_000

/** 各字段长度上限。取值参考原 MySQL 表定义，只放宽不收紧。 */
const LIMITS = Object.freeze({
  id: 64,
  title: 100,
  category: 20,
  description: 500,
  capsuleContent: 65_535,
  nickname: 50,
  avatarUrl: 1_000_000,
  url: 2_048,
  milestoneValue: 1_000_000,
  settingsKeys: 100
})

const DATE_TIME_RE = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/
const DATA_IMAGE_RE = /^data:image\/(jpeg|png|webp|gif);base64,[A-Za-z0-9+/]+={0,2}$/
const HTTP_URL_RE = /^https?:\/\//i

/** 这些键一旦被合并进普通对象，会污染 Object.prototype。见到即拒绝整份文件。 */
const DANGEROUS_KEYS = Object.freeze(['__proto__', 'constructor', 'prototype'])

/** 合法的成就类型。与 domain/constants.js 保持一致。 */
const ACHIEVEMENT_TYPES = Object.freeze(['任务完成', '胶囊开启', '连续打卡'])

/** 任务状态与胶囊状态的合法取值。 */
const TASK_STATUSES = Object.freeze([0, 1, 2, 3])
const CAPSULE_STATUSES = Object.freeze([0, 1])

/** 默认任务分类，与 domain/constants.js 的 DEFAULT_TASK_CATEGORY 一致。 */
const DEFAULT_CATEGORY = '习惯'

/** 是不是普通对象（排除数组与 null）。 */
function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** 检查一个对象自身是否携带危险键。 */
function hasDangerousKey(value) {
  if (!isPlainObject(value)) return false
  return DANGEROUS_KEYS.some((key) => Object.prototype.hasOwnProperty.call(value, key))
}

// ---------------------------------------------------------------------------
// 字段级校验器
//
// 统一约定：校验失败时往 errors 里推一条人话描述，并返回一个占位值。
// 占位值最终不会被使用——只要有任意一条错误，整份导入就会被拒绝。
// ---------------------------------------------------------------------------

function checkString(value, max, path, errors, { optional = false } = {}) {
  if (value === null || value === undefined) {
    if (optional) return null
    errors.push(`${path} 缺失`)
    return ''
  }
  if (typeof value !== 'string') {
    errors.push(`${path} 应为字符串`)
    return ''
  }
  if (value.length > max) {
    errors.push(`${path} 长度 ${value.length} 超出上限 ${max}`)
    return value.slice(0, max)
  }
  return value
}

function checkDateTime(value, path, errors, { optional = true } = {}) {
  if (value === null || value === undefined) {
    if (optional) return null
    errors.push(`${path} 缺失`)
    return null
  }
  if (typeof value !== 'string' || !DATE_TIME_RE.test(value)) {
    errors.push(`${path} 不是合法的 yyyy-MM-dd HH:mm:ss 时间`)
    return null
  }
  return value
}

function checkEnum(value, allowed, path, errors) {
  if (!allowed.includes(value)) {
    errors.push(`${path} 取值非法（允许：${allowed.join(' / ')}）`)
    return allowed[0]
  }
  return value
}

function checkFlag(value, path, errors) {
  if (value === undefined) return 0
  if (value !== 0 && value !== 1) {
    errors.push(`${path} 只能为 0 或 1`)
    return 0
  }
  return value
}

function checkCount(value, path, errors, { max = LIMITS.milestoneValue, min = 0 } = {}) {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) {
    errors.push(`${path} 应为 ${min}~${max} 之间的整数`)
    return min
  }
  return value
}

/**
 * 校验主键：必须是非空字符串。
 *
 * 空 id 与重复 id 都必须挡在门外，而且**必须在导入前挡住**。
 * 下游所有按 id 的操作都是 `list.map(item => item.id === id ? next : item)` —
 * 这个写法在 id 不唯一时会把**所有**同 id 的行一起替换成同一个对象。
 * 一份手工改过、复制粘贴时忘了改 id 的备份，导入后点一次「完成」
 * 就会把几条不同内容的记录全部塌成第一条的样子，静默丢掉其余数据。
 * 这类文件的来源很现实：用户自己拼的、别人发的、从旧版本导出的。
 */
function checkId(value, path, errors) {
  if (typeof value !== 'string' || value.trim() === '') {
    errors.push(`${path} 缺失或为空`)
    return ''
  }
  if (value.length > LIMITS.id) {
    errors.push(`${path} 长度超出上限 ${LIMITS.id}`)
    return value.slice(0, LIMITS.id)
  }
  return value
}

function checkAvatarUrl(value, path, errors) {
  if (value === null || value === undefined || value === '') return ''
  if (typeof value !== 'string') {
    errors.push(`${path} 应为字符串`)
    return ''
  }
  if (value.length > LIMITS.avatarUrl) {
    errors.push(`${path} 超出长度上限`)
    return ''
  }
  if (DATA_IMAGE_RE.test(value) || HTTP_URL_RE.test(value)) {
    return value
  }
  errors.push(`${path} 不是受支持的图片地址（只接受 data:image/(jpeg|png|webp|gif);base64 或 http(s) 链接）`)
  return ''
}

// ---------------------------------------------------------------------------
// 各集合的清洗
// ---------------------------------------------------------------------------

function sanitizeTask(raw, index, errors) {
  const path = `data.tasks[${index}]`
  if (!isPlainObject(raw)) {
    errors.push(`${path} 不是对象`)
    return null
  }
  return {
    id: checkId(raw.id, `${path}.id`, errors),
    title: checkString(raw.title, LIMITS.title, `${path}.title`, errors),
    category: checkString(raw.category, LIMITS.category, `${path}.category`, errors, { optional: true })
      ?? DEFAULT_CATEGORY,
    description: checkString(raw.description, LIMITS.description, `${path}.description`, errors, { optional: true }),
    startDate: checkDateTime(raw.startDate, `${path}.startDate`, errors),
    dueDate: checkDateTime(raw.dueDate, `${path}.dueDate`, errors),
    remindTime: checkDateTime(raw.remindTime, `${path}.remindTime`, errors),
    status: checkEnum(raw.status, TASK_STATUSES, `${path}.status`, errors),
    completedAt: checkDateTime(raw.completedAt, `${path}.completedAt`, errors),
    deleted: checkFlag(raw.deleted, `${path}.deleted`, errors),
    createdAt: checkDateTime(raw.createdAt, `${path}.createdAt`, errors, { optional: false }),
    updatedAt: checkDateTime(raw.updatedAt, `${path}.updatedAt`, errors, { optional: false })
  }
}

function sanitizeCapsule(raw, index, errors) {
  const path = `data.capsules[${index}]`
  if (!isPlainObject(raw)) {
    errors.push(`${path} 不是对象`)
    return null
  }
  return {
    id: checkId(raw.id, `${path}.id`, errors),
    taskId: checkString(raw.taskId, LIMITS.id, `${path}.taskId`, errors, { optional: true }),
    toDate: checkDateTime(raw.toDate, `${path}.toDate`, errors, { optional: false }),
    content: checkString(raw.content, LIMITS.capsuleContent, `${path}.content`, errors),
    voiceUrl: checkString(raw.voiceUrl, LIMITS.url, `${path}.voiceUrl`, errors, { optional: true }),
    status: checkEnum(raw.status, CAPSULE_STATUSES, `${path}.status`, errors),
    openedAt: checkDateTime(raw.openedAt, `${path}.openedAt`, errors),
    deleted: checkFlag(raw.deleted, `${path}.deleted`, errors),
    createdAt: checkDateTime(raw.createdAt, `${path}.createdAt`, errors, { optional: false }),
    updatedAt: checkDateTime(raw.updatedAt, `${path}.updatedAt`, errors, { optional: false })
  }
}

function sanitizeAchievement(raw, index, errors) {
  const path = `data.achievements[${index}]`
  if (!isPlainObject(raw)) {
    errors.push(`${path} 不是对象`)
    return null
  }
  return {
    id: checkId(raw.id, `${path}.id`, errors),
    type: checkEnum(raw.type, ACHIEVEMENT_TYPES, `${path}.type`, errors),
    value: checkCount(raw.value, `${path}.value`, errors, { min: 1 }),
    unlockedAt: checkDateTime(raw.unlockedAt, `${path}.unlockedAt`, errors, { optional: false })
  }
}

function sanitizeProfile(raw, errors) {
  const path = 'data.profile'
  if (raw === null || raw === undefined) return null
  if (!isPlainObject(raw)) {
    errors.push(`${path} 不是对象`)
    return null
  }
  return {
    id: checkString(raw.id, LIMITS.id, `${path}.id`, errors, { optional: true }) ?? 'local',
    nickname: checkString(raw.nickname, LIMITS.nickname, `${path}.nickname`, errors, { optional: true }) ?? '新朋友',
    avatarUrl: checkAvatarUrl(raw.avatarUrl, `${path}.avatarUrl`, errors),
    streakDays: checkCount(raw.streakDays, `${path}.streakDays`, errors, { max: 100_000 }),
    growthLevel: checkCount(raw.growthLevel, `${path}.growthLevel`, errors, { min: 1, max: 100_000 }),
    createdAt: checkDateTime(raw.createdAt, `${path}.createdAt`, errors, { optional: false }),
    updatedAt: checkDateTime(raw.updatedAt, `${path}.updatedAt`, errors, { optional: false })
  }
}

/** 设置项：只接受一层浅对象，值限标量。避免用它夹带任意结构。 */
function sanitizeSettings(raw, errors) {
  const path = 'data.settings'
  if (raw === null || raw === undefined) return {}
  if (!isPlainObject(raw)) {
    errors.push(`${path} 不是对象`)
    return {}
  }
  const keys = Object.keys(raw)
  if (keys.length > LIMITS.settingsKeys) {
    errors.push(`${path} 键数量 ${keys.length} 超出上限 ${LIMITS.settingsKeys}`)
    return {}
  }
  const out = {}
  for (const key of keys) {
    if (DANGEROUS_KEYS.includes(key)) {
      errors.push(`${path} 含非法键名 ${key}`)
      continue
    }
    if (key.length > 64) {
      errors.push(`${path} 键名过长`)
      continue
    }
    const value = raw[key]
    const type = typeof value
    if (value === null || type === 'string' || type === 'number' || type === 'boolean') {
      if (type === 'string' && value.length > LIMITS.url) {
        errors.push(`${path}.${key} 字符串过长`)
        continue
      }
      if (type === 'number' && !Number.isFinite(value)) {
        errors.push(`${path}.${key} 不是有限数值`)
        continue
      }
      // 显式赋值，不使用展开或 assign
      out[key] = value
    } else {
      errors.push(`${path}.${key} 的值类型不受支持（只允许字符串/数字/布尔/null）`)
    }
  }
  return out
}

/** 清洗一个数组型集合，并检查 id 不重复。 */
function sanitizeCollection(raw, name, sanitizeItem, errors, { uniqueIds = true } = {}) {
  if (raw === null || raw === undefined) return []
  if (!Array.isArray(raw)) {
    errors.push(`data.${name} 应为数组`)
    return []
  }
  if (raw.length > MAX_ITEMS) {
    errors.push(`data.${name} 条目数 ${raw.length} 超出上限 ${MAX_ITEMS}`)
    return []
  }

  const out = []
  const seenIds = new Set()
  for (let index = 0; index < raw.length; index += 1) {
    const item = sanitizeItem(raw[index], index, errors)
    if (item === null) continue

    // 重复 id 会让下游「按 id 替换」的写法一次改掉多行，必须整份拒绝。
    // checkId 已保证非空，这里只用管重复。
    if (uniqueIds && item.id !== '') {
      if (seenIds.has(item.id)) {
        errors.push(`data.${name}[${index}].id 与前面的条目重复（${item.id}）`)
      } else {
        seenIds.add(item.id)
      }
    }
    out.push(item)
  }
  return out
}

// ---------------------------------------------------------------------------
// 对外接口
// ---------------------------------------------------------------------------

/**
 * 校验并清洗一份备份数据。
 *
 * @param {unknown} raw - 已 JSON.parse 的内容
 * @returns {{ data: object, droppedFields: number }} 清洗后的数据
 * @throws {Error} 结构不合法、版本不支持，或任意字段校验失败
 */
export function validateBackup(raw) {
  if (!isPlainObject(raw)) {
    throw new Error('备份文件的内容不是一个对象，可能不是本应用的导出文件')
  }
  if (hasDangerousKey(raw)) {
    throw new Error('备份文件包含非法键名，已拒绝导入')
  }
  if (raw.format !== BACKUP_FORMAT) {
    throw new Error(`不是本应用的备份文件（format 应为 "${BACKUP_FORMAT}"）`)
  }
  if (!Number.isInteger(raw.formatVersion) || raw.formatVersion < 1) {
    throw new Error('备份文件缺少合法的 formatVersion')
  }
  if (raw.formatVersion > BACKUP_FORMAT_VERSION) {
    throw new Error(
      `备份文件版本 ${raw.formatVersion} 高于当前应用支持的 ${BACKUP_FORMAT_VERSION}，请先升级应用`
    )
  }
  if (!isPlainObject(raw.data)) {
    throw new Error('备份文件缺少 data 字段')
  }

  const errors = []
  const data = {
    profile: sanitizeProfile(raw.data.profile, errors),
    tasks: sanitizeCollection(raw.data.tasks, 'tasks', sanitizeTask, errors),
    capsules: sanitizeCollection(raw.data.capsules, 'capsules', sanitizeCapsule, errors),
    achievements: sanitizeCollection(raw.data.achievements, 'achievements', sanitizeAchievement, errors),
    settings: sanitizeSettings(raw.data.settings, errors)
  }

  if (errors.length > 0) {
    const preview = errors.slice(0, 3).join('；')
    const more = errors.length > 3 ? `；另有 ${errors.length - 3} 处问题` : ''
    throw new Error(`备份文件校验未通过：${preview}${more}`)
  }

  return { data }
}

/**
 * 组装一份可导出的备份。
 *
 * @param {object} data - 各集合的当前内容
 * @param {Date} [now] - 导出时刻
 * @returns {object} 备份对象（调用方负责 JSON.stringify 与下载）
 */
export function buildBackup(data, now = new Date()) {
  return {
    format: BACKUP_FORMAT,
    formatVersion: BACKUP_FORMAT_VERSION,
    exportedAt: now.toISOString(),
    app: 'TimeCapsule',
    data: {
      profile: data.profile ?? null,
      tasks: data.tasks ?? [],
      capsules: data.capsules ?? [],
      achievements: data.achievements ?? [],
      settings: data.settings ?? {}
    },
    counts: {
      tasks: (data.tasks ?? []).length,
      capsules: (data.capsules ?? []).length,
      achievements: (data.achievements ?? []).length
    }
  }
}

/** 按 updatedAt 取较新的那个；缺失 updatedAt 时以传入者为先。 */
function pickNewer(current, incoming) {
  if (!current) return incoming
  if (!incoming) return current
  return (incoming.updatedAt ?? '') >= (current.updatedAt ?? '') ? incoming : current
}

/** 按 id 合并两个集合，冲突时取 updatedAt 较新者。 */
function mergeById(currentList, incomingList) {
  const byId = new Map(currentList.map((item) => [item.id, item]))
  let added = 0
  let updated = 0
  for (const item of incomingList) {
    const existing = byId.get(item.id)
    if (!existing) {
      byId.set(item.id, item)
      added += 1
      continue
    }
    const winner = pickNewer(existing, item)
    if (winner === item) {
      byId.set(item.id, item)
      updated += 1
    }
  }
  return { list: [...byId.values()], added, updated }
}

/**
 * 合并成就。
 *
 * **按 (type, value) 而不是按 id 去重**，这一点很关键：两台设备各自解锁
 * 「任务完成 × 1」时，里程碑是同一个，但 id 是各自生成的 UUID。
 * 按 id 合并会得到两条一模一样的成就，里程碑判定随即失效。
 *
 * @param {Array} currentList
 * @param {Array} incomingList
 * @returns {{ list: Array, added: number }}
 */
function mergeAchievements(currentList, incomingList) {
  const seen = new Set(currentList.map((item) => `${item.type}\u0000${item.value}`))
  const list = [...currentList]
  let added = 0
  for (const item of incomingList) {
    const key = `${item.type}\u0000${item.value}`
    if (seen.has(key)) continue
    seen.add(key)
    list.push(item)
    added += 1
  }
  return { list, added }
}

/**
 * 把一份校验过的备份合并进现有数据。
 *
 * @param {object} current - 当前数据
 * @param {object} incoming - 已通过 validateBackup 的数据
 * @returns {{ data: object, summary: object }}
 */
export function mergeData(current, incoming) {
  const tasks = mergeById(current.tasks ?? [], incoming.tasks ?? [])
  const capsules = mergeById(current.capsules ?? [], incoming.capsules ?? [])
  const achievements = mergeAchievements(current.achievements ?? [], incoming.achievements ?? [])

  const profile = pickNewer(current.profile, incoming.profile)

  return {
    data: {
      profile,
      tasks: tasks.list,
      capsules: capsules.list,
      achievements: achievements.list,
      // 设置项以导入的为准：它是使用偏好，没有「更新」的时间戳可比
      settings: { ...(current.settings ?? {}), ...(incoming.settings ?? {}) }
    },
    summary: {
      tasksAdded: tasks.added,
      tasksUpdated: tasks.updated,
      capsulesAdded: capsules.added,
      capsulesUpdated: capsules.updated,
      achievementsAdded: achievements.added
    }
  }
}

/**
 * 用一份校验过的备份**整体替换**现有数据。
 *
 * 缺失的集合按空值处理——「替换」的语义是导入什么就是什么，
 * 而不是「只覆盖文件里出现过的那些键」。后者会让用户以为清空了，
 * 实际还留着上一份数据的残渣。
 *
 * @param {object} incoming - 已通过 validateBackup 的数据
 * @returns {{ data: object, summary: object }}
 */
export function replaceData(incoming) {
  return {
    data: {
      profile: incoming.profile ?? null,
      tasks: incoming.tasks ?? [],
      capsules: incoming.capsules ?? [],
      achievements: incoming.achievements ?? [],
      settings: incoming.settings ?? {}
    },
    summary: {
      tasksAdded: (incoming.tasks ?? []).length,
      tasksUpdated: 0,
      capsulesAdded: (incoming.capsules ?? []).length,
      capsulesUpdated: 0,
      achievementsAdded: (incoming.achievements ?? []).length
    }
  }
}

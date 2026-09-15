/**
 * 存储门面：仓储层只跟这里打交道，不直接碰 IndexedDB。
 *
 * 这样做的意义在二期才会兑现——微信小程序用的是 `wx.setStorage`，没有
 * IndexedDB。届时只需实现一个新的适配器并在这里注册，仓储与页面零改动。
 *
 * 适配器契约（`StorageAdapter`）：
 * @typedef {object} StorageAdapter
 * @property {string} name - 适配器标识，用于日志与排错
 * @property {(key: string) => Promise<unknown>} get - 读一个键，不存在返回 undefined
 * @property {(key: string, value: unknown) => Promise<void>} set - 写一个键
 * @property {(key: string) => Promise<void>} del - 删一个键
 * @property {() => Promise<string[]>} keys - 列出全部键
 * @property {() => Promise<void>} clear - 清空全部键
 * @property {(entries: Array<[string, unknown]>) => Promise<void>} bulkSet - 批量写
 */
import { createIndexedDbAdapter } from './adapters/indexeddb'
import { createMemoryAdapter } from './adapters/memory'
import { KEY, ALL_KEYS, SCHEMA_VERSION } from './keys'

export { KEY, ALL_KEYS, DATA_KEYS, SCHEMA_VERSION } from './keys'

/** 当前适配器。惰性创建，测试可通过 setAdapter 替换。 */
let current = null

/**
 * 替换当前适配器。
 *
 * 单元测试注入内存适配器用；应用代码不应调用它。
 * @param {import('./index.js').StorageAdapter | null} adapter - 新适配器，传 null 恢复默认
 */
export function setAdapter(adapter) {
  current = adapter
}

/**
 * 取当前适配器，未设置则创建默认的 IndexedDB 适配器。
 * @returns {import('./index.js').StorageAdapter}
 */
export function getAdapter() {
  if (current === null) {
    current = createIndexedDbAdapter()
  }
  return current
}

/**
 * 探测并初始化存储后端。**应当在应用启动时 await 一次。**
 *
 * 为什么需要探测而不是直接信任 IndexedDB：Firefox 隐私窗口（未开启
 * `dom.indexedDB.privateBrowsing.enabled`）、企业策略屏蔽站点数据、
 * 以及部分内嵌浏览器里，`indexedDB` 要么不存在要么访问即抛错。
 * 这种情况下若不降级，每个仓储调用都会 reject，用户看到的是
 * 「数据全部消失」外加一串英文技术报错——比明确告知「本次不保存」糟糕得多。
 *
 * 探测必须**真正访问一次数据库**才算数：`createStore` 只是构造一个描述对象，
 * 不碰 IndexedDB，光调它永远探测不出问题。
 *
 * @returns {Promise<{ mode: string, persistent: boolean, reason?: string }>}
 *          persistent 为 false 时调用方**必须**告知用户数据不会被保存
 */
export async function initStorage() {
  const indexedDb = createIndexedDbAdapter()
  try {
    await indexedDb.keys()
    setAdapter(indexedDb)
    return { mode: indexedDb.name, persistent: true }
  } catch (error) {
    const memory = createMemoryAdapter()
    setAdapter(memory)
    return {
      mode: memory.name,
      persistent: false,
      reason: error && error.message ? error.message : String(error)
    }
  }
}

/**
 * 读一个键。
 * @param {string} key - 键名，见 keys.js
 * @param {unknown} [fallback] - 键不存在时的返回值
 * @returns {Promise<unknown>} 键值，或 fallback
 */
export async function read(key, fallback = null) {
  const value = await getAdapter().get(key)
  return value === undefined ? fallback : value
}

/**
 * 写一个键。
 * @param {string} key - 键名
 * @param {unknown} value - 任意可被结构化克隆的值
 * @returns {Promise<void>}
 */
export async function write(key, value) {
  await getAdapter().set(key, value)
}

/**
 * 一次写入多个键。
 *
 * **本地化之后没有数据库事务了**，这是最接近事务的替代品：IndexedDB 的
 * `setMany` 在单个事务内完成，要么全成功要么全回滚。凡是「一次业务操作要改
 * 多份数据」的场景（完成任务同时改任务、成就、画像）都必须走这里，
 * 否则中途失败会留下「任务已完成但没有发成就」这类不一致状态。
 *
 * @param {Array<[string, unknown]>} entries - 键值对数组
 * @returns {Promise<void>}
 */
export async function writeMany(entries) {
  if (entries.length === 0) return
  await getAdapter().bulkSet(entries)
}

/**
 * 删除一个键。
 * @param {string} key - 键名
 * @returns {Promise<void>}
 */
export async function remove(key) {
  await getAdapter().del(key)
}

/**
 * 列出当前适配器里的全部键。
 * @returns {Promise<string[]>}
 */
export async function listKeys() {
  return getAdapter().keys()
}

/**
 * 清空本应用写入的全部键（不动外接端可能存在的其他数据）。
 * @returns {Promise<void>}
 */
export async function clearAll() {
  const adapter = getAdapter()
  for (const key of ALL_KEYS) {
    await adapter.del(key)
  }
}

/**
 * 确保 meta 键存在。
 *
 * 首次访问时写入 schemaVersion，让后续的导入与迁移能判断数据来源版本。
 * 幂等：已存在则不覆盖，避免把老版本号刷成新版本。
 * @returns {Promise<{ schemaVersion: number, createdAt: string }>}
 */
export async function ensureMeta() {
  const existing = await read(KEY.meta, null)
  if (existing !== null && typeof existing === 'object' && 'schemaVersion' in existing) {
    return existing
  }
  const meta = { schemaVersion: SCHEMA_VERSION, createdAt: new Date().toISOString() }
  await write(KEY.meta, meta)
  return meta
}

/**
 * 把本应用的键整体读成一个普通对象，供导出备份使用（M2 会用到）。
 * @returns {Promise<Record<string, unknown>>}
 */
export async function dumpAll() {
  const adapter = getAdapter()
  const entries = await Promise.all(ALL_KEYS.map(async (key) => [key, await adapter.get(key)]))
  return Object.fromEntries(entries.filter(([, value]) => value !== undefined))
}

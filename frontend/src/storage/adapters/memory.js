/**
 * 内存存储适配器。
 *
 * 用途有两个：
 * 1. **单元测试** —— Node 环境里没有 IndexedDB，仓储层测试必须能注入一个等价实现；
 * 2. **降级兜底** —— 浏览器禁用 IndexedDB（隐私模式、企业策略）时不至于白屏。
 *
 * 刻意做了深拷贝：真实存储读写都要序列化，共享引用会掩盖「改了一半没写回」这类 bug。
 * 用同一个适配器跑测试，才能保证测试结论对 IndexedDB 也成立。
 */

/** 深拷贝，保留 undefined 语义（structuredClone 不接受 undefined 顶层值）。 */
function clone(value) {
  if (value === undefined) return undefined
  return structuredClone(value)
}

/**
 * 创建一个内存适配器。
 * @param {Record<string, unknown>} [seed] - 初始数据，便于测试预置状态
 * @returns {import('../index.js').StorageAdapter}
 */
export function createMemoryAdapter(seed = {}) {
  const map = new Map(Object.entries(seed).map(([key, value]) => [key, clone(value)]))

  return {
    name: 'memory',

    async get(key) {
      return clone(map.get(key))
    },

    async set(key, value) {
      map.set(key, clone(value))
    },

    async del(key) {
      map.delete(key)
    },

    async keys() {
      return [...map.keys()]
    },

    async clear() {
      map.clear()
    },

    async bulkSet(entries) {
      for (const [key, value] of entries) {
        map.set(key, clone(value))
      }
    }
  }
}

/**
 * IndexedDB 存储适配器（生产环境默认）。
 *
 * 直接用 `idb-keyval`：它只有几百字节，把「打开数据库、升级、事务、错误处理」
 * 这些容易写错的样板都封好了。手写一版 IndexedDB 包装是这类项目最常见的
 * 自找麻烦——尤其是事务在 Safari 上提前提交的行为差异。
 *
 * 数据位置：IndexedDB 数据库 `timecapsule` 下的对象仓库 `kv`。
 * 用户清浏览器数据时会被一并清除，所以导出备份是必需品而不是可选项。
 */
import { createStore, get, set, del, keys, clear, setMany } from 'idb-keyval'

const DB_NAME = 'timecapsule'
const STORE_NAME = 'kv'

/**
 * 创建一个 IndexedDB 适配器。
 *
 * store 句柄惰性创建：`createStore` 只是构造一个描述对象，
 * 但把它挪进函数体内可以让「模块被导入」与「数据库被打开」彻底解耦——
 * 单元测试导入本模块时不会碰到 `indexedDB` 未定义的错误。
 *
 * @returns {import('../index.js').StorageAdapter}
 */
export function createIndexedDbAdapter() {
  let store = null
  const handle = () => {
    if (store === null) {
      store = createStore(DB_NAME, STORE_NAME)
    }
    return store
  }

  return {
    name: 'indexeddb',

    async get(key) {
      return get(key, handle())
    },

    async set(key, value) {
      await set(key, value, handle())
    },

    async del(key) {
      await del(key, handle())
    },

    async keys() {
      const result = await keys(handle())
      // idb-keyval 的 key 类型是 IDBValidKey，本应用只写字符串键
      return result.map(String)
    },

    async clear() {
      await clear(handle())
    },

    async bulkSet(entries) {
      await setMany(entries, handle())
    }
  }
}

/**
 * 写入串行化。
 *
 * 为什么需要它：仓储层的操作都是「读集合 → 改内存 → 整体写回」。两个操作
 * 交错执行时，后写的那个会覆盖前一个的结果，而用户看到的是两条操作都「成功」了。
 * 典型场景：用户在两个标签页里各点了一次「完成任务」，或者双击按钮。
 *
 * 两层保护：
 * 1. **跨标签页** —— 优先用 Web Locks API（`navigator.locks`）。它是浏览器原生
 *    提供的跨标签页互斥，Chrome 69+ / Firefox 96+ / Safari 15.4+ 均支持。
 * 2. **同页面兜底** —— Web Locks 不可用时（旧浏览器、非安全上下文、Node 测试环境），
 *    退化成一条 Promise 链，保证同页面内的操作不会交错。
 *
 * 注意这**不解决**「两台设备各改一份本地数据然后合并」的问题——那属于导入导出
 * 的合并语义，在 M2 处理。
 */

const LOCK_NAME = 'timecapsule:write'

/** 同页面兜底用的串行链。始终是一个已 settle 的 promise，避免未处理拒绝。 */
let chain = Promise.resolve()

/** 当前环境是否支持 Web Locks。 */
function hasWebLocks() {
  return typeof navigator !== 'undefined'
    && navigator.locks !== undefined
    && typeof navigator.locks.request === 'function'
}

/**
 * 在写锁内执行一段异步逻辑。
 *
 * @template T
 * @param {() => Promise<T>} fn - 需要互斥执行的读改写流程
 * @returns {Promise<T>} fn 的返回值
 */
export function withWriteLock(fn) {
  if (hasWebLocks()) {
    return navigator.locks.request(LOCK_NAME, fn)
  }

  const result = chain.then(() => fn())
  // 链本身吞掉异常，否则一次失败会污染后续所有操作
  chain = result.then(
    () => undefined,
    () => undefined
  )
  return result
}

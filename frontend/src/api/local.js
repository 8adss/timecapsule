/**
 * API 边界层的错误处理。
 *
 * 页面里的 `catch` 块都是空的，注释写着「错误提示已由 request 拦截器统一弹出」——
 * 本地化之后没有 axios 拦截器了，这个职责必须有人接住，否则所有失败都会静默：
 * 用户点了「完成任务」没反应，也不知道为什么。
 *
 * 所以把它放在这一层：**仓储层只抛错、不碰 UI**（可在 Node 里单测），
 * **页面保持原样**，由本函数作为两者之间唯一弹提示的地方。
 */
// ElMessage 由 unplugin-auto-import 自动引入，见 vite.config.js

/**
 * 执行一次本地操作，失败时弹出提示并把错误继续抛给调用方。
 *
 * 之所以仍然向上抛：页面需要知道失败并据此保持弹窗打开（例如表单校验不通过时
 * 不该关闭对话框）。吞掉错误会让页面误以为成功了。
 *
 * @template T
 * @param {() => Promise<T>} operation - 要执行的操作
 * @returns {Promise<T>} 操作结果
 */
export async function run(operation) {
  try {
    return await operation()
  } catch (error) {
    const message = error && error.message ? error.message : '操作失败'
    ElMessage.error(message)
    throw error
  }
}

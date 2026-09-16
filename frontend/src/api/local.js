/**
 * API 边界层的错误处理。
 *
 * 页面里的 `catch` 块都是空的，注释写着「错误提示已由 request 拦截器统一弹出」——
 * 本地化之后没有 axios 拦截器了，这个职责必须有人接住，否则所有失败都会静默：
 * 用户点了「完成任务」没反应，也不知道为什么。
 *
 * 所以把它放在这一层：**仓储层只抛错、不碰 UI**（可在 Node 里单测），
 * **页面保持原样**，由本函数作为两者之间唯一弹提示的地方。
 *
 * 这里还负责**把错误码翻成文案**。领域层抛出的错误带一个 `key`
 * （见 domain/errors.js 的说明），翻译发生在这一层而不是领域层，
 * 是为了让那些纯函数继续保持零依赖、可以被测试直接调用。
 */
import { i18n } from '../i18n'
// ElMessage 由 unplugin-auto-import 自动引入，见 vite.config.js

/**
 * 取一条错误该显示什么文案。
 *
 * 三级回退，顺序不能反：
 * 1. 有 `key` 且当前语言里确实存在 → 用翻译
 * 2. 否则用错误自带的 `message`（中文）——英文界面下看到中文虽然不理想，
 *    但比看到 `errors.taskNotFound` 这种原始键名强得多
 * 3. 连 message 都没有 → 一句通用文案
 *
 * 第 1 步必须先 `te()` 确认存在：vue-i18n 在键缺失时会把**键名本身**返回，
 * 不检查就会把 `errors.taskNotFound` 直接弹给用户。
 *
 * @param {unknown} error
 * @returns {string}
 */
function describe(error) {
  if (error && typeof error.key === 'string' && error.key !== '') {
    if (i18n.global.te(error.key)) {
      return i18n.global.t(error.key, error.params ?? {})
    }
  }
  if (error && typeof error.message === 'string' && error.message !== '') {
    return error.message
  }
  return i18n.global.t('errors.unknown')
}

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
    ElMessage.error(describe(error))
    throw error
  }
}

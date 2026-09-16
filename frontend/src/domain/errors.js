/**
 * 应用统一的「面向用户的错误」类型。
 *
 * 它同时承载两样东西，缺一不可：
 *
 * - **`message`：中文描述。** 它是开发者的读物——日志里、调试时直接看得懂；
 *   也是**没有提供 `key` 时的兜底文案**。
 * - **`key` + `params`：语言键与插值参数。** 界面按当前语言取文案，
 *   由 `api/local.js` 在弹出提示前完成翻译。
 *
 * 为什么不让领域层自己调翻译器：`domain/` 是刻意保持零依赖的纯函数层，
 * 这一层的测试可以直接调用它们、直接断言错误文案，不必启动 Vue 或 i18n。
 * 一旦让它们依赖翻译器，这层就要在测试里搭一套 i18n 环境，代价远大于收益。
 *
 * 也因此**测试断言的是中文 `message`**，而界面显示的是 `key` 翻出来的文案——
 * 两者各司其职。新增抛出点时请一并补上 `key`，只写中文的话英文界面会看到中文。
 */
export class DomainError extends Error {
  /**
   * @param {string} message - 中文描述，同时作为缺少 key 时的兜底文案
   * @param {{ key?: string, params?: Record<string, unknown>, status?: number }} [options]
   *        key 为 `errors.*` 下的语言键；status 是语义化状态码，默认 400
   */
  constructor(message, options = {}) {
    super(message)
    this.name = 'DomainError'
    /** 语言键，可能为 null（此时界面显示 message） */
    this.key = options.key ?? null
    /** 插值参数，例如 { max: 100 } */
    this.params = options.params ?? null
    /** 语义化状态码。页面据此区分「输入有问题」与「东西不存在」 */
    this.status = options.status ?? 400
  }
}

/**
 * 校验一段必填文本。
 *
 * @param {unknown} value - 待校验的值
 * @param {string} message - 中文兜底描述
 * @param {{ key?: string, params?: object }} [options] - 语言键与参数
 * @returns {string} 去掉两端空白后的文本
 * @throws {DomainError} 为空或不是字符串时
 */
export function requireText(value, message, options) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new DomainError(message, options)
  }
  return value.trim()
}

/**
 * 校验一段文本的长度上限，超了直接抛错。
 *
 * **为什么领域层也要管这件事**：界面上的 `maxlength` 只挡得住手输，
 * 挡不住「读文件填进来」那条路径——`FileReader` 是直接赋值给表单的。
 * 一旦超限的值落盘，导出备份时一切正常，**再导入回来却会被
 * `domain/backup.js` 按上限拒收**。「存得进去、导不回来」是最难查的一类问题
 * （用户会在换设备那天才发现），所以在写入这一侧就拦住。
 *
 * @param {unknown} value - 待校验的值，非字符串直接放行（交给别的校验器）
 * @param {number} max - 允许的最大长度
 * @param {string} message - 中文兜底描述
 * @param {{ key?: string, params?: object }} [options] - 语言键与参数，会并入 { max }
 * @returns {unknown} 原值
 * @throws {DomainError} 超长时
 */
export function requireMaxLength(value, max, message, options) {
  if (typeof value === 'string' && value.length > max) {
    throw new DomainError(message, {
      ...options,
      params: { ...(options?.params ?? {}), max }
    })
  }
  return value
}

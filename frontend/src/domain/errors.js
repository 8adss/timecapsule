/**
 * 领域错误。
 *
 * 对应后端的 `BusinessException`。保留 `code` 字段是为了让上层能区分
 * 「用户输入有问题」（400）与「找不到东西」（404），页面可以据此决定
 * 是提示用户改输入、还是刷新列表。
 */
export class DomainError extends Error {
  /**
   * @param {string} message - 面向用户的中文提示，会直接显示在 toast 上
   * @param {number} [code] - 语义化状态码，默认 400
   */
  constructor(message, code = 400) {
    super(message)
    this.name = 'DomainError'
    this.code = code
  }
}

/** 参数为空时的统一报错，减少重复分支。 */
export function requireText(value, message) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new DomainError(message)
  }
  return value.trim()
}

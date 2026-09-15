/**
 * 主键生成。
 *
 * 后端用的是 MySQL 自增 ID，本地化之后没有中心分配者，改用 UUID。
 * 选 UUID 而不是「取当前最大 ID + 1」有实际原因：**导入合并时不会撞号**。
 * 如果两台设备各自从 1 开始编号，合并备份时必然冲突，届时只能丢掉一边的数据。
 *
 * `crypto.randomUUID` 在浏览器需要安全上下文（https 或 localhost）。
 * 用户把构建产物用 `file://` 直接打开、或部署在 http 的局域网地址上时它不存在，
 * 因此保留一个降级分支——虽然随机性弱一些，但足以避免本机内的碰撞。
 */

/** 生成一个新的实体主键。 */
export function newId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  // 降级：时间戳 + 随机后缀。仅用于 crypto.randomUUID 不可用的环境。
  const random = Math.random().toString(16).slice(2, 10)
  return `id-${Date.now().toString(16)}-${random}`
}

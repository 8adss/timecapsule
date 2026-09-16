/**
 * 浏览器文件读写的薄封装。
 *
 * 放在 utils 而不是仓储层：这是纯浏览器能力（Blob 下载、File 读取），
 * 与业务无关，将来小程序端要换成 `wx.getFileSystemManager`，
 * 替换掉的也只有这一层。
 */
import { MAX_BACKUP_BYTES } from '../domain/backup.js'
import { DomainError } from '../domain/errors.js'

const pad = (n) => String(n).padStart(2, '0')

/**
 * 生成带时间戳的备份文件名，例如 `timecapsule-backup-20260915-213000.json`。
 * 用本地时间而非 UTC：用户看文件名时想对得上自己刚才的操作。
 *
 * @param {Date} [now]
 * @returns {string}
 */
export function backupFileName(now = new Date()) {
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`
    + `-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
  return `timecapsule-backup-${stamp}.json`
}

/**
 * 触发一次浏览器下载。
 *
 * 必须 `URL.revokeObjectURL`：不释放的话这份数据的副本会一直留在内存里，
 * 反复导出会持续占用。放在 finally 里确保异常路径也会释放。
 *
 * @param {string} filename
 * @param {string} text - 文件内容
 */
export function downloadText(filename, text) {
  const blob = new Blob([text], { type: 'application/json;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  try {
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = filename
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
  } finally {
    URL.revokeObjectURL(url)
  }
}

/**
 * 读取用户选择的 JSON 文件并解析。
 *
 * 两道前置检查都很有必要：
 * - **大小**：解析一个几百兆的文件会直接把标签页卡死，而用户只会以为「点了没反应」；
 *   在读取之前就挡住，才能给出有用的提示。
 * - **解析失败**：JSON.parse 的原始报错是英文且带位置信息，对用户没有意义，
 *   这里换成「不是合法的 JSON 文件」。
 *
 * @param {File} file
 * @returns {Promise<unknown>} 解析后的内容
 * @throws {Error} 文件过大、读取失败或不是合法 JSON
 */
export async function readJsonFile(file) {
  if (!file) {
    throw new DomainError('请选择要导入的备份文件', { key: 'errors.backupFileRequired' })
  }
  if (file.size > MAX_BACKUP_BYTES) {
    const limitMb = Math.round(MAX_BACKUP_BYTES / 1024 / 1024)
    throw new DomainError(`备份文件超过 ${limitMb} MB 上限`, {
      key: 'errors.backupFileTooLarge',
      params: { limitMb }
    })
  }

  let text
  try {
    text = await file.text()
  } catch {
    throw new DomainError('读取文件失败，请重试', { key: 'errors.fileReadFailed' })
  }

  try {
    return JSON.parse(text)
  } catch {
    throw new DomainError('文件不是合法的 JSON，可能已损坏或不是备份文件', {
      key: 'errors.fileNotJson'
    })
  }
}

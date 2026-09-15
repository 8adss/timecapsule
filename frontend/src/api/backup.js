/**
 * 备份接口：导出、导入、快照回滚、清空。
 *
 * 这里承担两类浏览器副作用，都不适合放进仓储层：
 * - 导出要触发文件下载
 * - 导入要从 File 对象读内容
 *
 * 仓储层只处理对象与存储，保持可在 Node 里单测。
 */
import { run } from './local'
import {
  IMPORT_MODE,
  clearAllData,
  createBackup,
  discardSnapshot,
  hasSnapshot,
  importBackup,
  readSnapshot,
  restoreSnapshot
} from '../repository/backupRepo'
import { backupFileName, downloadText, readJsonFile } from '../utils/file'

/**
 * 导出全部数据并触发下载。
 * @returns {Promise<{ tasks: number, capsules: number, achievements: number }>} 导出条数
 */
export const exportBackup = () => run(async () => {
  const backup = await createBackup()
  // 缩进两格：备份文件是给人看与手工检查的，压成一行没有好处
  downloadText(backupFileName(), JSON.stringify(backup, null, 2))
  return backup.counts
})

/**
 * 从用户选择的文件导入。
 * @param {File} file - 备份文件
 * @param {'merge'|'replace'} mode - 导入模式
 * @returns {Promise<{ mode: string, summary: object, counts: object }>}
 */
export const importFromFile = (file, mode) => run(async () => {
  const raw = await readJsonFile(file)
  return importBackup(raw, mode)
})

/** 当前快照的信息（无快照时返回 null）。 */
export const getSnapshot = () => run(() => readSnapshot())

/** 是否有可回滚的快照。 */
export const snapshotAvailable = () => run(() => hasSnapshot())

/** 回滚到快照。 */
export const rollbackToSnapshot = () => run(() => restoreSnapshot())

/** 丢弃快照。 */
export const dropSnapshot = () => run(() => discardSnapshot())

/** 清空全部数据（会先自动存快照）。 */
export const wipeAllData = () => run(() => clearAllData())

export { IMPORT_MODE }

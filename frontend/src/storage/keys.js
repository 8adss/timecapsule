/**
 * 本地存储的键名与数据版本。
 *
 * 设计要点：
 * - **一律分键存储**，不把所有数据塞进一个大对象。改一条任务只重写 tasks 那一键，
 *   不必把胶囊、成就、画像全部序列化一遍。
 * - **键名带版本前缀** `tc:v1:`。将来数据结构不兼容地变化时，可以并存 v2 键，
 *   写一个迁移函数按需搬运，而不是原地改数据冒丢失风险。
 * - `meta` 键记录 schemaVersion，供导入导出与迁移判断来源版本。
 */

/** 当前数据结构版本。任何不兼容的字段调整都应 +1，并补一个迁移函数。 */
export const SCHEMA_VERSION = 1

const NS = 'tc:v1'

/** 全部键名。集中在这里，避免散落在各仓储里手写字符串。 */
export const KEY = Object.freeze({
  meta: `${NS}:meta`,
  profile: `${NS}:profile`,
  tasks: `${NS}:tasks`,
  capsules: `${NS}:capsules`,
  achievements: `${NS}:achievements`,
  settings: `${NS}:settings`
})

/**
 * 属于「用户数据」的键，导入导出以此为范围。
 * `meta` 不在其中：它描述的是本地环境的版本状态，不该被一份备份文件覆盖。
 */
export const DATA_KEYS = Object.freeze([
  KEY.profile,
  KEY.tasks,
  KEY.capsules,
  KEY.achievements,
  KEY.settings
])

/** 本应用会写入的全部键，用于清空与整体导出。 */
export const ALL_KEYS = Object.freeze([KEY.meta, ...DATA_KEYS])

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
  settings: `${NS}:settings`,
  /**
   * 知识库文档（导入的个人资料，用于生成「我的分身」）。
   *
   * 新增这一项**不需要**升 SCHEMA_VERSION：它只是多了一个键，
   * 已有那些键里的数据结构一个字段都没动，旧数据读进来仍然完全合法。
   * 同理，**早期导出的备份文件照样能导入**——老文件的 data 里没有
   * knowledge，按空数组处理即可，这一点由 domain/backup.js 负责。
   */
  knowledge: `${NS}:knowledge`,
  /**
   * 导入 / 清空前的自动快照，用于一键回滚。
   *
   * **刻意不属于「用户数据」**：它是一次破坏性操作前的自救副本，
   * 不该出现在导出的备份文件里（否则会出现「备份里套着备份」的嵌套膨胀）。
   */
  snapshot: `${NS}:snapshot`
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
  KEY.settings,
  // 知识库必须在这里，否则导出备份时会静默漏掉它——
  // 而它恰恰是用户最舍不得丢的那份数据（自己写的日记、自我介绍）。
  KEY.knowledge
])

/** 本应用会写入的全部键，用于清空与整体导出。 */
export const ALL_KEYS = Object.freeze([KEY.meta, ...DATA_KEYS, KEY.snapshot])

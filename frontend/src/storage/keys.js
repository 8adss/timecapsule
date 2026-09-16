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
   * 「我的分身」：把知识库蒸馏成某个时间点的自己。
   *
   * 与 knowledge 一样，新增它不必升 SCHEMA_VERSION，老备份也照样能导入
   * （data 里没有 personas 就按空数组处理）。
   */
  personas: `${NS}:personas`,
  /**
   * 与「过去的你」（胶囊）和「何时的自己」（分身）的对话记录。
   * 同样不必升 SCHEMA_VERSION，老备份里没有这个键就按空数组处理。
   */
  dialogues: `${NS}:dialogues`,
  /**
   * AI 配置：供应商、模型，以及**用户自己的 API Key**。
   *
   * **刻意不属于「用户数据」**，理由比 snapshot 那条更硬：
   * 备份文件是拿来拷来拷去的（网盘、U 盘、发给朋友、贴进 issue），
   * 把密钥写进去就是个陷阱——用户不会意识到自己刚把 Key 分享出去了。
   * 所以它不进 DATA_KEYS，导出备份时不含它，换设备要重新填一次。
   *
   * 它进了 ALL_KEYS，于是底层的 `clearAll()`（把本应用写过的键全部删掉）会连它一起清。
   *
   * ⚠️ 但**设置页的「清空全部数据」不动它**（`backupRepo.clearAllData`）：
   * 那一步清的是用户数据，而它按上面的定义不是；而且快照里也没有它，
   * 真清掉就回滚不回来了——对话框上却写着「可以回滚」。
   * 要删 Key，设置页的 AI 配置那一节有明确的「清除配置」按钮。
   */
  aiConfig: `${NS}:aiConfig`,
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
  KEY.knowledge,
  // 「我的分身」同理：手写了几百字的画像，丢了没法重建。
  KEY.personas,
  // 对话记录也是「用户数据」：和那时的自己说过的话，丢了同样找不回来。
  // **但用户的 API Key 不在此列**，见 KEY.aiConfig 的说明。
  KEY.dialogues
])

/**
 * 本应用会写入的全部键。
 *
 * 用于两件事，**都不是「导出备份」**：
 * - `clearAll()`：本机全量重置，所以连 `aiConfig`（含密钥）也一起清；
 * - `dumpAll()`：调试用的全量转储。
 *
 * ⚠️ **不要拿 `dumpAll()` 的结果当备份文件给用户下载**——它会带上用户的 API Key。
 * 面向用户的导出走 `repository/backupRepo.js`，以 `DATA_KEYS` 为准。
 */
export const ALL_KEYS = Object.freeze([KEY.meta, ...DATA_KEYS, KEY.snapshot, KEY.aiConfig])

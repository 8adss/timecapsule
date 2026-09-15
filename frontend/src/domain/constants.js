/**
 * 领域常量。
 *
 * 全部从后端实体类原样搬过来（Task / TimeCapsule / Achievement 里的 public static final），
 * **取值一个都不能改**：这些数字会随导出文件一起流转，改了就与旧备份不兼容。
 */

/** 任务状态。对应后端 `Task.STATUS_*` */
export const TASK_STATUS = Object.freeze({
  /** 进行中 */
  ONGOING: 0,
  /** 已完成 */
  DONE: 1,
  /** 已逾期（自动标记，非用户操作） */
  OVERDUE: 2,
  /** 已放弃 */
  ABANDONED: 3
})

/** 胶囊状态。对应后端 `TimeCapsule.STATUS_*` */
export const CAPSULE_STATUS = Object.freeze({
  /** 封存中 */
  SEALED: 0,
  /** 已开启 */
  OPENED: 1
})

/**
 * 成就类型。对应后端 `Achievement.TYPE_*`。
 * 这些是**中文字符串**而不是枚举数字，改动会导致旧数据里的成就无法识别。
 */
export const ACHIEVEMENT_TYPE = Object.freeze({
  TASK_DONE: '任务完成',
  CAPSULE_OPENED: '胶囊开启',
  STREAK: '连续打卡'
})

/**
 * 各类型的解锁里程碑。对应后端三个 `*_MILESTONES` 数组。
 * 语义是「累计值达到里程碑即解锁」，不是「每达成一次发一次」——
 * 后者会把成就列表刷屏。
 */
export const MILESTONES = Object.freeze({
  [ACHIEVEMENT_TYPE.TASK_DONE]: Object.freeze([1, 3, 5, 10, 20, 50]),
  [ACHIEVEMENT_TYPE.CAPSULE_OPENED]: Object.freeze([1, 2, 3, 5, 10]),
  [ACHIEVEMENT_TYPE.STREAK]: Object.freeze([2, 3, 7, 14, 30, 100])
})

/** 成就类型的中文展示名，供列表分组使用。 */
export const ACHIEVEMENT_LABEL = Object.freeze({
  [ACHIEVEMENT_TYPE.TASK_DONE]: '任务完成',
  [ACHIEVEMENT_TYPE.CAPSULE_OPENED]: '胶囊开启',
  [ACHIEVEMENT_TYPE.STREAK]: '连续打卡'
})

/** 每完成多少个任务升一级。对应后端 `UserService.TASKS_PER_LEVEL` */
export const TASKS_PER_LEVEL = 5

/** 建任务时若既没给胶囊开启时间也没给截止时间，默认封存多久。对应 `TaskService.DEFAULT_CAPSULE_DAYS` */
export const DEFAULT_CAPSULE_DAYS = 7

/** 任务分类的默认值。对应 `TaskService.create` 里的 `"习惯"` */
export const DEFAULT_TASK_CATEGORY = '习惯'

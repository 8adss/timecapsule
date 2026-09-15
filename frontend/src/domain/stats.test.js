import { describe, it, expect } from 'vitest'
import { calcStreak, countDoneTasks, growthLevel, computeStats } from './stats.js'
import { TASK_STATUS } from './constants.js'

/** 造一条已完成任务，completedAt 用给定日期（本地时间当天中午，避开跨日歧义）。 */
function doneTask(dayKey) {
  return {
    id: `t-${dayKey}`,
    status: TASK_STATUS.DONE,
    deleted: 0,
    completedAt: `${dayKey} 12:00:00`
  }
}

describe('countDoneTasks', () => {
  it('只统计已完成的任务', () => {
    const tasks = [
      { status: TASK_STATUS.DONE, deleted: 0 },
      { status: TASK_STATUS.ONGOING, deleted: 0 },
      { status: TASK_STATUS.ABANDONED, deleted: 0 },
      { status: TASK_STATUS.OVERDUE, deleted: 0 }
    ]
    expect(countDoneTasks(tasks)).toBe(1)
  })

  it('排除逻辑删除的记录', () => {
    // 后端靠 MyBatis-Plus 的 @TableLogic 自动过滤，本地没有这层拦截，
    // 必须显式判断。漏掉这条会让「删掉的任务仍然计入等级」。
    const tasks = [
      { status: TASK_STATUS.DONE, deleted: 0 },
      { status: TASK_STATUS.DONE, deleted: 1 }
    ]
    expect(countDoneTasks(tasks)).toBe(1)
  })

  it('空列表返回 0', () => {
    expect(countDoneTasks([])).toBe(0)
  })
})

describe('growthLevel', () => {
  it('从 1 级起步', () => {
    expect(growthLevel(0)).toBe(1)
  })

  it('每 5 个任务升一级', () => {
    expect(growthLevel(4)).toBe(1)
    expect(growthLevel(5)).toBe(2)
    expect(growthLevel(9)).toBe(2)
    expect(growthLevel(10)).toBe(3)
  })
})

describe('calcStreak', () => {
  const today = new Date(2026, 8, 15, 20, 0, 0) // 2026-09-15

  it('没有完成记录时返回 0', () => {
    expect(calcStreak([], today)).toBe(0)
  })

  it('只有今天完成 → 1', () => {
    expect(calcStreak([doneTask('2026-09-15')], today)).toBe(1)
  })

  it('今天与昨天连续 → 2', () => {
    expect(calcStreak([doneTask('2026-09-15'), doneTask('2026-09-14')], today)).toBe(2)
  })

  it('今天还没完成、昨天完成了 → 仍然算 1（不清零）', () => {
    // 这是刻意的设计：否则每天早上打开页面都会看到打卡断了。
    expect(calcStreak([doneTask('2026-09-14')], today)).toBe(1)
  })

  it('昨天和前天连续、今天没完成 → 2', () => {
    expect(calcStreak([doneTask('2026-09-14'), doneTask('2026-09-13')], today)).toBe(2)
  })

  it('只有前天完成（昨天断了）→ 0', () => {
    expect(calcStreak([doneTask('2026-09-13')], today)).toBe(0)
  })

  it('中间断档时只数到断点为止', () => {
    const tasks = [
      doneTask('2026-09-15'),
      doneTask('2026-09-14'),
      // 09-13 缺失
      doneTask('2026-09-12'),
      doneTask('2026-09-11')
    ]
    expect(calcStreak(tasks, today)).toBe(2)
  })

  it('同一天完成多个任务只算一天', () => {
    const tasks = [
      doneTask('2026-09-15'),
      { ...doneTask('2026-09-15'), id: 'another' }
    ]
    expect(calcStreak(tasks, today)).toBe(1)
  })

  it('忽略已删除的完成记录', () => {
    const tasks = [
      doneTask('2026-09-15'),
      { ...doneTask('2026-09-14'), deleted: 1 }
    ]
    expect(calcStreak(tasks, today)).toBe(1)
  })

  it('跨月连续能正确回溯', () => {
    const firstOfMonth = new Date(2026, 8, 1, 20, 0, 0) // 2026-09-01
    const tasks = [doneTask('2026-09-01'), doneTask('2026-08-31'), doneTask('2026-08-30')]
    expect(calcStreak(tasks, firstOfMonth)).toBe(3)
  })
})

describe('computeStats', () => {
  it('一次算出三个统计值', () => {
    const today = new Date(2026, 8, 15, 20, 0, 0)
    const tasks = [
      doneTask('2026-09-15'),
      doneTask('2026-09-14'),
      { status: TASK_STATUS.ONGOING, deleted: 0 }
    ]
    expect(computeStats(tasks, today)).toEqual({
      doneCount: 2,
      streakDays: 2,
      growthLevel: 1
    })
  })
})

import { describe, it, expect } from 'vitest'
import {
  milestonesReached,
  newMilestones,
  grantedValuesOf,
  sortAchievements
} from './achievement.js'
import { ACHIEVEMENT_TYPE, MILESTONES } from './constants.js'

const TASK_DONE = ACHIEVEMENT_TYPE.TASK_DONE
const STREAK = ACHIEVEMENT_TYPE.STREAK

describe('里程碑定义', () => {
  it('与后端 AchievementService 的三个数组逐值一致', () => {
    // 这些数字会随导出文件流转，改动会导致旧备份里的成就无法识别。
    expect([...MILESTONES[TASK_DONE]]).toEqual([1, 3, 5, 10, 20, 50])
    expect([...MILESTONES[ACHIEVEMENT_TYPE.CAPSULE_OPENED]]).toEqual([1, 2, 3, 5, 10])
    expect([...MILESTONES[STREAK]]).toEqual([2, 3, 7, 14, 30, 100])
  })
})

describe('milestonesReached', () => {
  it('累计为 0 时一个都没达成', () => {
    expect(milestonesReached(TASK_DONE, 0)).toEqual([])
  })

  it('恰好达到里程碑时解锁', () => {
    expect(milestonesReached(TASK_DONE, 1)).toEqual([1])
    expect(milestonesReached(TASK_DONE, 3)).toEqual([1, 3])
  })

  it('超过某个里程碑但未达下一个时，只解锁已达成的', () => {
    expect(milestonesReached(TASK_DONE, 4)).toEqual([1, 3])
    expect(milestonesReached(TASK_DONE, 19)).toEqual([1, 3, 5, 10])
  })

  it('超过最大里程碑时全部解锁', () => {
    expect(milestonesReached(TASK_DONE, 999)).toEqual([1, 3, 5, 10, 20, 50])
  })

  it('连续打卡的里程碑独立计算', () => {
    expect(milestonesReached(STREAK, 7)).toEqual([2, 3, 7])
  })

  it('未知类型抛错而不是静默返回空数组', () => {
    // 静默返回空会让「成就发不出来」变成一个无声的 bug
    expect(() => milestonesReached('不存在的类型', 10)).toThrow('未知的成就类型')
  })
})

describe('newMilestones', () => {
  it('筛掉已发放的，只留新的', () => {
    expect(newMilestones(TASK_DONE, 5, [1, 3])).toEqual([5])
  })

  it('全部已发放时返回空数组（幂等）', () => {
    expect(newMilestones(TASK_DONE, 5, [1, 3, 5])).toEqual([])
  })

  it('首次发放时返回全部已达成的', () => {
    expect(newMilestones(TASK_DONE, 3, [])).toEqual([1, 3])
  })

  it('已发放的数值超出当前进度也不会重复发', () => {
    // 对应「导入旧备份后继续用」的场景：备份里可能有更高数值的成就
    expect(newMilestones(TASK_DONE, 3, [1, 3, 5, 10])).toEqual([])
  })
})

describe('grantedValuesOf', () => {
  it('只取指定类型的数值', () => {
    const achievements = [
      { type: TASK_DONE, value: 1 },
      { type: TASK_DONE, value: 3 },
      { type: STREAK, value: 2 }
    ]
    expect(grantedValuesOf(achievements, TASK_DONE)).toEqual([1, 3])
  })

  it('没有该类型时返回空数组', () => {
    expect(grantedValuesOf([], TASK_DONE)).toEqual([])
  })
})

describe('sortAchievements', () => {
  it('先按类型，再按数值升序', () => {
    const sorted = sortAchievements([
      { type: STREAK, value: 2 },
      { type: TASK_DONE, value: 3 },
      { type: TASK_DONE, value: 1 }
    ])
    expect(sorted.map((item) => `${item.type}-${item.value}`)).toEqual([
      '任务完成-1',
      '任务完成-3',
      '连续打卡-2'
    ])
  })

  it('不修改原数组', () => {
    const original = [{ type: TASK_DONE, value: 3 }, { type: TASK_DONE, value: 1 }]
    const snapshot = [...original]
    sortAchievements(original)
    expect(original).toEqual(snapshot)
  })
})

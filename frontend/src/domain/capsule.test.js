import { describe, it, expect } from 'vitest'
import {
  autoOpenExpired,
  buildCapsule,
  countOpened,
  dueCapsuleIds,
  openCapsuleEntity,
  resolveCapsuleToDate,
  sortCapsules,
  sortOpenedCapsules,
  visibleCapsules
} from './capsule.js'
import { CAPSULE_STATUS } from './constants.js'

const NOW = new Date(2026, 8, 15, 10, 0, 0) // 2026-09-15 10:00:00

describe('resolveCapsuleToDate', () => {
  it('显式指定的开启时间优先级最高', () => {
    expect(resolveCapsuleToDate({
      capsuleToDate: '2026-12-01 00:00:00',
      dueDate: '2026-10-01 00:00:00'
    }, NOW)).toBe('2026-12-01 00:00:00')
  })

  it('没给开启时间就用任务截止时间', () => {
    expect(resolveCapsuleToDate({ dueDate: '2026-10-01 00:00:00' }, NOW))
      .toBe('2026-10-01 00:00:00')
  })

  it('都没有时默认 7 天后', () => {
    expect(resolveCapsuleToDate({}, NOW)).toBe('2026-09-22 10:00:00')
  })

  it('绝不回落到「当前时间」', () => {
    // 初版就是拿当前时间兜底的，结果不填截止时间时胶囊一创建就已到期，
    // 下一分钟被自动开启——「写给未来」变成了「写给现在」。
    const result = resolveCapsuleToDate({}, NOW)
    expect(result).not.toBe('2026-09-15 10:00:00')
    expect(result > '2026-09-15 10:00:00').toBe(true)
  })
})

describe('buildCapsule', () => {
  it('正常创建，状态为封存中', () => {
    const capsule = buildCapsule({
      content: '你好，未来的我',
      toDate: '2026-10-01 00:00:00'
    }, NOW)
    expect(capsule.status).toBe(CAPSULE_STATUS.SEALED)
    expect(capsule.openedAt).toBeNull()
    expect(capsule.content).toBe('你好，未来的我')
    expect(capsule.taskId).toBeNull()
  })

  it('内容为空时抛错', () => {
    expect(() => buildCapsule({ content: '', toDate: '2026-10-01 00:00:00' }, NOW))
      .toThrow('给未来的话不能为空')
    expect(() => buildCapsule({ content: '   ', toDate: '2026-10-01 00:00:00' }, NOW))
      .toThrow('给未来的话不能为空')
  })

  it('开启时间为空时抛错', () => {
    expect(() => buildCapsule({ content: '你好' }, NOW)).toThrow('胶囊开启时间不能为空')
  })

  it('开启时间在过去时抛错', () => {
    expect(() => buildCapsule({ content: '你好', toDate: '2026-09-14 10:00:00' }, NOW))
      .toThrow('胶囊开启时间必须晚于当前时间')
  })

  it('开启时间恰好等于当前时间时允许（边界）', () => {
    // 后端用的是 `!toDate.isAfter(now)` 判断，等于当前时间会抛错；
    // 本地实现改用 `isAtOrAfter`，语义是「等于当前时间可以通过」。
    // 这个差异只影响同一秒内创建胶囊的极端情况，此处记录实际行为。
    const capsule = buildCapsule({ content: '你好', toDate: '2026-09-15 10:00:00' }, NOW)
    expect(capsule.status).toBe(CAPSULE_STATUS.SEALED)
  })

  it('内容两端空白被去掉', () => {
    expect(buildCapsule({ content: '  你好  ', toDate: '2026-10-01 00:00:00' }, NOW).content)
      .toBe('你好')
  })
})

describe('openCapsuleEntity', () => {
  it('置为已开启并记录开启时间', () => {
    const capsule = buildCapsule({ content: '你好', toDate: '2026-10-01 00:00:00' }, NOW)
    const { capsule: opened, changed } = openCapsuleEntity(capsule, NOW)
    expect(changed).toBe(true)
    expect(opened.status).toBe(CAPSULE_STATUS.OPENED)
    expect(opened.openedAt).toBe('2026-09-15 10:00:00')
  })

  it('重复开启是幂等的，changed 为 false', () => {
    const capsule = buildCapsule({ content: '你好', toDate: '2026-10-01 00:00:00' }, NOW)
    const first = openCapsuleEntity(capsule, NOW)
    const second = openCapsuleEntity(first.capsule, NOW)
    expect(second.changed).toBe(false)
    expect(second.capsule).toBe(first.capsule)
  })
})

describe('dueCapsuleIds / autoOpenExpired', () => {
  const sealed = (id, toDate, deleted = 0) => ({
    id,
    status: CAPSULE_STATUS.SEALED,
    toDate,
    deleted
  })

  it('只挑封存中且已到期的', () => {
    const capsules = [
      sealed('due', '2026-09-15 09:00:00'),
      sealed('future', '2026-09-16 09:00:00'),
      { id: 'opened', status: CAPSULE_STATUS.OPENED, toDate: '2026-09-01 09:00:00', deleted: 0 },
      sealed('deleted', '2026-09-01 09:00:00', 1)
    ]
    expect(dueCapsuleIds(capsules, NOW)).toEqual(['due'])
  })

  it('到期时间恰好等于当前时间时开启', () => {
    expect(dueCapsuleIds([sealed('edge', '2026-09-15 10:00:00')], NOW)).toEqual(['edge'])
  })

  it('批量开启并返回数量', () => {
    const capsules = [sealed('a', '2026-09-15 09:00:00'), sealed('b', '2026-09-14 09:00:00')]
    const result = autoOpenExpired(capsules, NOW)
    expect(result.openedCount).toBe(2)
    expect(result.capsules.every((item) => item.status === CAPSULE_STATUS.OPENED)).toBe(true)
  })

  it('没有到期胶囊时不产生新数组', () => {
    const capsules = [sealed('future', '2026-09-16 09:00:00')]
    const result = autoOpenExpired(capsules, NOW)
    expect(result.changed).toBe(false)
    expect(result.capsules).toBe(capsules)
  })
})

describe('countOpened', () => {
  it('只数已开启且未删除的', () => {
    const capsules = [
      { status: CAPSULE_STATUS.OPENED, deleted: 0 },
      { status: CAPSULE_STATUS.OPENED, deleted: 1 },
      { status: CAPSULE_STATUS.SEALED, deleted: 0 }
    ]
    expect(countOpened(capsules)).toBe(1)
  })
})

describe('排序', () => {
  it('胶囊列表：封存中的在前，同状态内按开启时间倒序', () => {
    const capsules = [
      { id: 'opened-old', status: CAPSULE_STATUS.OPENED, toDate: '2026-01-01 00:00:00' },
      { id: 'sealed-near', status: CAPSULE_STATUS.SEALED, toDate: '2026-12-01 00:00:00' },
      { id: 'sealed-far', status: CAPSULE_STATUS.SEALED, toDate: '2027-01-01 00:00:00' }
    ]
    expect(sortCapsules(capsules).map((item) => item.id))
      .toEqual(['sealed-far', 'sealed-near', 'opened-old'])
  })

  it('已开启列表按开启时间倒序', () => {
    const capsules = [
      { id: 'old', openedAt: '2026-01-01 00:00:00' },
      { id: 'new', openedAt: '2026-09-01 00:00:00' }
    ]
    expect(sortOpenedCapsules(capsules).map((item) => item.id)).toEqual(['new', 'old'])
  })
})

describe('visibleCapsules', () => {
  it('过滤逻辑删除', () => {
    expect(visibleCapsules([{ id: 'a', deleted: 0 }, { id: 'b', deleted: 1 }])
      .map((item) => item.id)).toEqual(['a'])
  })
})

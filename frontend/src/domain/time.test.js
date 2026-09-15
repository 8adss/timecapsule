import { describe, it, expect } from 'vitest'
import { compareDateTime, dateKey, shiftDay, isBefore, isAtOrAfter } from './time.js'

describe('dateKey', () => {
  it('从日期时间字符串取出日期部分', () => {
    expect(dateKey('2026-09-15 13:45:30')).toBe('2026-09-15')
  })

  it('接受 Date 对象', () => {
    expect(dateKey(new Date(2026, 8, 15, 13, 45, 30))).toBe('2026-09-15')
  })

  it('空值返回 null', () => {
    expect(dateKey(null)).toBeNull()
    expect(dateKey('')).toBeNull()
  })
})

describe('shiftDay', () => {
  it('往前推一天', () => {
    expect(shiftDay('2026-09-15', -1)).toBe('2026-09-14')
  })

  it('往后推一天', () => {
    expect(shiftDay('2026-09-15', 1)).toBe('2026-09-16')
  })

  it('跨月正确', () => {
    expect(shiftDay('2026-09-01', -1)).toBe('2026-08-31')
  })

  it('跨年正确', () => {
    expect(shiftDay('2026-01-01', -1)).toBe('2025-12-31')
  })

  it('闰年 2 月正确', () => {
    expect(shiftDay('2028-03-01', -1)).toBe('2028-02-29')
  })
})

describe('compareDateTime', () => {
  // 这是整个时间方案的地基：定长零填充 ⇒ 字典序等于时间序。
  // 一旦有人把格式改成不补零，这些断言会立刻失败。
  it('同一天内按时间先后排序', () => {
    expect(compareDateTime('2026-09-15 09:00:00', '2026-09-15 10:00:00')).toBe(-1)
    expect(compareDateTime('2026-09-15 10:00:00', '2026-09-15 09:00:00')).toBe(1)
  })

  it('个位数月份日期也能正确比较（零填充的作用）', () => {
    expect(compareDateTime('2026-09-09 23:59:59', '2026-09-10 00:00:00')).toBe(-1)
    expect(compareDateTime('2026-01-02 00:00:00', '2026-01-10 00:00:00')).toBe(-1)
  })

  it('相等返回 0', () => {
    expect(compareDateTime('2026-09-15 10:00:00', '2026-09-15 10:00:00')).toBe(0)
  })

  it('空值排在最后', () => {
    expect(compareDateTime(null, '2026-09-15 10:00:00')).toBe(-1)
    expect(compareDateTime('2026-09-15 10:00:00', null)).toBe(1)
    expect(compareDateTime(null, null)).toBe(0)
  })
})

describe('isBefore / isAtOrAfter', () => {
  it('严格早于', () => {
    expect(isBefore('2026-09-15 09:00:00', '2026-09-15 10:00:00')).toBe(true)
    expect(isBefore('2026-09-15 10:00:00', '2026-09-15 10:00:00')).toBe(false)
  })

  it('晚于或等于', () => {
    expect(isAtOrAfter('2026-09-15 10:00:00', '2026-09-15 10:00:00')).toBe(true)
    expect(isAtOrAfter('2026-09-15 09:00:00', '2026-09-15 10:00:00')).toBe(false)
  })
})

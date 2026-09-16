import { describe, it, expect } from 'vitest'
import {
  applyPersonaPatch,
  buildPersona,
  resolveMaterials,
  sortPersonas,
  visiblePersonas,
  PERSONA_LIMITS,
  PERSONA_STATUS
} from './persona.js'

const NOW = new Date(2026, 8, 15, 10, 0, 0) // 2026-09-15 10:00:00
const LATER = new Date(2026, 8, 16, 10, 0, 0) // 2026-09-16 10:00:00

const persona = (over = {}, now = NOW) => buildPersona({
  name: '2026 年 9 月的我',
  selfDate: '2026-09-01',
  docIds: ['d1'],
  summary: '正在把一个想法做成产品',
  stylePrompt: '说话直接，喜欢用短句',
  ...over
}, now)

describe('buildPersona', () => {
  it('填入默认值：状态已就绪、未删除、生成相关的字段为空', () => {
    const item = persona()
    expect(item.status).toBe(PERSONA_STATUS.READY)
    expect(item.failReason).toBeNull()
    expect(item.model).toBeNull()
    expect(item.deleted).toBe(0)
    expect(item.createdAt).toBe('2026-09-15 10:00:00')
    expect(item.updatedAt).toBe('2026-09-15 10:00:00')
  })

  it('名称两端空白被去掉', () => {
    expect(persona({ name: '  那时的我  ' }).name).toBe('那时的我')
  })

  it('名称为空时抛错', () => {
    expect(() => persona({ name: '' })).toThrow('请填写分身名称')
    expect(() => persona({ name: '   ' })).toThrow('请填写分身名称')
    expect(() => persona({ name: undefined })).toThrow('请填写分身名称')
  })

  it('代表时间点必填，且必须是 yyyy-MM-dd', () => {
    expect(() => persona({ selfDate: '' })).toThrow('请选择代表的时间点')
    expect(() => persona({ selfDate: undefined })).toThrow('请选择代表的时间点')
    expect(() => persona({ selfDate: '2026/09/01' })).toThrow('请选择代表的时间点')
    expect(() => persona({ selfDate: '2026-9-1' })).toThrow('请选择代表的时间点')
    expect(persona({ selfDate: '2026-09-01' }).selfDate).toBe('2026-09-01')
  })

  it('至少要引用一篇材料', () => {
    expect(() => persona({ docIds: [] })).toThrow('至少要选一篇材料')
    expect(() => persona({ docIds: undefined })).toThrow('至少要选一篇材料')
    expect(() => persona({ docIds: ['', null] })).toThrow('至少要选一篇材料')
  })

  it('重复的材料被去重（同一篇选两次不该算两篇）', () => {
    expect(persona({ docIds: ['d1', 'd2', 'd1'] }).docIds).toEqual(['d1', 'd2'])
  })

  it('材料数量超过上限时抛错', () => {
    const many = Array.from({ length: PERSONA_LIMITS.docIds + 1 }, (_, i) => `d${i}`)
    expect(() => persona({ docIds: many })).toThrow('引用的材料不能超过')
  })

  it('画像与说话风格可以留空', () => {
    const item = persona({ summary: undefined, stylePrompt: null })
    expect(item.summary).toBe('')
    expect(item.stylePrompt).toBe('')
  })

  it('画像或说话风格超长时抛错（否则存得进去、备份导不回来）', () => {
    expect(() => persona({ summary: 'x'.repeat(PERSONA_LIMITS.summary + 1) })).toThrow('画像超过')
    expect(() => persona({ stylePrompt: 'x'.repeat(PERSONA_LIMITS.stylePrompt + 1) })).toThrow('说话风格超过')
  })

  it('名称超长时抛错（同样是「存得进去、备份导不回来」那一类）', () => {
    // 名称原先漏了这道校验：域层声明了 PERSONA_LIMITS.name 却从没用过它，
    // 而备份校验器按同一个数字拒收，超限值一旦落盘那份备份就废了
    expect(() => persona({ name: 'x'.repeat(PERSONA_LIMITS.name + 1) })).toThrow('分身名称超过')
    expect(persona({ name: 'x'.repeat(PERSONA_LIMITS.name) }).name)
      .toHaveLength(PERSONA_LIMITS.name)
  })

  it('每个分身拿到不同的 id', () => {
    expect(persona().id).not.toBe(persona().id)
  })

  it('不落盘材料数量（它是 docIds 的派生值）', () => {
    expect(persona()).not.toHaveProperty('docCount')
  })
})

describe('applyPersonaPatch', () => {
  const base = persona()

  it('五项都能改', () => {
    const next = applyPersonaPatch(base, {
      name: '2027 年的我',
      selfDate: '2027-01-01',
      docIds: ['d2', 'd3'],
      summary: '换了个方向',
      stylePrompt: '话少了'
    }, NOW)
    expect(next.name).toBe('2027 年的我')
    expect(next.selfDate).toBe('2027-01-01')
    expect(next.docIds).toEqual(['d2', 'd3'])
    expect(next.summary).toBe('换了个方向')
    expect(next.stylePrompt).toBe('话少了')
  })

  it('名称传空字符串时保持原值（空 = 没填，不是清空）', () => {
    expect(applyPersonaPatch(base, { name: '' }, NOW).name).toBe('2026 年 9 月的我')
    expect(applyPersonaPatch(base, { name: '   ' }, NOW).name).toBe('2026 年 9 月的我')
  })

  it('时间点被清空时报错，而不是悄悄保留', () => {
    // 与「名称传空保持原值」的有意差异：没有代表时间点的分身不成立，
    // 而在编辑表单里这个字段用户看得见，清空后保存却保留旧值更意外。
    expect(() => applyPersonaPatch(base, { selfDate: '' }, NOW)).toThrow('请选择代表的时间点')
    expect(() => applyPersonaPatch(base, { selfDate: '2026/01/01' }, NOW)).toThrow('请选择代表的时间点')
  })

  it('材料被清空时报错', () => {
    expect(() => applyPersonaPatch(base, { docIds: [] }, NOW)).toThrow('至少要选一篇材料')
  })

  it('改名时同样受长度上限约束（不能只在新建那侧拦）', () => {
    expect(() => applyPersonaPatch(base, { name: 'x'.repeat(PERSONA_LIMITS.name + 1) }, NOW))
      .toThrow('分身名称超过')
  })

  it('画像与说话风格可以被清空', () => {
    const next = applyPersonaPatch(base, { summary: '', stylePrompt: '' }, NOW)
    expect(next.summary).toBe('')
    expect(next.stylePrompt).toBe('')
  })

  it('未出现在 patch 里的字段不受影响', () => {
    const next = applyPersonaPatch(base, { summary: '只改画像' }, NOW)
    expect(next.name).toBe('2026 年 9 月的我')
    expect(next.docIds).toEqual(['d1'])
  })

  it('状态与生成相关的字段不会被编辑表单改写', () => {
    // 它们是生成过程的产物；接上大模型后若被这里覆盖，状态机会乱
    const next = applyPersonaPatch(
      { ...base, status: PERSONA_STATUS.FAILED, failReason: '余额不足', model: 'deepseek-chat' },
      { name: '新名字' },
      NOW
    )
    expect(next.status).toBe(PERSONA_STATUS.FAILED)
    expect(next.failReason).toBe('余额不足')
    expect(next.model).toBe('deepseek-chat')
  })

  it('更新 updatedAt，但不动 createdAt', () => {
    const next = applyPersonaPatch(base, { summary: '改了' }, LATER)
    expect(next.updatedAt).toBe('2026-09-16 10:00:00')
    expect(next.createdAt).toBe('2026-09-15 10:00:00')
  })

  it('返回新对象，原对象不被改动', () => {
    applyPersonaPatch(base, { name: '新名字' }, LATER)
    expect(base.name).toBe('2026 年 9 月的我')
  })
})

describe('visiblePersonas', () => {
  it('排除逻辑删除的分身', () => {
    const list = [persona({ name: 'A' }), { ...persona({ name: 'B' }), deleted: 1 }]
    expect(visiblePersonas(list).map((item) => item.name)).toEqual(['A'])
  })
})

describe('sortPersonas', () => {
  it('代表时间点近的排前面', () => {
    const early = persona({ name: '早', selfDate: '2025-01-01' })
    const late = persona({ name: '晚', selfDate: '2026-09-01' })
    expect(sortPersonas([early, late]).map((item) => item.name)).toEqual(['晚', '早'])
  })

  it('同一时间点时按创建时间倒序（次级排序，避免顺序随实现漂移）', () => {
    const first = persona({ name: '先建', selfDate: '2026-09-01' }, NOW)
    const second = persona({ name: '后建', selfDate: '2026-09-01' }, LATER)
    expect(sortPersonas([first, second]).map((item) => item.name)).toEqual(['后建', '先建'])
  })

  it('不修改传入的数组', () => {
    const input = [persona({ name: '早', selfDate: '2025-01-01' }), persona({ name: '晚', selfDate: '2026-09-01' })]
    sortPersonas(input)
    expect(input.map((item) => item.name)).toEqual(['早', '晚'])
  })
})

describe('resolveMaterials', () => {
  const docs = [
    { id: 'd1', title: '关于我' },
    { id: 'd2', title: '日记' }
  ]

  it('把引用的材料解析成文档，顺序与引用顺序一致', () => {
    const result = resolveMaterials({ docIds: ['d2', 'd1'] }, docs)
    expect(result.map((item) => item.doc.title)).toEqual(['日记', '关于我'])
    expect(result.every((item) => item.missing === false)).toBe(true)
  })

  it('材料已被删除时保留位置并标记 missing，而不是悄悄滤掉', () => {
    // 用户需要看到「原本引用了 3 篇，其中 1 篇不在了」，
    // 否则会以为这个分身本来就只有 2 篇来源
    const result = resolveMaterials({ docIds: ['d1', 'gone', 'd2'] }, docs)
    expect(result).toHaveLength(3)
    expect(result[1].missing).toBe(true)
    expect(result[1].doc).toBeNull()
    expect(result[1].id).toBe('gone')
  })

  it('没有引用时返回空数组', () => {
    expect(resolveMaterials({ docIds: [] }, docs)).toEqual([])
    expect(resolveMaterials({}, docs)).toEqual([])
  })
})

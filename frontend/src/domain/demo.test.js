import { describe, it, expect } from 'vitest'
import {
  buildDemoMeta,
  buildDemoSeed,
  demoContentFor,
  demoIdsFrom,
  demoStateFrom,
  shouldSeedDemo,
  DEMO_CONTENT,
  DEFAULT_DEMO_LOCALE
} from './demo.js'
import { SOURCE_TYPE } from './knowledge.js'
import { PERSONA_STATUS } from './persona.js'

const NOW = new Date(2026, 8, 15, 10, 0, 0) // 2026-09-15 10:00:00

describe('demoContentFor', () => {
  it('认识的两种语言各有一份', () => {
    expect(demoContentFor('zh-CN').docs[0].title.startsWith('示例')).toBe(true)
    expect(demoContentFor('en-US').docs[0].title.startsWith('Sample')).toBe(true)
  })

  it('不认识的语言回落到中文，而不是给出 undefined', () => {
    expect(demoContentFor('ja-JP')).toBe(DEMO_CONTENT[DEFAULT_DEMO_LOCALE])
    expect(demoContentFor(undefined)).toBe(DEMO_CONTENT[DEFAULT_DEMO_LOCALE])
  })

  it('两份内容的文档数量一致（漏翻一篇不会静默少一条）', () => {
    expect(DEMO_CONTENT['en-US'].docs).toHaveLength(DEMO_CONTENT['zh-CN'].docs.length)
  })
})

describe('shouldSeedDemo', () => {
  it('全新的存储：要写', () => {
    expect(shouldSeedDemo({ meta: {}, knowledge: [], personas: [] })).toBe(true)
    expect(shouldSeedDemo({})).toBe(true)
  })

  it('写过一次就不再写（清空示例之后也不会又冒出来）', () => {
    expect(shouldSeedDemo({ meta: { demoSeededAt: '2026-09-15 10:00:00' }, knowledge: [], personas: [] }))
      .toBe(false)
  })

  it('知识库里已经有东西时跳过——用户已经在用了，不该被塞示例', () => {
    expect(shouldSeedDemo({ meta: {}, knowledge: [{ id: 'd1' }], personas: [] })).toBe(false)
  })

  it('已经有分身时同样跳过', () => {
    expect(shouldSeedDemo({ meta: {}, knowledge: [], personas: [{ id: 'p1' }] })).toBe(false)
  })
})

describe('demoIdsFrom', () => {
  it('读出两组 id', () => {
    const ids = demoIdsFrom({ demoIds: { knowledge: ['d1'], personas: ['p1'] } })
    expect(ids).toEqual({ knowledge: ['d1'], personas: ['p1'] })
  })

  it('meta 缺失或字段被改坏时给出空数组，而不是抛错', () => {
    // 这个函数跑在每个页面的横幅上，绝不能因为一份手改过的 meta 就整页崩掉
    expect(demoIdsFrom(undefined)).toEqual({ knowledge: [], personas: [] })
    expect(demoIdsFrom({})).toEqual({ knowledge: [], personas: [] })
    expect(demoIdsFrom({ demoIds: { knowledge: 'not-an-array' } }))
      .toEqual({ knowledge: [], personas: [] })
  })
})

describe('demoStateFrom', () => {
  const meta = { demoIds: { knowledge: ['d1', 'd2'], personas: ['p1'] } }

  it('示例还在时是 active，并分别给出条数', () => {
    const state = demoStateFrom({
      meta,
      knowledge: [{ id: 'd1' }, { id: 'd2' }, { id: 'my-own' }],
      personas: [{ id: 'p1' }]
    })
    expect(state.active).toBe(true)
    expect(state.docCount).toBe(2)
    expect(state.personaCount).toBe(1)
  })

  it('用户自己删掉示例之后就不再 active（不必再点一次清空）', () => {
    const state = demoStateFrom({
      meta,
      knowledge: [{ id: 'd1', deleted: 1 }, { id: 'd2', deleted: 1 }],
      personas: [{ id: 'p1', deleted: 1 }]
    })
    expect(state.active).toBe(false)
    expect(state.docCount).toBe(0)
  })

  it('用户自己写的文档不算进示例条数', () => {
    const state = demoStateFrom({ meta, knowledge: [{ id: 'my-own' }], personas: [] })
    expect(state.docCount).toBe(0)
    expect(state.active).toBe(false)
  })

  it('带出「不再提示」的标记', () => {
    expect(demoStateFrom({ meta: { ...meta, demoDismissed: true } }).dismissed).toBe(true)
    expect(demoStateFrom({ meta }).dismissed).toBe(false)
  })
})

describe('buildDemoSeed', () => {
  it('产出三篇文档与一个分身', () => {
    const seed = buildDemoSeed('zh-CN', NOW)
    expect(seed.docs).toHaveLength(3)
    expect(seed.personas).toHaveLength(1)
  })

  it('示例数据与用户自己建的走同一套校验（字段一个不少）', () => {
    const seed = buildDemoSeed('zh-CN', NOW)
    for (const doc of seed.docs) {
      expect(doc.id).toBeTruthy()
      expect(doc.sourceType).toBe(SOURCE_TYPE.PASTE)
      expect(doc.deleted).toBe(0)
      expect(doc.createdAt).toBe('2026-09-15 10:00:00')
    }
    expect(seed.personas[0].status).toBe(PERSONA_STATUS.READY)
    expect(seed.personas[0].deleted).toBe(0)
  })

  it('分身引用的是这几篇示例文档', () => {
    const seed = buildDemoSeed('zh-CN', NOW)
    expect(seed.personas[0].docIds).toEqual(seed.docs.map((doc) => doc.id))
  })

  it('分身的代表时间点落在写入当天', () => {
    expect(buildDemoSeed('zh-CN', NOW).personas[0].selfDate).toBe('2026-09-15')
  })

  it('英文界面写入英文示例', () => {
    const seed = buildDemoSeed('en-US', NOW)
    expect(seed.docs[0].title.startsWith('Sample')).toBe(true)
    expect(seed.personas[0].name.startsWith('Sample')).toBe(true)
  })

  it('每次生成的 id 都不同（两台设备各自写入不会撞号）', () => {
    const a = buildDemoSeed('zh-CN', NOW)
    const b = buildDemoSeed('zh-CN', NOW)
    expect(a.docs[0].id).not.toBe(b.docs[0].id)
  })
})

describe('buildDemoMeta', () => {
  it('保留 meta 里原有的字段（schemaVersion、createdAt 不能被冲掉）', () => {
    const meta = buildDemoMeta(
      { schemaVersion: 1, createdAt: '2026-09-01T00:00:00.000Z' },
      buildDemoSeed('zh-CN', NOW),
      NOW
    )
    expect(meta.schemaVersion).toBe(1)
    expect(meta.createdAt).toBe('2026-09-01T00:00:00.000Z')
  })

  it('记下写入时间与示例记录的 id', () => {
    const seed = buildDemoSeed('zh-CN', NOW)
    const meta = buildDemoMeta({}, seed, NOW)
    expect(meta.demoSeededAt).toBe('2026-09-15 10:00:00')
    expect(meta.demoIds.knowledge).toEqual(seed.docs.map((doc) => doc.id))
    expect(meta.demoIds.personas).toEqual([seed.personas[0].id])
  })

  it('meta 为空时也能工作', () => {
    expect(buildDemoMeta(undefined, buildDemoSeed('zh-CN', NOW), NOW).demoSeededAt)
      .toBe('2026-09-15 10:00:00')
  })
})

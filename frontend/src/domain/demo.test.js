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
import { CAPSULE_STATUS } from './constants.js'

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
    const zh = DEMO_CONTENT['zh-CN']
    const en = DEMO_CONTENT['en-US']
    expect(en.docs).toHaveLength(zh.docs.length)
    // 历史人物那一组也要对上：只翻了主文档、漏翻庄子那一套，
    // 英文用户就会看到一个没有材料来源的分身（而它会被构建函数直接拒掉）
    expect(en.figures).toHaveLength(zh.figures.length)
    for (let i = 0; i < zh.figures.length; i += 1) {
      expect(en.figures[i].docs).toHaveLength(zh.figures[i].docs.length)
    }
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
  it('读出三组 id', () => {
    const ids = demoIdsFrom({
      demoIds: { knowledge: ['d1'], personas: ['p1'], capsules: ['c1'] }
    })
    expect(ids).toEqual({ knowledge: ['d1'], personas: ['p1'], capsules: ['c1'] })
  })

  it('meta 缺失或字段被改坏时给出空数组，而不是抛错', () => {
    // 这个函数跑在每个页面的横幅上，绝不能因为一份手改过的 meta 就整页崩掉
    const empty = { knowledge: [], personas: [], capsules: [] }
    expect(demoIdsFrom(undefined)).toEqual(empty)
    expect(demoIdsFrom({})).toEqual(empty)
    // 上一版写下的 meta 里没有 capsules 这一项，也要能读（给出空数组）
    expect(demoIdsFrom({ demoIds: { knowledge: ['d1'], personas: ['p1'] } }))
      .toEqual({ knowledge: ['d1'], personas: ['p1'], capsules: [] })
    expect(demoIdsFrom({ demoIds: { knowledge: 'not-an-array' } })).toEqual(empty)
  })
})

describe('demoStateFrom', () => {
  const meta = { demoIds: { knowledge: ['d1', 'd2'], personas: ['p1'], capsules: ['c1'] } }

  it('示例还在时是 active，并分别给出条数', () => {
    const state = demoStateFrom({
      meta,
      knowledge: [{ id: 'd1' }, { id: 'd2' }, { id: 'my-own' }],
      personas: [{ id: 'p1' }],
      capsules: [{ id: 'c1' }]
    })
    expect(state.active).toBe(true)
    expect(state.docCount).toBe(2)
    expect(state.personaCount).toBe(1)
    expect(state.capsuleCount).toBe(1)
  })

  it('只剩那枚示例胶囊时也算 active（三者任一还在就是还在）', () => {
    const state = demoStateFrom({
      meta,
      knowledge: [{ id: 'd1', deleted: 1 }, { id: 'd2', deleted: 1 }],
      personas: [{ id: 'p1', deleted: 1 }],
      capsules: [{ id: 'c1' }]
    })
    expect(state.active).toBe(true)
    expect(state.docCount).toBe(0)
    expect(state.capsuleCount).toBe(1)
  })

  it('用户自己删掉示例之后就不再 active（不必再点一次清空）', () => {
    const state = demoStateFrom({
      meta,
      knowledge: [{ id: 'd1', deleted: 1 }, { id: 'd2', deleted: 1 }],
      personas: [{ id: 'p1', deleted: 1 }],
      capsules: [{ id: 'c1', deleted: 1 }]
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
  it('产出六篇文档、两个分身与一枚已开启的胶囊', () => {
    const seed = buildDemoSeed('zh-CN', NOW)
    expect(seed.docs).toHaveLength(6)
    expect(seed.personas).toHaveLength(2)
    expect(seed.capsules).toHaveLength(1)
  })

  it('示例数据与用户自己建的走同一套校验（字段一个不少）', () => {
    const seed = buildDemoSeed('zh-CN', NOW)
    for (const doc of seed.docs) {
      expect(doc.id).toBeTruthy()
      expect(doc.sourceType).toBe(SOURCE_TYPE.PASTE)
      expect(doc.deleted).toBe(0)
      expect(doc.createdAt).toBe('2026-09-15 10:00:00')
    }
    for (const persona of seed.personas) {
      expect(persona.status).toBe(PERSONA_STATUS.READY)
      expect(persona.deleted).toBe(0)
    }
  })

  it('分身只引用属于自己那一组的材料（庄子不会提起小林的事）', () => {
    const seed = buildDemoSeed('zh-CN', NOW)
    const [own, figure] = seed.personas
    const ownDocs = seed.docs.filter((doc) => own.docIds.includes(doc.id))
    const figureDocs = seed.docs.filter((doc) => figure.docIds.includes(doc.id))

    expect(ownDocs.map((doc) => doc.title)).toEqual([
      '示例 · 关于我',
      '示例 · 最近在想的事',
      '示例 · 今年的三个目标'
    ])
    expect(figureDocs).toHaveLength(3)
    expect(figureDocs.every((doc) => doc.title.includes('庄子'))).toBe(true)
  })

  it('「那时的我」的代表时间点落在写入当天', () => {
    expect(buildDemoSeed('zh-CN', NOW).personas[0].selfDate).toBe('2026-09-15')
  })

  it('历史人物自带代表时间点（庄子的生年），不会被改写成今天', () => {
    const [, zhuangzi] = buildDemoSeed('zh-CN', NOW).personas
    expect(zhuangzi.name).toBe('示例 · 庄子')
    expect(zhuangzi.selfDate).toBe('0369-01-01')
    // 这个字段只能放 yyyy-MM-dd，公元前没有更好的写法（见 domain/persona.js）
    expect(zhuangzi.selfDate).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('胶囊是 90 天前写、30 天前到期的，且已经开启', () => {
    const [capsule] = buildDemoSeed('zh-CN', NOW).capsules
    // 对话页的「过去的你」只列已开启的胶囊，所以它必须建出来就是开着的
    expect(capsule.status).toBe(CAPSULE_STATUS.OPENED)
    expect(capsule.openedAt).toBe('2026-08-16 10:00:00')
    expect(capsule.toDate).toBe('2026-08-16 10:00:00')
    expect(capsule.createdAt).toBe('2026-06-17 10:00:00')
    expect(capsule.deleted).toBe(0)
  })

  it('英文界面写入英文示例（历史人物那一组也要翻）', () => {
    const seed = buildDemoSeed('en-US', NOW)
    expect(seed.docs[0].title.startsWith('Sample')).toBe(true)
    expect(seed.personas[0].name.startsWith('Sample')).toBe(true)
    expect(seed.personas[1].name).toBe('Sample · Zhuangzi')
    expect(seed.docs.every((doc) => doc.title.startsWith('Sample'))).toBe(true)
  })

  it('每次生成的 id 都不同（两台设备各自写入不会撞号）', () => {
    const a = buildDemoSeed('zh-CN', NOW)
    const b = buildDemoSeed('zh-CN', NOW)
    expect(a.docs[0].id).not.toBe(b.docs[0].id)
    expect(a.capsules[0].id).not.toBe(b.capsules[0].id)
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

  it('记下写入时间与示例记录的 id（三个集合都要记）', () => {
    const seed = buildDemoSeed('zh-CN', NOW)
    const meta = buildDemoMeta({}, seed, NOW)
    expect(meta.demoSeededAt).toBe('2026-09-15 10:00:00')
    expect(meta.demoIds.knowledge).toEqual(seed.docs.map((doc) => doc.id))
    expect(meta.demoIds.personas).toEqual(seed.personas.map((item) => item.id))
    // 漏记胶囊的 id 会让它清不掉——而它正是对话页要用到的那一枚
    expect(meta.demoIds.capsules).toEqual(seed.capsules.map((item) => item.id))
  })

  it('meta 为空时也能工作', () => {
    expect(buildDemoMeta(undefined, buildDemoSeed('zh-CN', NOW), NOW).demoSeededAt)
      .toBe('2026-09-15 10:00:00')
  })
})

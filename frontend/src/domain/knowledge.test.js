import { describe, it, expect } from 'vitest'
import {
  applyDocPatch,
  buildDoc,
  buildPreview,
  countChars,
  filterDocs,
  queryDocs,
  sortDocs,
  visibleDocs,
  KNOWLEDGE_LIMITS,
  SOURCE_TYPE,
  SORT_BY
} from './knowledge.js'

const NOW = new Date(2026, 8, 15, 10, 0, 0) // 2026-09-15 10:00:00
const LATER = new Date(2026, 8, 16, 10, 0, 0) // 2026-09-16 10:00:00

const doc = (overrides = {}, now = NOW) => buildDoc({
  title: '默认标题',
  content: '默认正文',
  ...overrides
}, now)

describe('buildDoc', () => {
  it('填入默认值：来源按粘贴、未删除、创建与更新时间取当下', () => {
    const item = doc()
    expect(item.sourceType).toBe(SOURCE_TYPE.PASTE)
    expect(item.originName).toBeNull()
    expect(item.deleted).toBe(0)
    expect(item.createdAt).toBe('2026-09-15 10:00:00')
    expect(item.updatedAt).toBe('2026-09-15 10:00:00')
  })

  it('标题两端空白被去掉', () => {
    expect(doc({ title: '  关于我  ' }).title).toBe('关于我')
  })

  it('标题为空时抛错', () => {
    expect(() => doc({ title: '' })).toThrow('请填写标题')
    expect(() => doc({ title: '   ' })).toThrow('请填写标题')
    expect(() => doc({ title: undefined })).toThrow('请填写标题')
  })

  it('正文为空时抛错', () => {
    expect(() => doc({ content: '' })).toThrow('正文不能为空')
    expect(() => doc({ content: '   \n  ' })).toThrow('正文不能为空')
    expect(() => doc({ content: undefined })).toThrow('正文不能为空')
  })

  it('正文原样保留，不做 trim（用户贴进来的排版不能动）', () => {
    const content = '\n\n第一段\n\n第二段\n\n'
    expect(doc({ content }).content).toBe(content)
  })

  it('来源为 FILE 时保留，并记下原文件名', () => {
    const item = doc({ sourceType: SOURCE_TYPE.FILE, originName: ' 日记.md ' })
    expect(item.sourceType).toBe(SOURCE_TYPE.FILE)
    expect(item.originName).toBe('日记.md')
  })

  it('来源取值非法时按粘贴处理', () => {
    expect(doc({ sourceType: 'PDF' }).sourceType).toBe(SOURCE_TYPE.PASTE)
  })

  it('标题或正文超长时抛错（否则存得进去、备份导不回来）', () => {
    // 界面的 maxlength 挡不住「读文件填进来」那条路径，所以写入侧必须自己拦。
    // 一旦超限值落盘，导出的备份会被 domain/backup.js 按上限整份拒收。
    expect(() => doc({ title: 'x'.repeat(KNOWLEDGE_LIMITS.title + 1) })).toThrow('标题超过')
    expect(() => doc({ content: 'x'.repeat(KNOWLEDGE_LIMITS.content + 1) })).toThrow('正文超过')
  })

  it('刚好等于上限时不报错（边界不能差一）', () => {
    expect(doc({ title: 'x'.repeat(KNOWLEDGE_LIMITS.title) }).title)
      .toHaveLength(KNOWLEDGE_LIMITS.title)
    expect(doc({ content: 'x'.repeat(KNOWLEDGE_LIMITS.content) }).content)
      .toHaveLength(KNOWLEDGE_LIMITS.content)
  })

  it('原文件名超长时被截断，而不是让整次导入失败', () => {
    // 它只用于「来源」列的展示，用户没法为此做什么（总不能让用户去改文件名）；
    // 但也不能原样存——备份校验器按同样的上限卡这个字段
    const long = `${'x'.repeat(250)}.txt`
    const item = doc({ sourceType: SOURCE_TYPE.FILE, originName: long })
    expect(item.originName).toHaveLength(KNOWLEDGE_LIMITS.title)
    expect(item.originName).toBe(long.slice(0, KNOWLEDGE_LIMITS.title))
  })

  it('每条文档拿到不同的 id', () => {
    expect(doc().id).not.toBe(doc().id)
  })

  it('不落盘字数与摘要（它们是正文的派生值）', () => {
    const item = doc()
    expect(item).not.toHaveProperty('charCount')
    expect(item).not.toHaveProperty('preview')
  })
})

describe('applyDocPatch', () => {
  const base = doc({ title: '关于我', content: '第一版正文' })

  it('可以改标题与正文', () => {
    const next = applyDocPatch(base, { title: '关于我（2026）', content: '第二版正文' }, NOW)
    expect(next.title).toBe('关于我（2026）')
    expect(next.content).toBe('第二版正文')
  })

  it('标题传空字符串时保持原值（空 = 没填，不是清空）', () => {
    expect(applyDocPatch(base, { title: '' }, NOW).title).toBe('关于我')
    expect(applyDocPatch(base, { title: '   ' }, NOW).title).toBe('关于我')
  })

  it('正文传空时报错，而不是悄悄保留旧正文', () => {
    // 与 applyTaskPatch 的有意差异：任务描述可以清空，文档没有正文则无意义。
    // 若改成「保持原值」，用户清空正文保存后会以为删干净了，下次打开又整段冒出来。
    expect(() => applyDocPatch(base, { content: '' }, NOW)).toThrow('正文不能为空')
    expect(() => applyDocPatch(base, { content: '  \n ' }, NOW)).toThrow('正文不能为空')
  })

  it('未出现在 patch 里的字段不受影响，来源不会被改写', () => {
    const withFile = doc({ sourceType: SOURCE_TYPE.FILE, originName: '日记.md' })
    const next = applyDocPatch(withFile, { content: '改过的正文' }, LATER)
    expect(next.sourceType).toBe(SOURCE_TYPE.FILE)
    expect(next.originName).toBe('日记.md')
    expect(next.createdAt).toBe(withFile.createdAt)
  })

  it('更新 updatedAt，但不动 createdAt', () => {
    const next = applyDocPatch(base, { title: '新标题' }, LATER)
    expect(next.updatedAt).toBe('2026-09-16 10:00:00')
    expect(next.createdAt).toBe('2026-09-15 10:00:00')
  })

  it('返回新对象，原对象不被改动', () => {
    applyDocPatch(base, { title: '新标题' }, LATER)
    expect(base.title).toBe('关于我')
  })
})

describe('countChars', () => {
  it('按字面长度数，与旧版后端口径一致', () => {
    expect(countChars('你好世界')).toBe(4)
    expect(countChars('hello')).toBe(5)
    expect(countChars('')).toBe(0)
  })

  it('emoji 算 2 个字（UTF-16 码元，不是码位）', () => {
    expect(countChars('👍')).toBe(2)
  })

  it('不是字符串时返回 0', () => {
    expect(countChars(null)).toBe(0)
    expect(countChars(undefined)).toBe(0)
    expect(countChars(123)).toBe(0)
  })
})

describe('buildPreview', () => {
  it('把连续空白折成一个空格（换行塞进表格会撑成多行）', () => {
    expect(buildPreview('第一行\n\n第二行')).toBe('第一行 第二行')
    expect(buildPreview('  前后都有空白  ')).toBe('前后都有空白')
  })

  it('超过上限时截断并加省略号', () => {
    const result = buildPreview('字'.repeat(KNOWLEDGE_LIMITS.preview + 10))
    expect(result.length).toBe(KNOWLEDGE_LIMITS.preview + 1)
    expect(result.endsWith('…')).toBe(true)
  })

  it('刚好等于上限时不加省略号', () => {
    const result = buildPreview('字'.repeat(KNOWLEDGE_LIMITS.preview))
    expect(result.length).toBe(KNOWLEDGE_LIMITS.preview)
    expect(result.endsWith('…')).toBe(false)
  })

  it('空内容返回空串', () => {
    expect(buildPreview('')).toBe('')
    expect(buildPreview(null)).toBe('')
  })

  it('开头一大段全是空白时，仍能取到后面的正文', () => {
    // 摘要只折叠前 preview*4 个字符；若不兜这一下，这里会返回空串
    const content = `${' '.repeat(KNOWLEDGE_LIMITS.preview * 4 + 20)}正文在后面`
    expect(buildPreview(content)).toBe('正文在后面')
  })
})

describe('visibleDocs', () => {
  it('排除逻辑删除的文档', () => {
    const list = [doc({ title: 'A' }), { ...doc({ title: 'B' }), deleted: 1 }]
    expect(visibleDocs(list).map((item) => item.title)).toEqual(['A'])
  })
})

describe('filterDocs', () => {
  const list = [
    doc({ title: '关于我', content: '我是一名后端工程师' }),
    doc({ title: '年度总结', content: '今年读完了 12 本书' }),
    doc({ title: 'Reading Notes', content: 'Chapter One' })
  ]

  it('标题命中', () => {
    expect(filterDocs(list, '年度').map((item) => item.title)).toEqual(['年度总结'])
  })

  it('正文命中（列表里看不到的词也能搜出来）', () => {
    expect(filterDocs(list, '后端').map((item) => item.title)).toEqual(['关于我'])
  })

  it('大小写不敏感', () => {
    expect(filterDocs(list, 'reading').map((item) => item.title)).toEqual(['Reading Notes'])
    expect(filterDocs(list, 'CHAPTER').map((item) => item.title)).toEqual(['Reading Notes'])
  })

  it('空关键词返回全部（调用方不必先判断用户输了没有）', () => {
    expect(filterDocs(list, '')).toHaveLength(3)
    expect(filterDocs(list, '   ')).toHaveLength(3)
    expect(filterDocs(list, undefined)).toHaveLength(3)
  })

  it('没有命中时返回空数组', () => {
    expect(filterDocs(list, '不存在的词')).toEqual([])
  })
})

describe('sortDocs', () => {
  const earlier = doc({ title: 'Banana', content: '短' }, NOW)
  const later = doc({ title: 'Apple', content: '很长很长很长的正文' }, LATER)

  it('默认按导入时间倒序', () => {
    expect(sortDocs([earlier, later]).map((item) => item.title)).toEqual(['Apple', 'Banana'])
  })

  it('按字数从多到少', () => {
    expect(sortDocs([earlier, later], SORT_BY.CHARS).map((item) => item.title)).toEqual(['Apple', 'Banana'])
  })

  it('按标题（拼音顺序）', () => {
    expect(sortDocs([earlier, later], SORT_BY.TITLE).map((item) => item.title)).toEqual(['Apple', 'Banana'])
    const zh = [doc({ title: '波' }), doc({ title: '阿' })]
    expect(sortDocs(zh, SORT_BY.TITLE).map((item) => item.title)).toEqual(['阿', '波'])
  })

  it('不修改传入的数组', () => {
    const input = [earlier, later]
    sortDocs(input)
    expect(input.map((item) => item.title)).toEqual(['Banana', 'Apple'])
  })

  it('字数相同时按导入时间倒序（次级排序，避免顺序随实现漂移）', () => {
    const a = doc({ title: 'A', content: '三个字' }, NOW)
    const b = doc({ title: 'B', content: '三个字' }, LATER)
    expect(sortDocs([a, b], SORT_BY.CHARS).map((item) => item.title)).toEqual(['B', 'A'])
  })
})

describe('queryDocs', () => {
  it('排除已删除 → 过滤 → 排序，一步到位', () => {
    const list = [
      doc({ title: '关于我', content: '后端工程师' }, NOW),
      doc({ title: '年度总结', content: '读书 12 本' }, LATER),
      { ...doc({ title: '关于我（草稿）', content: '后端工程师' }, LATER), deleted: 1 }
    ]
    const result = queryDocs(list, { keyword: '后端' })
    expect(result.map((item) => item.title)).toEqual(['关于我'])
  })

  it('不给条件时返回全部可见文档，按时间倒序', () => {
    const list = [doc({ title: '早' }, NOW), doc({ title: '晚' }, LATER)]
    expect(queryDocs(list).map((item) => item.title)).toEqual(['晚', '早'])
  })
})

/**
 * 错误语言键的完整性检查。
 *
 * 这套机制有一个**静默失效**的坑：领域层抛错时写错一个键名（或忘了补翻译），
 * 界面不会报错，只会悄悄回退成中文 `message`。英文用户看到中文提示，
 * 而所有测试依然全绿——不专门测就发现不了。
 *
 * 所以这里从两头对齐：
 * 1. 真的触发若干错误，取出它们的 `key`，确认两份语言包里都有；
 * 2. 扫一遍源码里所有 `key: '...'` 字面量，把没法直接触发的那些也覆盖到。
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { buildCapsule } from './capsule.js'
import { abandonTask, buildTask, completeTask } from './task.js'
import { milestonesReached } from './achievement.js'
import { TASK_STATUS } from './constants.js'

const here = dirname(fileURLToPath(import.meta.url))
const localesDir = join(here, '..', 'locales')

const zh = JSON.parse(readFileSync(join(localesDir, 'zh-CN.json'), 'utf8'))
const en = JSON.parse(readFileSync(join(localesDir, 'en-US.json'), 'utf8'))

/** 按 'a.b.c' 取值，任一层缺失返回 undefined。 */
const lookup = (obj, key) =>
  key.split('.').reduce((acc, part) => (acc === undefined || acc === null ? undefined : acc[part]), obj)

/** 跑一段必定抛错的代码，返回它的 error.key。 */
function keyOf(fn) {
  try {
    fn()
  } catch (error) {
    return error.key
  }
  throw new Error('预期这段代码会抛错，但它没有')
}

const NOW = new Date(2026, 8, 15, 10, 0, 0)
const FUTURE = '2099-01-01 00:00:00'
const PAST = '2000-01-01 00:00:00'

describe('语言键完整性', () => {
  // 真的触发一遍，确保断言的不是我手抄的键名，而是代码实际抛出来的那个
  const triggered = {
    '任务名称为空': keyOf(() => buildTask({}, NOW)),
    '放弃已完成的任务': keyOf(() => {
      const { task } = completeTask(buildTask({ title: 'x' }, NOW), NOW)
      abandonTask(task, NOW)
    }),
    '胶囊内容为空': keyOf(() => buildCapsule({ content: '', toDate: FUTURE }, NOW)),
    '胶囊缺开启时间': keyOf(() => buildCapsule({ content: 'x' }, NOW)),
    '胶囊开启时间在过去': keyOf(() => buildCapsule({ content: 'x', toDate: PAST }, NOW)),
    '未知成就类型': keyOf(() => milestonesReached('不存在的类型', 1))
  }

  for (const [label, key] of Object.entries(triggered)) {
    it(`「${label}」的键在中英语言包里都存在`, () => {
      expect(key, `${label} 没有带 key，英文界面会看到中文`).toBeTruthy()
      expect(lookup(zh, key), `zh-CN.json 缺少 ${key}`).toBeTypeOf('string')
      expect(lookup(en, key), `en-US.json 缺少 ${key}`).toBeTypeOf('string')
    })
  }

  it('触发出来的键都指向 errors 命名空间', () => {
    for (const key of Object.values(triggered)) {
      expect(key.startsWith('errors.')).toBe(true)
    }
  })
})

describe('源码里声明的语言键', () => {
  /** 递归收集 src 下的 js 文件（跳过测试文件自身与 node_modules）。 */
  function collectSources(dir) {
    const out = []
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name)
      if (entry.isDirectory()) {
        out.push(...collectSources(full))
      } else if (entry.name.endsWith('.js') && !entry.name.endsWith('.test.js')) {
        out.push(full)
      }
    }
    return out
  }

  const sources = [
    ...collectSources(join(here, '..', 'domain')),
    ...collectSources(join(here, '..', 'repository')),
    ...collectSources(join(here, '..', 'utils'))
  ]

  it('扫到的源码文件数量合理（防止路径写错导致空扫）', () => {
    expect(sources.length).toBeGreaterThan(8)
  })

  it('源码里声明的每个 errors.* 键在两份语言包里都有对应文案', () => {
    const found = new Map()
    for (const file of sources) {
      const text = readFileSync(file, 'utf8')
      for (const match of text.matchAll(/key:\s*'(errors\.[A-Za-z0-9_.]+)'/g)) {
        found.set(match[1], file.replace(here, ''))
      }
    }

    // 至少要扫到 domain/errors.js 之外的一批，否则说明正则失效了
    expect(found.size).toBeGreaterThan(5)

    const missing = []
    for (const [key, file] of found) {
      if (typeof lookup(zh, key) !== 'string') missing.push(`${key}（zh-CN，来自 ${file}）`)
      if (typeof lookup(en, key) !== 'string') missing.push(`${key}（en-US，来自 ${file}）`)
    }
    expect(missing).toEqual([])
  })

  it('语言包里没有多余的错误键（死键同样是维护负担）', () => {
    const declared = new Set()
    for (const file of sources) {
      const text = readFileSync(file, 'utf8')
      for (const match of text.matchAll(/key:\s*'(errors\.[A-Za-z0-9_.]+)'/g)) {
        declared.add(match[1])
      }
    }
    const unused = Object.keys(zh.errors)
      .map((name) => `errors.${name}`)
      // errors.unknown 是 api/local.js 的兜底文案，不在源码里以 key: 形式出现
      .filter((key) => key !== 'errors.unknown' && !declared.has(key))
    expect(unused).toEqual([])
  })
})

describe('领域层保持零依赖', () => {
  it('domain/ 与 repository/ 都不引入 vue 或 i18n', () => {
    const files = [
      ...collectSourcesStatic(join(here, '..', 'domain')),
      ...collectSourcesStatic(join(here, '..', 'repository'))
    ]
    const offenders = files.filter((file) => {
      const text = readFileSync(file, 'utf8')
      return /from\s+'[^']*(vue|i18n)[^']*'/.test(text)
    })
    // 这是这套「错误码 + 边界层翻译」方案成立的前提：
    // 一旦领域层依赖了 i18n，181 个测试就得先搭一套 i18n 环境才能跑。
    expect(offenders).toEqual([])
  })
})

/** 与 collectSources 相同，提到外层供两个 describe 复用。 */
function collectSourcesStatic(dir) {
  const out = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      out.push(...collectSourcesStatic(full))
    } else if (entry.name.endsWith('.js') && !entry.name.endsWith('.test.js')) {
      out.push(full)
    }
  }
  return out
}

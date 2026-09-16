import { describe, it, expect } from 'vitest'
import {
  AI_LIMITS,
  AI_PROVIDERS,
  AI_ROLES,
  buildAiConfig,
  checkMessages,
  isConfigured,
  isKnownProvider,
  maskApiKey,
  providerById
} from './ai.js'

const NOW = new Date(2026, 8, 15, 10, 0, 0)

describe('供应商白名单', () => {
  it('每一个都有完整的四项：代号、展示名、端点、默认模型', () => {
    for (const provider of AI_PROVIDERS) {
      expect(provider.id).toBeTruthy()
      expect(provider.label).toBeTruthy()
      expect(provider.baseUrl.startsWith('https://')).toBe(true)
      expect(provider.defaultModel).toBeTruthy()
    }
  })

  it('端点一律是 https，且不带结尾斜杠（拼接时不会出现双斜杠）', () => {
    for (const provider of AI_PROVIDERS) {
      expect(provider.baseUrl.endsWith('/')).toBe(false)
    }
  })

  it('代号唯一', () => {
    const ids = AI_PROVIDERS.map((item) => item.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('按代号取得到', () => {
    expect(providerById('deepseek').label).toBe('DeepSeek')
    expect(isKnownProvider('deepseek')).toBe(true)
  })

  it('不认识的代号一律返回 null / false（这是安全边界，不能放行）', () => {
    // 浏览器递过来的东西不可信：可能是任意字符串，甚至是 URL
    expect(providerById('http://169.254.169.254/')).toBeNull()
    expect(providerById('https://evil.example.com')).toBeNull()
    expect(providerById('')).toBeNull()
    expect(providerById(null)).toBeNull()
    expect(providerById({ id: 'deepseek' })).toBeNull()
    expect(isKnownProvider('__proto__')).toBe(false)
    expect(isKnownProvider('constructor')).toBe(false)
  })
})

describe('buildAiConfig', () => {
  it('认识的三项原样收下，去掉两端空白', () => {
    const config = buildAiConfig({ provider: 'deepseek', model: ' deepseek-chat ', apiKey: ' sk-abc ' }, NOW)
    expect(config.provider).toBe('deepseek')
    expect(config.model).toBe('deepseek-chat')
    expect(config.apiKey).toBe('sk-abc')
    expect(config.updatedAt).toBe('2026-09-15 10:00:00')
  })

  it('不认识的供应商被清空，而不是原样存下来', () => {
    // 存下来会在下一次拼端点时变成一个「未知来源的地址」
    expect(buildAiConfig({ provider: 'evil' }).provider).toBe('')
    expect(buildAiConfig({ provider: 'https://evil.example.com' }).provider).toBe('')
  })

  it('允许存半成品（先选供应商，回头再填 Key）', () => {
    const config = buildAiConfig({ provider: 'openai' })
    expect(config.provider).toBe('openai')
    expect(config.model).toBe('')
    expect(config.apiKey).toBe('')
  })

  it('超长的模型名与 Key 被截断，不会让存储里出现异常长的值', () => {
    const config = buildAiConfig({
      model: 'x'.repeat(AI_LIMITS.model + 50),
      apiKey: 'y'.repeat(AI_LIMITS.apiKey + 50)
    })
    expect(config.model).toHaveLength(AI_LIMITS.model)
    expect(config.apiKey).toHaveLength(AI_LIMITS.apiKey)
  })

  it('非字符串的字段不会变成 "undefined" 这种字符串', () => {
    const config = buildAiConfig({ provider: 'deepseek', model: 123, apiKey: null })
    expect(config.model).toBe('')
    expect(config.apiKey).toBe('')
  })
})

describe('isConfigured', () => {
  const full = { provider: 'deepseek', model: 'deepseek-chat', apiKey: 'sk-abc' }

  it('三样齐全才算配好', () => {
    expect(isConfigured(full)).toBe(true)
  })

  it('缺任何一样都算没配好', () => {
    expect(isConfigured({ ...full, provider: '' })).toBe(false)
    expect(isConfigured({ ...full, model: '' })).toBe(false)
    expect(isConfigured({ ...full, apiKey: '' })).toBe(false)
    expect(isConfigured({ ...full, apiKey: '   ' })).toBe(false)
  })

  it('供应商必须是认识的那几个', () => {
    expect(isConfigured({ ...full, provider: 'evil' })).toBe(false)
  })

  it('config 为 null / undefined 时不炸', () => {
    // 首次打开时它就是空的，这里必须能安全返回
    expect(isConfigured(null)).toBe(false)
    expect(isConfigured(undefined)).toBe(false)
  })
})

describe('maskApiKey', () => {
  it('只留头尾各四位', () => {
    expect(maskApiKey('sk-1234567890abcdef')).toBe('sk-1…cdef')
  })

  it('太短的整串遮掉，免得等于没遮', () => {
    expect(maskApiKey('short')).toBe('…')
    expect(maskApiKey('12345678')).toBe('…')
  })

  it('空值返回空串', () => {
    expect(maskApiKey('')).toBe('')
    expect(maskApiKey(null)).toBe('')
  })

  it('遮过之后不包含原文（截图外传时不能漏）', () => {
    const key = 'sk-abcdefghijklmnop'
    const masked = maskApiKey(key)
    expect(key.includes(masked)).toBe(false)
    expect(masked).not.toBe(key)
  })
})

describe('checkMessages', () => {
  const ok = [{ role: 'system', content: '你是…' }, { role: 'user', content: '你好' }]

  it('接受合法的消息列表，并且只保留 role 与 content 两个字段', () => {
    const result = checkMessages([{ role: 'user', content: '你好', extra: 'x' }])
    expect(result.ok).toBe(true)
    expect(result.messages).toEqual([{ role: 'user', content: '你好' }])
  })

  it('拒绝空数组与非数组', () => {
    expect(checkMessages([]).ok).toBe(false)
    expect(checkMessages('hello').ok).toBe(false)
    expect(checkMessages(null).ok).toBe(false)
  })

  it('拒绝不认识的角色', () => {
    expect(checkMessages([{ role: 'system', content: 'x' }, { role: 'tool', content: 'x' }]).ok).toBe(false)
    expect(checkMessages([{ role: 'admin', content: 'x' }]).ok).toBe(false)
  })

  it('拒绝空正文', () => {
    expect(checkMessages([{ role: 'user', content: '   ' }]).ok).toBe(false)
    expect(checkMessages([{ role: 'user', content: 123 }]).ok).toBe(false)
  })

  it('拒绝超过条数上限', () => {
    const many = Array.from({ length: AI_LIMITS.messages + 1 }, () => ({ role: 'user', content: 'x' }))
    expect(checkMessages(many).ok).toBe(false)
    expect(checkMessages(many.slice(1)).ok).toBe(true)
  })

  it('拒绝单条超长', () => {
    expect(checkMessages([{ role: 'user', content: 'x'.repeat(AI_LIMITS.content + 1) }]).ok).toBe(false)
    expect(checkMessages([{ role: 'user', content: 'x'.repeat(AI_LIMITS.content) }]).ok).toBe(true)
  })

  it('三种角色都在白名单里（不多不少）', () => {
    expect(AI_ROLES).toEqual(['system', 'user', 'assistant'])
  })
})

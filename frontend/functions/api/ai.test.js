/**
 * 同源 AI 转发函数的测试。
 *
 * 它跑在 Cloudflare 的边缘上，本地起不了 Worker——但**不必起**：
 * 处理器就是「收一个 Request、还一个 Response」的普通异步函数，
 * 把全局 `fetch` 换成假的就能把每一条分支都测到，
 * 包括上游 401、429、超时、返回 HTML 错误页这些真实世界里的坑。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { onRequest, onRequestGet, onRequestPost } from './ai.js'
import { AI_LIMITS } from '../../src/domain/ai.js'

const HOST = 'https://timecapsule-4o9.pages.dev'
const KEY = 'sk-test-1234567890'

const post = (options = {}) => {
  const {
    origin = HOST,
    provider = 'deepseek',
    key = KEY,
    body = { model: 'deepseek-chat', messages: [{ role: 'user', content: '你好' }] },
    url = `${HOST}/api/ai`,
    rawBody = null
  } = options

  const headers = {}
  if (origin !== null) headers.Origin = origin
  if (provider !== null) headers['X-AI-Provider'] = provider
  if (key !== null) headers.Authorization = `Bearer ${key}`

  return new Request(url, {
    method: 'POST',
    headers,
    body: rawBody ?? JSON.stringify(body)
  })
}

/** 造一个上游响应。 */
const upstream = (status, payload, { text = null } = {}) => ({
  ok: status >= 200 && status < 300,
  status,
  text: async () => text ?? JSON.stringify(payload)
})

const okPayload = { choices: [{ message: { content: '  我那时候也这么想  ' } }] }

let fetchMock

beforeEach(() => {
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('POST /api/ai —— 正常转发', () => {
  it('把回复正文取出来返回，并去掉两端空白', async () => {
    fetchMock.mockResolvedValue(upstream(200, okPayload))
    const response = await onRequestPost({ request: post() })
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ content: '我那时候也这么想' })
  })

  it('发到的是白名单里那家的地址（浏览器递的只是代号）', async () => {
    fetchMock.mockResolvedValue(upstream(200, okPayload))
    await onRequestPost({ request: post({ provider: 'deepseek' }) })
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.deepseek.com/chat/completions')
  })

  it('带上用户的 Key，且**只发 model 与 messages**', async () => {
    fetchMock.mockResolvedValue(upstream(200, okPayload))
    await onRequestPost({ request: post() })

    const init = fetchMock.mock.calls[0][1]
    expect(init.headers.Authorization).toBe(`Bearer ${KEY}`)
    // 各家对 temperature / max_tokens 的支持不一致（推理模型常直接拒收），
    // 所以刻意不代传，风格与长度交给提示词控制
    expect(JSON.parse(init.body)).toEqual({
      model: 'deepseek-chat',
      messages: [{ role: 'user', content: '你好' }]
    })
  })

  it('响应不被缓存（对话内容不该留在任何中间层）', async () => {
    fetchMock.mockResolvedValue(upstream(200, okPayload))
    const response = await onRequestPost({ request: post() })
    expect(response.headers.get('cache-control')).toBe('no-store')
  })

  it('模型名与消息里的多余字段都被规整掉', async () => {
    fetchMock.mockResolvedValue(upstream(200, okPayload))
    await onRequestPost({
      request: post({
        body: {
          model: '  deepseek-chat  ',
          messages: [{ role: 'user', content: '你好', malicious: 'x' }]
        }
      })
    })
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      model: 'deepseek-chat',
      messages: [{ role: 'user', content: '你好' }]
    })
  })
})

describe('POST /api/ai —— 请求侧的把关', () => {
  it('拒绝跨站来源（浏览器改不了 Origin，这是有效的一道闸）', async () => {
    const response = await onRequestPost({ request: post({ origin: 'https://evil.example.com' }) })
    expect(response.status).toBe(403)
    await expect(response.json()).resolves.toEqual({ error: { code: 'origin_not_allowed', detail: '' } })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('没有 Origin 也拒绝（非浏览器客户端走不到上游）', async () => {
    expect((await onRequestPost({ request: post({ origin: null }) })).status).toBe(403)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('预览域名与本地开发同样放行（只要是同源）', async () => {
    fetchMock.mockResolvedValue(upstream(200, okPayload))
    const preview = await onRequestPost({
      request: post({ origin: 'https://abc123.timecapsule-4o9.pages.dev', url: 'https://abc123.timecapsule-4o9.pages.dev/api/ai' })
    })
    expect(preview.status).toBe(200)

    const local = await onRequestPost({
      request: post({ origin: 'http://localhost:4113', url: 'http://localhost:4113/api/ai' })
    })
    expect(local.status).toBe(200)
  })

  it('拒绝不认识的供应商代号，而且**不去请求任何地址**', async () => {
    // 这是最关键的一条：用户可能递过来一个 URL，绝不能拿它去 fetch
    for (const bad of ['https://evil.example.com', 'http://169.254.169.254/', '__proto__', 'constructor']) {
      const response = await onRequestPost({ request: post({ provider: bad }) })
      expect(response.status).toBe(400)
      await expect(response.json()).resolves.toEqual({ error: { code: 'unknown_provider', detail: '' } })
    }
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('没有 Key 时拒绝', async () => {
    expect((await onRequestPost({ request: post({ key: null }) })).status).toBe(401)
    expect((await onRequestPost({ request: post({ key: '   ' }) })).status).toBe(401)

    const overlong = await onRequestPost({ request: post({ key: 'x'.repeat(AI_LIMITS.apiKey + 1) }) })
    expect(overlong.status).toBe(401)

    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('请求体不是 JSON 时拒绝', async () => {
    const response = await onRequestPost({ request: post({ rawBody: 'not json' }) })
    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({ error: { code: 'bad_request', detail: '' } })
  })

  it('请求体过大时直接拒绝，不拿去喂上游', async () => {
    const huge = JSON.stringify({
      model: 'm',
      messages: [{ role: 'user', content: 'x'.repeat(AI_LIMITS.requestChars + 10) }]
    })
    const response = await onRequestPost({ request: post({ rawBody: huge }) })
    expect(response.status).toBe(413)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('缺模型名时拒绝', async () => {
    const response = await onRequestPost({ request: post({ body: { messages: [{ role: 'user', content: 'x' }] } }) })
    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({ error: { code: 'missing_model', detail: '' } })
  })

  it('消息不合法时拒绝，并把原因带上', async () => {
    const response = await onRequestPost({
      request: post({ body: { model: 'm', messages: [{ role: 'tool', content: 'x' }] } })
    })
    expect(response.status).toBe(400)
    const payload = await response.json()
    expect(payload.error.code).toBe('bad_messages')
    expect(payload.error.detail).toContain('role')
  })
})

describe('POST /api/ai —— 上游出错时的翻译', () => {
  const errorCases = [
    [401, 'upstream_auth'],
    [403, 'upstream_auth'],
    [429, 'upstream_rate_limit'],
    [500, 'upstream_error'],
    [400, 'upstream_error']
  ]

  for (const [status, code] of errorCases) {
    it(`上游 ${status} → ${code}`, async () => {
      fetchMock.mockResolvedValue(upstream(status, { error: { message: 'Invalid API key provided' } }))
      const response = await onRequestPost({ request: post() })
      expect(response.status).toBe(502)
      const payload = await response.json()
      expect(payload.error.code).toBe(code)
      expect(payload.error.detail).toContain('Invalid API key')
    })
  }

  it('上游返回 HTML 错误页时也不崩', async () => {
    fetchMock.mockResolvedValue(upstream(502, null, { text: '<html><body>Bad Gateway</body></html>' }))
    const response = await onRequestPost({ request: post() })
    expect(response.status).toBe(502)
    const payload = await response.json()
    expect(payload.error.code).toBe('upstream_error')
    expect(payload.error.detail).toContain('Bad Gateway')
  })

  it('网络失败 → network_error', async () => {
    fetchMock.mockRejectedValue(new TypeError('fetch failed'))
    const response = await onRequestPost({ request: post() })
    expect(response.status).toBe(504)
    await expect(response.json()).resolves.toEqual({ error: { code: 'network_error', detail: '' } })
  })

  it('超时 → upstream_timeout（用户不该一直看转圈）', async () => {
    const timeout = new Error('timed out')
    timeout.name = 'TimeoutError'
    fetchMock.mockRejectedValue(timeout)
    const response = await onRequestPost({ request: post() })
    await expect(response.json()).resolves.toEqual({ error: { code: 'upstream_timeout', detail: '' } })
  })

  it('上游说成功但没给正文 → bad_response', async () => {
    fetchMock.mockResolvedValue(upstream(200, { choices: [] }))
    const response = await onRequestPost({ request: post() })
    await expect(response.json()).resolves.toEqual({ error: { code: 'bad_response', detail: '' } })
  })

  it('**上游报错里回显了 Key 时，交给浏览器之前先抹掉**', async () => {
    // 有些网关会把请求内容原样回显；界面上的错误提示会被截图、会被贴给别人看
    fetchMock.mockResolvedValue(upstream(401, { error: { message: `Incorrect key: ${KEY}` } }))
    const response = await onRequestPost({ request: post() })
    const payload = await response.json()
    expect(payload.error.detail).not.toContain(KEY)
    expect(payload.error.detail).toContain('***')
  })
})

describe('GET /api/ai —— 拉模型列表', () => {
  const get = (options = {}) => {
    const { origin = HOST, provider = 'deepseek', key = KEY } = options
    const headers = {}
    if (origin !== null) headers.Origin = origin
    if (provider !== null) headers['X-AI-Provider'] = provider
    if (key !== null) headers.Authorization = `Bearer ${key}`
    return new Request(`${HOST}/api/ai`, { method: 'GET', headers })
  }

  it('**同源 GET 不带 Origin 也必须放行**（浏览器本来就不带）', async () => {
    // 浏览器只给「跨站请求」与「同源的非 GET/HEAD 请求」附加 Origin，
    // 所以设置页里那句同源的 fetch('/api/ai') 到达函数时**没有这个头**。
    // 曾经这里要求必须有 Origin，后果是「测试连接」永远收到 403、
    // 模型列表一辈子拉不回来——而当时的测试自己手工塞了 Origin，全绿地放过了它。
    fetchMock.mockResolvedValue(upstream(200, { data: [{ id: 'deepseek-chat' }] }))
    const response = await onRequestGet({ request: get({ origin: null }) })
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ models: ['deepseek-chat'] })
  })

  it('但带了别人的 Origin 仍然拒绝', async () => {
    expect((await onRequestGet({ request: get({ origin: 'https://evil.example.com' }) })).status).toBe(403)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('POST 仍然要求 Origin（非同源的脚本发 POST 时一定会带，且改不了）', async () => {
    expect((await onRequestPost({ request: post({ origin: null }) })).status).toBe(403)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('把 id 挑出来返回', async () => {
    fetchMock.mockResolvedValue(upstream(200, { data: [{ id: 'deepseek-chat' }, { id: 'deepseek-reasoner' }] }))
    const response = await onRequestGet({ request: get() })
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ models: ['deepseek-chat', 'deepseek-reasoner'] })
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.deepseek.com/models')
  })

  it('过滤掉没有 id 的条目，并限制条数', async () => {
    const many = Array.from({ length: 400 }, (_, i) => ({ id: `m${i}` }))
    many.push({ object: 'model' }, { id: 123 })
    fetchMock.mockResolvedValue(upstream(200, { data: many }))
    const payload = await (await onRequestGet({ request: get() })).json()
    expect(payload.models).toHaveLength(300)
    expect(payload.models.every((id) => typeof id === 'string')).toBe(true)
  })

  it('同样校验来源与 Key', async () => {
    expect((await onRequestGet({ request: get({ origin: 'https://evil.example.com' }) })).status).toBe(403)
    expect((await onRequestGet({ request: get({ key: null }) })).status).toBe(401)
    expect((await onRequestGet({ request: get({ provider: 'nope' }) })).status).toBe(400)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('上游报错时给出同一个错误形状', async () => {
    fetchMock.mockResolvedValue(upstream(401, { error: { message: 'bad key' } }))
    const response = await onRequestGet({ request: get() })
    expect(response.status).toBe(502)
    await expect(response.json()).resolves.toMatchObject({ error: { code: 'upstream_auth' } })
  })
})

describe('兜底入口', () => {
  it('POST 与 GET 被转发到各自的处理器', async () => {
    fetchMock.mockResolvedValue(upstream(200, okPayload))
    expect((await onRequest({ request: post() })).status).toBe(200)
  })

  it('其它方法一律拒绝', async () => {
    const request = new Request(`${HOST}/api/ai`, {
      method: 'DELETE',
      headers: { Origin: HOST, 'X-AI-Provider': 'deepseek', Authorization: `Bearer ${KEY}` }
    })
    const response = await onRequest({ request })
    expect(response.status).toBe(405)
    await expect(response.json()).resolves.toEqual({ error: { code: 'method_not_allowed', detail: '' } })
  })
})

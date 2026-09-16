/**
 * 同源 AI 转发（Cloudflare Pages Function，路由 `/api/ai`）。
 *
 * ## 为什么需要它
 *
 * 应用是**纯静态**的，而各家大模型的接口都不给浏览器发 CORS 头
 * （实测 DeepSeek 的响应里连一个 `access-control-*` 都没有），
 * 所以浏览器直连必然被拦。这个函数与页面**同源**，于是跨域问题根本不存在。
 *
 * ## 它刻意不做的事
 *
 * - **不保存、不记录任何东西**：用户的 API Key 与对话内容都不落盘、不打日志。
 *   它只是一次转发。
 * - **不接受 URL**：请求头里递过来的是**供应商代号**（`deepseek` / `openai` / …），
 *   真正往哪发由 `src/domain/ai.js` 那份白名单决定（这个文件 import 的就是它）。
 *   于是「用户把端点填成内网地址、让函数替他请求」这类 SSRF 与开放代理问题
 *   从设计上不存在——不是靠校验 URL，而是压根递不上 URL。
 *
 * ## 两个端点合在一个文件里
 *
 * `POST /api/ai` 发对话，`GET /api/ai` 拉模型列表（设置页的「测试连接」用）。
 * 合成一个文件是为了不必在 `functions/` 下再放一个共用模块——
 * Cloudflare 的文件路由会把 `functions/` 里**每一个文件**都注册成路由，
 * 「下划线开头的文件是否被忽略」在官方文档里并没有明确写。
 *
 * ## 安全边界说到做到
 *
 * `Origin` 校验挡的是**浏览器**发起的跨站滥用（浏览器对非 GET 请求一定会带 `Origin`，
 * 且脚本改不了它）。非浏览器客户端可以伪造这个头——但那类调用者必须自带 API Key，
 * 我们既不泄露任何密钥，也不替他省钱，最坏情况只是消耗一点本项目的函数调用额度。
 * 真正兜底的是 `_routes.json` 把函数范围限制在 `/api/*`，静态资源不进函数。
 */
import { AI_LIMITS, checkMessages, providerById } from '../../src/domain/ai.js'

/** 上游超时。用户等 60 秒还没回复，就该看到明确的失败而不是一直转圈。 */
const UPSTREAM_TIMEOUT_MS = 60_000

/** OpenRouter 这类聚合网关的模型列表很长，截一下免得响应过大。 */
const MAX_MODELS = 300

const JSON_HEADERS = Object.freeze({
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store'
})

const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: JSON_HEADERS })

/**
 * 统一错误形状：`{ error: { code, detail } }`。
 * `code` 是稳定标识，**翻译在浏览器里做**（见 locales 的 `errors.ai*`）——
 * 函数不该知道用户界面用哪种语言。
 */
const fail = (status, code, detail = '') => json({ error: { code, detail } }, status)

/**
 * 请求是不是从本站自己发起的。
 *
 * ⚠️ **GET 那一侧不能要求必须有 Origin**，这是踩过的坑：
 * 浏览器只对「跨站请求」和「同站的非 GET/HEAD 请求」附加 `Origin`
 * （见 Fetch 标准），所以同源的 `fetch('/api/ai')` **不带**这个头。
 * 早先这里对 GET 也要求 Origin，后果是设置页的「测试连接」永远收到 403
 * `origin_not_allowed`，模型列表一辈子拉不回来——而单元测试自己手工塞了
 * Origin，于是全绿地放过了它，直到对抗式评审把它翻出来。
 *
 * GET 那条路本来也不需要这层保护：调用方自带 Key（没有环境凭据、没有 Cookie），
 * 跨站页面既没法在预检未通过时带上 `Authorization`，也读不到响应。
 * 所以 GET 只在「带了 Origin 且不是自己」时才拒绝。
 *
 * @param {Request} request
 * @param {{requireOrigin?: boolean}} [options] POST 用默认值（true），GET 传 false
 */
function isSameOrigin(request, { requireOrigin = true } = {}) {
  const origin = request.headers.get('Origin')
  if (origin === null || origin === '') return !requireOrigin
  try {
    return new URL(origin).host === new URL(request.url).host
  } catch {
    return false
  }
}

/** 从 `Authorization: Bearer xxx` 里取出 Key。 */
function readApiKey(request) {
  const header = request.headers.get('Authorization') ?? ''
  if (!header.startsWith('Bearer ')) return ''
  return header.slice('Bearer '.length).trim()
}

/**
 * 把上游返回里的 Key 抹掉再交给浏览器。
 *
 * 有些供应商的报错会把请求内容回显出来，万一里面带着 Key，
 * 它就会出现在用户界面上（截图、贴给朋友看时一起送出去）。多做一步不亏。
 */
function redact(text, apiKey) {
  if (typeof text !== 'string') return ''
  const cleaned = apiKey && apiKey.length >= 8 ? text.split(apiKey).join('***') : text
  return cleaned.replace(/\s+/g, ' ').trim().slice(0, 300)
}

/** 从上游的错误响应里捞一句人话。 */
function upstreamMessage(payload, rawText) {
  const message = payload?.error?.message ?? payload?.message ?? payload?.error
  if (typeof message === 'string' && message !== '') return message
  return typeof rawText === 'string' ? rawText : ''
}

/** 发一次上游请求，把「网络失败 / 上游报错 / 成功」三种结果规整成同一个形状。 */
async function callUpstream(url, init, apiKey) {
  let response
  try {
    response = await fetch(url, {
      ...init,
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS)
    })
  } catch (error) {
    const timedOut = error?.name === 'TimeoutError' || error?.name === 'AbortError'
    return { ok: false, status: 504, code: timedOut ? 'upstream_timeout' : 'network_error', detail: '' }
  }

  const rawText = await response.text()
  let payload = null
  try {
    payload = JSON.parse(rawText)
  } catch {
    // 有些网关在 5xx 时返回 HTML 错误页，这时候 payload 只能是 null
  }

  if (!response.ok) {
    const code = response.status === 401 || response.status === 403
      ? 'upstream_auth'
      : response.status === 429
        ? 'upstream_rate_limit'
        : 'upstream_error'
    return { ok: false, status: 502, code, detail: redact(upstreamMessage(payload, rawText), apiKey) }
  }

  if (payload === null) {
    return { ok: false, status: 502, code: 'bad_response', detail: '' }
  }
  return { ok: true, payload }
}

/** 从一次对话响应里取出回复正文。 */
function pickContent(payload) {
  const content = payload?.choices?.[0]?.message?.content
  return typeof content === 'string' ? content.trim() : ''
}

/** 解析出这次请求要用的供应商与 Key，出错时返回一个可直接返回的 Response。 */
function resolveTarget(request) {
  const provider = providerById(request.headers.get('X-AI-Provider'))
  if (!provider) {
    return { error: fail(400, 'unknown_provider') }
  }

  const apiKey = readApiKey(request)
  if (apiKey === '' || apiKey.length > AI_LIMITS.apiKey) {
    return { error: fail(401, 'missing_key') }
  }

  return { provider, apiKey, headers: { Authorization: `Bearer ${apiKey}` } }
}

/** POST /api/ai —— 发一次对话，返回 `{ content }`。 */
export async function onRequestPost({ request }) {
  if (!isSameOrigin(request)) {
    return fail(403, 'origin_not_allowed')
  }

  const raw = await request.text()
  if (raw.length > AI_LIMITS.requestChars) {
    return fail(413, 'too_large')
  }

  let body
  try {
    body = JSON.parse(raw)
  } catch {
    return fail(400, 'bad_request')
  }

  const target = resolveTarget(request)
  if (target.error) return target.error

  const model = typeof body?.model === 'string' ? body.model.trim().slice(0, AI_LIMITS.model) : ''
  if (model === '') {
    return fail(400, 'missing_model')
  }

  const checked = checkMessages(body?.messages)
  if (!checked.ok) {
    return fail(400, 'bad_messages', checked.reason)
  }

  const result = await callUpstream(
    `${target.provider.baseUrl}/chat/completions`,
    {
      method: 'POST',
      headers: { ...target.headers, 'content-type': 'application/json' },
      // **只发 model 与 messages**：各家对 temperature / max_tokens 的支持并不一致
      // （推理类模型常常直接拒收 temperature），兼容性优先，理由见 domain/ai.js
      body: JSON.stringify({ model, messages: checked.messages })
    },
    target.apiKey
  )

  if (!result.ok) {
    return fail(result.status, result.code, result.detail)
  }

  const content = pickContent(result.payload)
  if (content === '') {
    return fail(502, 'bad_response')
  }

  return json({ content })
}

/** GET /api/ai —— 拉一次模型列表，设置页的「测试连接」用它。 */
export async function onRequestGet({ request }) {
  // 同源 GET 不带 Origin，所以这里不能要求它有（理由见 isSameOrigin）
  if (!isSameOrigin(request, { requireOrigin: false })) {
    return fail(403, 'origin_not_allowed')
  }

  const target = resolveTarget(request)
  if (target.error) return target.error

  const result = await callUpstream(
    `${target.provider.baseUrl}/models`,
    { method: 'GET', headers: target.headers },
    target.apiKey
  )

  if (!result.ok) {
    return fail(result.status, result.code, result.detail)
  }

  const list = Array.isArray(result.payload?.data) ? result.payload.data : []
  const models = list
    .map((item) => (typeof item?.id === 'string' ? item.id : ''))
    .filter((id) => id !== '')
    .slice(0, MAX_MODELS)

  return json({ models })
}

/**
 * 兜底入口。
 *
 * 导出 `onRequest` 之后它会成为该方法没有专属处理器时的落点；
 * 这里显式转发一次，是为了不管 Cloudflare 的优先级规则怎么变都不会错。
 */
export function onRequest(context) {
  if (context.request.method === 'POST') return onRequestPost(context)
  if (context.request.method === 'GET') return onRequestGet(context)
  return fail(405, 'method_not_allowed')
}

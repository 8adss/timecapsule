/**
 * AI 配置与连通性测试。
 *
 * ## 这是全应用仅有的两个发网络请求的地方之一
 *
 * （另一个是 `api/chat.js` 发对话。）请求发往**同源的** `/api/ai`，
 * 由 Cloudflare Pages Function 转发给大模型；本地开发时由 Vite 中间件
 * 执行同一份函数代码（见 vite.config.js）。同源，所以没有跨域问题。
 *
 * 用户的 API Key 只存在他自己的浏览器里，随请求头递出去，函数不落盘、不记日志。
 *
 * ## 错误码的翻译在这里做
 *
 * 函数返回的是稳定标识（`upstream_auth` / `missing_key` / …），
 * 它不该知道界面用哪种语言，所以翻译统一落在这一层——
 * 与领域层抛 `{ key }`、`api/local.js` 负责弹提示是同一套分工。
 */
import { run } from './local'
import { DomainError } from '../domain/errors'
import { errorKeyOf, isConfigured } from '../domain/ai'
import * as aiRepo from '../repository/aiRepo'

/** 供应商表与 Key 的展示形式，转给设置页用（页面不直接 import domain/）。 */
export { AI_PROVIDERS, maskApiKey, providerById } from '../domain/ai'

/**
 * 把函数的错误响应翻成领域错误。
 *
 * 错误码 → 文案键的对照表在 `domain/ai.js`（放那边是为了让语言键检查扫得到）。
 * 上游的原话（`detail`）会附在文案后面——「API Key 无效」这句话信息量有限，
 * 真正有用的是供应商说的那句 `Incorrect API key provided`。
 * 函数侧已经把可能回显出来的 Key 抹掉了（见 functions/api/ai.js 的 redact）。
 */
function toDomainError(payload) {
  const code = payload?.error?.code
  const detail = typeof payload?.error?.detail === 'string' ? payload.error.detail.trim() : ''

  return new DomainError('AI 请求失败', {
    key: errorKeyOf(code),
    params: { detail: detail === '' ? '' : ` (${detail})` },
    status: code
  })
}

/** 发一次同源请求，返回解析后的响应体；失败一律抛领域错误。 */
async function callFunction(path, options = {}) {
  let response
  try {
    response = await fetch(path, options)
  } catch {
    // fetch 只在网络层失败时抛错：断网、请求被拦、页面离线
    throw new DomainError('网络请求失败', { key: 'errors.aiNetwork' })
  }

  let payload = null
  try {
    payload = await response.json()
  } catch {
    // 中间层（网关、代理）可能返回 HTML 错误页
  }

  if (!response.ok) {
    throw toDomainError(payload)
  }
  return payload ?? {}
}

/** 取一份可用的配置；没配好就抛错——调用方不必自己判断。 */
async function requireConfig() {
  const config = await aiRepo.loadConfig()
  if (!isConfigured(config)) {
    throw new DomainError('还没有配置 AI', { key: 'errors.aiNotConfigured' })
  }
  return config
}

/**
 * 把「表单里填的」与「已保存的」合成一份配置：**留空的项沿用已保存的值**。
 *
 * 规则本体在 `repository/aiRepo.js` 的 `resolveConfig`（那里能被单测直接调用），
 * 这里只是转发一下，免得 api 层再引一次仓储。
 */
const mergeConfig = (input = {}) => aiRepo.resolveConfig(input)

/** 递给函数的两个头。**供应商代号**而不是地址，见 domain/ai.js 的说明。 */
const authHeaders = (config) => ({
  'X-AI-Provider': config.provider,
  Authorization: `Bearer ${config.apiKey}`
})

/** 读取当前 AI 配置（没配过返回 null）。 */
export const getAiConfig = () => run(() => aiRepo.loadConfig())

/** 保存 AI 配置。留空的字段沿用已保存的值（见 `mergeConfig`）。 */
export const saveAiConfig = (input) => run(async () => aiRepo.saveConfig(await mergeConfig(input)))

/** 清空 AI 配置，连同 Key 一起。 */
export const clearAiConfig = () => run(() => aiRepo.clearConfig())

/**
 * 测试连接：拉一次模型列表。
 *
 * 用**表单里当前填的**供应商与 Key（Key 留空则用已保存的那把），
 * 这样用户填完 Key 可以直接点测试，不必先保存再测。
 *
 * 选「拉模型列表」而不是「发一句你好」有两个好处：不消耗 token，
 * 而且**顺带把这个 Key 实际可用的模型名拿回来**——于是模型可以从列表里选，
 * 而不是由我们在代码里写死一堆早晚会过期的名字。
 *
 * @param {{provider?: string, apiKey?: string}} [input] 表单里的当前值
 * @returns {Promise<string[]>} 模型名列表
 */
export const testAiConnection = (input = {}) => run(async () => {
  const config = await mergeConfig(input)

  // 这个接口不需要模型名，所以只校验前两项
  if (!config.provider) {
    throw new DomainError('还没有选择供应商', { key: 'errors.aiProvider' })
  }
  if (!config.apiKey) {
    throw new DomainError('还没有填 API Key', { key: 'errors.aiMissingKey' })
  }

  const payload = await callFunction('/api/ai', {
    method: 'GET',
    headers: { 'X-AI-Provider': config.provider, Authorization: `Bearer ${config.apiKey}` }
  })
  return Array.isArray(payload.models) ? payload.models : []
})

/**
 * 发一次对话，返回回复正文。
 *
 * 模型名取当前配置里的那一个——调用方不必自己再读一次配置。
 *
 * **不加 `run()`**：它是给 `api/chat.js` 内部用的，那边已经有 `run()` 包着，
 * 这里再包一层会弹两次相同的错误提示。
 *
 * @param {Array<{role: string, content: string}>} messages
 * @returns {Promise<string>}
 */
export async function requestChat(messages) {
  const config = await requireConfig()
  const payload = await callFunction('/api/ai', {
    method: 'POST',
    headers: { ...authHeaders(config), 'content-type': 'application/json' },
    body: JSON.stringify({ model: config.model, messages })
  })
  return typeof payload.content === 'string' ? payload.content : ''
}

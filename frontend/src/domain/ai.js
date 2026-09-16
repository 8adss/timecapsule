/**
 * AI 供应商白名单与配置校验。
 *
 * ## 这份表是整条 AI 链路的安全地基
 *
 * 浏览器递过来的永远是**供应商代号**（`deepseek` / `openai` / …），不是 URL；
 * 真正往哪个域名发请求，由**服务端**这份表决定（`functions/api/chat.js` 会 import 它）。
 * 于是「用户把端点填成内网地址、让我们的函数替他请求一下」这类问题
 * 从设计上就不存在——不是靠校验 URL 是否合法，而是压根递不上 URL。
 *
 * 前端也 import 这份表（设置页的下拉框），所以它必须保持**零依赖、纯数据**，
 * 不能碰浏览器 API，也不能 import 任何别的东西。
 *
 * ## 请求体刻意只发 model 与 messages
 *
 * 不代传 `temperature` / `max_tokens` / `top_p`：各家对这几个参数的支持并不一致
 * （推理类模型常常直接拒收 `temperature`，OpenAI 新模型又改叫
 * `max_completion_tokens`）。风格与长度交给**提示词**去控制，兼容性优先。
 */

/**
 * 支持的供应商。全部按 OpenAI 兼容协议：`POST {baseUrl}/chat/completions`
 * 与 `GET {baseUrl}/models`。
 *
 * 要加一家，在这里补一行即可；**不要**改成让用户自己填 URL。
 */
import { nowDateTimeString } from './time.js'

export const AI_PROVIDERS = Object.freeze([
  {
    id: 'deepseek',
    label: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com',
    defaultModel: 'deepseek-chat'
  },
  {
    // 旧版后端的默认供应商就是它（见 legacy 的 AiProperties），
    // 放在靠前的位置：手上已经有火山方舟 Key 的人能直接对上。
    id: 'ark',
    label: '火山方舟（豆包）',
    baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
    defaultModel: 'doubao-seed-1-6-250615'
  },
  {
    id: 'openai',
    label: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4o-mini'
  },
  {
    id: 'openrouter',
    label: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    defaultModel: 'deepseek/deepseek-chat'
  },
  {
    id: 'zhipu',
    label: '智谱 GLM',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    defaultModel: 'glm-4-flash'
  },
  {
    id: 'moonshot',
    label: 'Kimi（月之暗面）',
    baseUrl: 'https://api.moonshot.cn/v1',
    defaultModel: 'moonshot-v1-8k'
  }
])

/** AI 链路上的各处上限。数字集中在这里，前端与函数共用同一份。 */
export const AI_LIMITS = Object.freeze({
  /** API Key 长度上限。各家 key 都很短，400 已是极宽松的兜底 */
  apiKey: 400,
  /** 模型名长度上限（OpenRouter 那种 `vendor/model` 形式会长一些） */
  model: 120,
  /** 一次请求最多带多少条消息（system + 历史 + 本轮） */
  messages: 40,
  /**
   * 单条消息正文上限。
   *
   * 这个数字是**双向**的：既卡发出去的，也必须卡存下来的
   * （`CHAT_LIMITS.dialogueContent` 与它共用同一个值）。
   * 两边不一致会出最难查的一种坏会话：模型回了一篇长文，存下来了，
   * 下一轮它作为历史被重放，转发函数拒收 → 那段对话从此永远发不出去。
   */
  content: 8_000,
  /**
   * 整个请求体的上限，单位是**字符数**而不是字节。
   *
   * 名字里带 Bytes 会让人以为要按 UTF-8 折算，而中文一个字三字节，
   * 按那个理解设出来的数字会小三倍。比较的对象是 `request.text()` 的长度。
   */
  requestChars: 96_000
})

/** 合法的消息角色。只认 OpenAI 协议里的这三个。 */
export const AI_ROLES = Object.freeze(['system', 'user', 'assistant'])

/**
 * 转发函数可能返回的错误码，以及它们各自的文案键。
 *
 * 写成 `{ code, key }` 的数组而不是「码 → 键」的对象，是因为
 * `domain/errors.test.js` 按 `key` 字段后跟一个 `errors.` 开头的字符串字面量
 * 来收集「源码里声明了哪些键」，再反查语言包里有没有多余的键（死键）。
 * 写成值的形式两边都会漏过去：缺翻译时界面静默退回中文，而测试全绿——
 * 这条坑在 CONTRIBUTING 里记过一次，这里是第二个踩到的地方。
 *
 * 最后一条是兜底：函数那边加了新错误码而我忘了在这里登记时，用户看到的是
 * 「AI 请求失败」+ 上游原话，而不是一个裸键名。
 */
export const AI_ERROR_KEYS = Object.freeze([
  // 由 api 层判定、还没发起请求就抛出的那一个
  { code: 'not_configured', key: 'errors.aiNotConfigured' },
  { code: 'origin_not_allowed', key: 'errors.aiOrigin' },
  { code: 'unknown_provider', key: 'errors.aiProvider' },
  { code: 'missing_key', key: 'errors.aiMissingKey' },
  { code: 'missing_model', key: 'errors.aiMissingModel' },
  { code: 'bad_request', key: 'errors.aiBadRequest' },
  { code: 'bad_messages', key: 'errors.aiBadRequest' },
  { code: 'too_large', key: 'errors.aiTooLarge' },
  { code: 'upstream_auth', key: 'errors.aiAuth' },
  { code: 'upstream_rate_limit', key: 'errors.aiRateLimit' },
  { code: 'upstream_timeout', key: 'errors.aiTimeout' },
  { code: 'upstream_error', key: 'errors.aiUpstream' },
  { code: 'network_error', key: 'errors.aiNetwork' },
  { code: 'bad_response', key: 'errors.aiBadResponse' },
  { code: 'unknown', key: 'errors.aiUnknown' }
])

const ERROR_KEY_BY_CODE = new Map(AI_ERROR_KEYS.map((item) => [item.code, item.key]))

/** 按错误码取文案键；不认识的码回落到 `unknown` 那一条。 */
export function errorKeyOf(code) {
  return ERROR_KEY_BY_CODE.get(code) ?? ERROR_KEY_BY_CODE.get('unknown')
}

/** 按 id 取供应商，不认识就返回 null。 */
export function providerById(id) {
  if (typeof id !== 'string') return null
  return AI_PROVIDERS.find((item) => item.id === id) ?? null
}

/** 这个代号是不是内置的供应商。 */
export function isKnownProvider(id) {
  return providerById(id) !== null
}

/**
 * 构造一份 AI 配置（不做「必填」校验，允许存半成品——用户可能先选供应商再慢慢填 Key）。
 *
 * @param {object} input
 * @param {string} [input.provider] - 供应商代号
 * @param {string} [input.model] - 模型名
 * @param {string} [input.apiKey] - 用户自己的 API Key
 * @param {Date} [now]
 * @returns {{provider: string, model: string, apiKey: string, updatedAt: string}}
 */
export function buildAiConfig(input = {}, now = new Date()) {
  return {
    provider: isKnownProvider(input.provider) ? input.provider : '',
    model: typeof input.model === 'string' ? input.model.trim().slice(0, AI_LIMITS.model) : '',
    apiKey: typeof input.apiKey === 'string' ? input.apiKey.trim().slice(0, AI_LIMITS.apiKey) : '',
    updatedAt: nowDateTimeString(now)
  }
}

/**
 * 配置是否齐全到可以发起对话。
 *
 * 三样缺一不可：认得的供应商、模型名、Key。
 * 页面据此决定「去配置」按钮还是「发送」按钮可用。
 */
export function isConfigured(config) {
  if (!config || typeof config !== 'object') return false
  return isKnownProvider(config.provider)
    && typeof config.model === 'string' && config.model.trim() !== ''
    && typeof config.apiKey === 'string' && config.apiKey.trim() !== ''
}

/**
 * Key 的展示形式：`sk-1…cdef`。
 *
 * 设置页只拿它显示「已配置」，**不把完整 Key 渲染到页面上**——
 * 截图、录屏、共享屏幕时不会连密钥一起送出去。
 */
export function maskApiKey(apiKey) {
  if (typeof apiKey !== 'string' || apiKey === '') return ''
  if (apiKey.length <= 8) return '…'
  return `${apiKey.slice(0, 4)}…${apiKey.slice(-4)}`
}

/**
 * 校验一份「要发给上游」的 messages 数组。
 *
 * 放在领域层是为了**两侧共用**：函数在服务端拒收超限请求，
 * 而单测能直接调它，不必真的起一个 Worker。
 *
 * @param {unknown} messages
 * @returns {{ok: true, messages: Array}|{ok: false, reason: string}}
 */
export function checkMessages(messages) {
  if (!Array.isArray(messages) || messages.length === 0) {
    return { ok: false, reason: 'messages 必须是非空数组' }
  }
  if (messages.length > AI_LIMITS.messages) {
    return { ok: false, reason: `messages 条数不能超过 ${AI_LIMITS.messages}` }
  }

  const cleaned = []
  for (const item of messages) {
    if (!item || typeof item !== 'object') {
      return { ok: false, reason: 'messages 的每一项都必须是对象' }
    }
    if (!AI_ROLES.includes(item.role)) {
      return { ok: false, reason: `role 只能是 ${AI_ROLES.join(' / ')}` }
    }
    if (typeof item.content !== 'string' || item.content.trim() === '') {
      return { ok: false, reason: 'content 必须是非空字符串' }
    }
    if (item.content.length > AI_LIMITS.content) {
      return { ok: false, reason: `单条 content 不能超过 ${AI_LIMITS.content} 字` }
    }
    cleaned.push({ role: item.role, content: item.content })
  }

  return { ok: true, messages: cleaned }
}

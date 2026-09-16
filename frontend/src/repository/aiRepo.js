/**
 * AI 配置仓储（供应商、模型、用户自己的 API Key）。
 *
 * 单独一个键、单独一个模块，是因为它**不属于用户数据**：
 * 它不进备份（备份文件会被拷来拷去，把密钥写进去是个陷阱），
 * 也不参与任何统计。理由详见 `storage/keys.js` 里 `KEY.aiConfig` 的说明。
 */
import { read, write, remove, KEY } from '../storage/index.js'
import { withWriteLock } from '../storage/lock.js'
import { buildAiConfig } from '../domain/ai.js'

/**
 * 读取 AI 配置。没配过时返回 null。
 * @returns {Promise<object|null>}
 */
export async function loadConfig() {
  const config = await read(KEY.aiConfig, null)
  return config && typeof config === 'object' ? config : null
}

/**
 * 把「表单里填的」与「已保存的」合成一份配置：**留空的项沿用已保存的值**。
 *
 * 这条规则是照旧版的语义来的，也是设置页能用的前提：Key 存进去之后
 * **不会回填到输入框**（页面只显示 `sk-1…cdef` 这样的掩码），
 * 于是用户改完供应商点保存时，Key 那一栏本来就是空的——
 * 不沿用的话会把已经存好的 Key 抹掉。
 *
 * 放在仓储层而不是页面里，是因为「测试连接」也要用它：
 * 用户填完新 Key 想先测通再保存，测的必须是**合成后**的那份配置。
 *
 * @param {{provider?: string, model?: string, apiKey?: string}} [input]
 * @returns {Promise<object>} 合成后的配置（不落盘）
 */
export async function resolveConfig(input = {}) {
  const saved = await loadConfig()
  const pick = (value, fallback) => (
    typeof value === 'string' && value.trim() !== '' ? value.trim() : fallback
  )

  return buildAiConfig({
    provider: pick(input.provider, saved?.provider ?? ''),
    model: pick(input.model, saved?.model ?? ''),
    apiKey: pick(input.apiKey, saved?.apiKey ?? '')
  })
}

/**
 * 保存 AI 配置（整份覆盖，留空的字段沿用已保存的值）。
 *
 * 允许存半成品：用户可能先选供应商、过一会儿才去申请 Key。
 * 「够不够发起对话」由 `domain/ai.js` 的 `isConfigured` 判断，不在这里卡。
 *
 * @param {{provider?: string, model?: string, apiKey?: string}} [input]
 * @returns {Promise<object>} 保存后的配置
 */
export async function saveConfig(input = {}) {
  return withWriteLock(async () => {
    const config = await resolveConfig(input)
    await write(KEY.aiConfig, config)
    return config
  })
}

/**
 * 清空 AI 配置（连同 Key 一起）。
 * @returns {Promise<void>}
 */
export async function clearConfig() {
  return withWriteLock(async () => {
    await remove(KEY.aiConfig)
  })
}

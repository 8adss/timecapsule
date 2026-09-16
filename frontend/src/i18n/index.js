/**
 * 界面语言的初始化与切换。
 *
 * 三条约定：
 *
 * 1. **`fallbackLocale` 指向中文。** 这不是随手设的——它决定了翻译没跟上时
 *    会发生什么。vue-i18n 默认会把缺失的键**原样显示**（界面上出现
 *    `settings.backupTitle` 这种东西）；设了 fallback 之后，缺失的键会回退到
 *    中文。于是新增页面时可以先只写中文，英文慢慢补，界面不会破相。
 *
 * 2. **语言选择记在 localStorage。** 注意它和用户数据是两回事：数据在
 *    IndexedDB 里、会随导出备份一起走；语言偏好属于「这台设备的习惯」，
 *    不进备份，也不该进。换了浏览器就重新选一次，这是可以接受的。
 *
 * 3. **首次访问跟随浏览器语言。** 中文环境给中文，其余一律英文——
 *    与其猜一个用户可能看不懂的语言，不如用国际通用语。
 */
import { createI18n } from 'vue-i18n'
import zhCN from '../locales/zh-CN.json'
import enUS from '../locales/en-US.json'

/** 可选语言。新增语言只需在这里加一行，再到 locales/ 下补一个同名文件。 */
export const SUPPORTED_LOCALES = Object.freeze([
  { value: 'zh-CN', label: '简体中文' },
  { value: 'en-US', label: 'English' }
])

const STORAGE_KEY = 'timecapsule.locale'
const DEFAULT_LOCALE = 'zh-CN'

/** localStorage 在无痕模式或站点数据被禁用时可能直接抛错，读写都要兜住。 */
function safeRead(key) {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage.getItem(key)
  } catch {
    return null
  }
}

function safeWrite(key, value) {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(key, value)
    }
  } catch {
    // 存不下就算了，本次会话内仍然生效
  }
}

/** 决定首次打开时用哪种语言。 */
function detectLocale() {
  const saved = safeRead(STORAGE_KEY)
  if (saved !== null && SUPPORTED_LOCALES.some((item) => item.value === saved)) {
    return saved
  }

  const preferred = typeof navigator === 'undefined' ? '' : (navigator.language || '')
  if (preferred.toLowerCase().startsWith('zh')) {
    return 'zh-CN'
  }
  return preferred === '' ? DEFAULT_LOCALE : 'en-US'
}

export const i18n = createI18n({
  // Composition API 模式：模板里用 $t，脚本里用 useI18n()
  legacy: false,
  globalInjection: true,
  locale: detectLocale(),
  fallbackLocale: DEFAULT_LOCALE,
  messages: {
    'zh-CN': zhCN,
    'en-US': enUS
  }
})

/**
 * 切换界面语言并记住选择。
 * @param {string} value - 语言标识，取值见 SUPPORTED_LOCALES
 */
export function setLocale(value) {
  if (!SUPPORTED_LOCALES.some((item) => item.value === value)) {
    return
  }
  i18n.global.locale.value = value
  safeWrite(STORAGE_KEY, value)

  // 同步 <html lang>：屏幕阅读器与浏览器翻译提示都读它
  if (typeof document !== 'undefined') {
    document.documentElement.lang = value
  }
}

/** 当前语言。 */
export function getLocale() {
  return i18n.global.locale.value
}

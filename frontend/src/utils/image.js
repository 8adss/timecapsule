/**
 * 头像图片处理。
 *
 * 后端版本把文件存到磁盘、数据库里只放一个 URL。本地化之后没有磁盘，
 * 头像必须以 dataURL 形式存进 IndexedDB，于是出现两个新问题：
 *
 * 1. **体积** —— 手机拍的照片动辄 3~5MB，base64 编码后还要再涨约 1/3。
 *    几条这样的记录就足以让「导出备份」变成一个几十兆的文件。
 *    所以超过阈值时必须**先压缩再存**，而不是原样塞进去。
 * 2. **类型** —— 只接受确定的图片 MIME 白名单。dataURL 会被直接塞进
 *    `<img src>`，允许 `image/svg+xml` 就等于允许内联脚本，那是一个 XSS 入口。
 *    这一条是安全约束，不是体验优化，不要放宽。
 */

/** 允许的头像类型。**刻意排除 SVG** —— SVG 可以内嵌脚本，作为 dataURL 渲染等于 XSS。 */
export const ALLOWED_AVATAR_TYPES = Object.freeze([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif'
])

/** 头像落库前的大小上限（字节）。超过则压缩。 */
export const MAX_AVATAR_BYTES = 512 * 1024

/** 压缩后的最长边像素。头像显示尺寸很小，512 足够清晰。 */
const MAX_EDGE = 512

/** 压缩输出的首选格式与质量。webp 体积明显优于 jpeg，浏览器支持已无悬念。 */
const COMPRESS_TYPE = 'image/webp'
const COMPRESS_QUALITY = 0.85

/** 该 MIME 是否允许作为头像。 */
export function isAllowedAvatarType(type) {
  return ALLOWED_AVATAR_TYPES.includes(type)
}

/**
 * 估算 dataURL 解码后的字节数。
 * base64 每 4 个字符表示 3 字节，再减去 `data:...;base64,` 头部。
 *
 * @param {string} dataUrl
 * @returns {number} 估算字节数
 */
export function estimateDataUrlBytes(dataUrl) {
  if (typeof dataUrl !== 'string') return 0
  const commaAt = dataUrl.indexOf(',')
  if (commaAt === -1) return 0
  const payload = dataUrl.length - commaAt - 1
  return Math.floor((payload * 3) / 4)
}

/**
 * 把 File 读成 dataURL。
 * @param {File|Blob} file
 * @returns {Promise<string>}
 */
export function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error('读取图片失败，请重试'))
    reader.readAsDataURL(file)
  })
}

/**
 * 把 dataURL 缩放并重新编码。
 *
 * 返回的可能是原图：当浏览器不支持 canvas 导出 webp 时，`toDataURL` 会
 * 静默回落到 png，此时体积可能反而变大。调用方需要比较后再决定用哪个。
 *
 * @param {string} dataUrl - 原图
 * @param {{ maxEdge?: number, type?: string, quality?: number }} [options]
 * @returns {Promise<string>} 压缩后的 dataURL
 */
export function compressImage(dataUrl, options = {}) {
  const { maxEdge = MAX_EDGE, type = COMPRESS_TYPE, quality = COMPRESS_QUALITY } = options

  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => {
      try {
        const scale = Math.min(1, maxEdge / Math.max(image.width, image.height))
        const width = Math.max(1, Math.round(image.width * scale))
        const height = Math.max(1, Math.round(image.height * scale))

        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height

        const context = canvas.getContext('2d')
        if (context === null) {
          reject(new Error('当前浏览器不支持图片压缩'))
          return
        }
        // 缩放后补白底：png 透明区域转成 jpeg 会变黑，webp 支持透明但补白更稳
        context.fillStyle = '#ffffff'
        context.fillRect(0, 0, width, height)
        context.drawImage(image, 0, 0, width, height)

        resolve(canvas.toDataURL(type, quality))
      } catch (error) {
        reject(error instanceof Error ? error : new Error('图片压缩失败'))
      }
    }
    image.onerror = () => reject(new Error('图片解析失败，请换一张'))
    image.src = dataUrl
  })
}

/**
 * 把用户选的头像文件处理成可落库的 dataURL。
 *
 * 流程：校验类型 → 读成 dataURL → 超限则压缩 → 仍然超限则继续降质量 → 返回。
 *
 * @param {File} file - 用户选择的文件
 * @returns {Promise<string>} dataURL
 * @throws {Error} 类型不允许、读取失败，或压缩后仍然过大
 */
export async function prepareAvatar(file) {
  if (!file) {
    throw new Error('请选择要上传的图片')
  }
  if (!isAllowedAvatarType(file.type)) {
    throw new Error('只支持 JPG / PNG / WebP / GIF 格式的图片')
  }

  const original = await fileToDataUrl(file)
  if (estimateDataUrlBytes(original) <= MAX_AVATAR_BYTES) {
    return original
  }

  // 逐步降低质量与尺寸，直到落进上限。最多试四轮，避免极端图片把页面卡住。
  const attempts = [
    { maxEdge: MAX_EDGE, quality: COMPRESS_QUALITY },
    { maxEdge: 384, quality: 0.8 },
    { maxEdge: 256, quality: 0.75 },
    { maxEdge: 192, quality: 0.7 }
  ]

  let smallest = original
  for (const attempt of attempts) {
    const compressed = await compressImage(original, attempt)
    if (estimateDataUrlBytes(compressed) < estimateDataUrlBytes(smallest)) {
      smallest = compressed
    }
    if (estimateDataUrlBytes(compressed) <= MAX_AVATAR_BYTES) {
      return compressed
    }
  }

  if (estimateDataUrlBytes(smallest) > MAX_AVATAR_BYTES) {
    throw new Error('图片过大且压缩后仍超出限制，请换一张更小的图片')
  }
  return smallest
}

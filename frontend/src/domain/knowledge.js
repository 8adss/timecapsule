/**
 * 知识库领域逻辑。
 *
 * 知识库存的是「你写过的文字」——自我介绍、日记、读书笔记这类个人资料，
 * 用途是将来给「我的分身」当蒸馏原料。所以这一层是**纯粹的文档管理**，
 * 一行 AI 代码都没有：蒸馏属于 PersonaView 那一期，不在本模块。
 *
 * 三处刻意的取舍，都不是随手写的：
 *
 * 1. **字数与摘要不落盘，读的时候算。** 它们是 `content` 的纯函数，
 *    存下来就等于多了一份可能与之不符的副本——导入一份手改过的备份时最明显：
 *    正文 100 字、`charCount` 却写着 5000，列表该显示哪个？
 *    正文是唯一真相，其余都是派生值。
 *
 * 2. **删除是逻辑删除**（`deleted: 1`），与 tasks / capsules 一致。
 *    更要紧的是备份合并按 id 去重：物理删除的文档会在导入一份较旧的备份时
 *    「复活」；带墓碑的记录不会——它的 `updatedAt` 更新，合并时按较新者胜出。
 *
 * 3. **正文不做 trim，原样存。** 用户贴进来的排版（段首空行、结尾换行）保留，
 *    只在判断「填没填」时按 trim 后是否为空来看。
 */
import { DomainError, requireMaxLength, requireText } from './errors.js'
import { newId } from './id.js'
import { compareDateTime, nowDateTimeString } from './time.js'

/** 文档来源。与旧版一致：只有「读文件」与「粘贴」两种。 */
export const SOURCE_TYPE = Object.freeze({
  FILE: 'FILE',
  PASTE: 'PASTE'
})

/**
 * 字段上限。与 domain/backup.js 的校验共用同一份数字——
 * 两边各写一遍迟早会漂移，届时会出现「界面能存进去、备份导不回来」。
 */
export const KNOWLEDGE_LIMITS = Object.freeze({
  /** 标题。旧版输入框的上限就是 200 */
  title: 200,
  /** 正文。旧版 textarea 的 maxlength 是 200000 */
  content: 200_000,
  /** 列表里那列摘要的字符数 */
  preview: 120
})

/** 列表排序方式。 */
export const SORT_BY = Object.freeze({
  CREATED: 'createdAt',
  CHARS: 'charCount',
  TITLE: 'title'
})

/**
 * 字数。
 *
 * 直接用 `String.length`，与旧版后端（`content.length()`）口径一致：
 * 它数的是 UTF-16 码元，所以 emoji 算 2 个字。不搞「去掉空白再数」
 * 之类的花活——用户对「字数」的预期就是字面长度，改口径反而更难解释。
 *
 * @param {unknown} content
 * @returns {number}
 */
export function countChars(content) {
  return typeof content === 'string' ? content.length : 0
}

/**
 * 生成列表里显示的摘要。
 *
 * 先把连续空白折成一个空格再截断：正文里的换行直接塞进表格单元格会撑成多行，
 * 而 `<el-table>` 的 `show-overflow-tooltip` 只对单行生效。
 *
 * 只在前一小段上做折叠，不在全文上 `replace(/\s+/g, ' ')`——那是 O(全文)，
 * 而摘要只需要开头那点字。留 4 倍余量，用来兜住「开头一大段全是空白」的情况。
 *
 * @param {unknown} content
 * @returns {string}
 */
export function buildPreview(content) {
  if (typeof content !== 'string' || content === '') return ''
  const { preview: max } = KNOWLEDGE_LIMITS

  let head = content.slice(0, max * 4).replace(/\s+/g, ' ').trim()
  if (head === '') {
    // 极端情况：开头 max*4 个字符全是空白。退回全文折叠，否则摘要会是空的。
    head = content.replace(/\s+/g, ' ').trim()
  }
  return head.length <= max ? head : `${head.slice(0, max)}…`
}

/**
 * 构造一篇新文档。
 *
 * @param {object} input
 * @param {string} input.title - 标题，必填
 * @param {string} input.content - 正文，必填
 * @param {'FILE'|'PASTE'} [input.sourceType] - 来源，缺省按粘贴算
 * @param {string} [input.originName] - 导入时的原文件名
 * @param {Date} [now] - 参考时刻，测试用
 * @returns {object} 新文档实体
 */
export function buildDoc(input, now = new Date()) {
  const timestamp = nowDateTimeString(now)
  const title = requireText(input.title, '请填写标题', { key: 'errors.knowledgeTitleRequired' })
  requireMaxLength(title, KNOWLEDGE_LIMITS.title, `标题超过 ${KNOWLEDGE_LIMITS.title} 字上限`, {
    key: 'errors.knowledgeTitleTooLong'
  })

  if (typeof input.content !== 'string' || input.content.trim() === '') {
    throw new DomainError('正文不能为空', { key: 'errors.knowledgeContentRequired' })
  }
  requireMaxLength(input.content, KNOWLEDGE_LIMITS.content, `正文超过 ${KNOWLEDGE_LIMITS.content} 字上限`, {
    key: 'errors.knowledgeContentTooLong'
  })

  return {
    id: newId(),
    title,
    content: input.content,
    sourceType: input.sourceType === SOURCE_TYPE.FILE ? SOURCE_TYPE.FILE : SOURCE_TYPE.PASTE,
    originName: typeof input.originName === 'string' && input.originName.trim() !== ''
      ? input.originName.trim()
      : null,
    deleted: 0,
    createdAt: timestamp,
    updatedAt: timestamp
  }
}

/**
 * 把允许修改的字段应用到文档上，返回新对象。
 *
 * 两个字段的「传空」语义**刻意不同**：
 *
 * - `title` 传空字符串 = 没填，保持原值（与 `applyTaskPatch` 一致）；
 * - `content` 传空 = 报错。任务描述可以清空，一篇没有正文的文档却没有意义；
 *   更糟的是若悄悄保留旧正文，用户会以为「已经删干净了」，下次打开又整段冒出来。
 *
 * 只有这两个字段可改：`sourceType` / `originName` 记录的是「当时怎么进来的」，
 * 事后编辑正文不该把它们改写成另一个来源。
 *
 * @param {object} doc - 原文档
 * @param {{ title?: string, content?: string }} patch - 变更内容
 * @param {Date} [now] - 参考时刻，测试用
 * @returns {object} 变更后的新文档
 * @throws {DomainError} 正文被清空时
 */
export function applyDocPatch(doc, patch, now = new Date()) {
  const next = { ...doc }

  if ('title' in patch) {
    const title = patch.title
    if (typeof title === 'string' && title.trim() !== '') {
      requireMaxLength(title.trim(), KNOWLEDGE_LIMITS.title, `标题超过 ${KNOWLEDGE_LIMITS.title} 字上限`, {
        key: 'errors.knowledgeTitleTooLong'
      })
      next.title = title.trim()
    }
  }

  if ('content' in patch) {
    const content = patch.content
    if (typeof content !== 'string' || content.trim() === '') {
      throw new DomainError('正文不能为空', { key: 'errors.knowledgeContentRequired' })
    }
    requireMaxLength(content, KNOWLEDGE_LIMITS.content, `正文超过 ${KNOWLEDGE_LIMITS.content} 字上限`, {
      key: 'errors.knowledgeContentTooLong'
    })
    next.content = content
  }

  next.updatedAt = nowDateTimeString(now)
  return next
}

/**
 * 可见文档（排除逻辑删除）。
 * @param {Array} docs
 * @returns {Array}
 */
export function visibleDocs(docs) {
  return docs.filter((doc) => doc.deleted !== 1)
}

/**
 * 按关键词过滤：标题或正文命中即可。
 *
 * 大小写不敏感（对英文资料有用，中文不受影响）。关键词两端空白会被忽略，
 * 空关键词返回全部——这样调用方不必先判断「用户到底输了没有」。
 *
 * @param {Array} docs
 * @param {string} [keyword]
 * @returns {Array} 新数组
 */
export function filterDocs(docs, keyword) {
  const needle = typeof keyword === 'string' ? keyword.trim().toLowerCase() : ''
  if (needle === '') return [...docs]

  return docs.filter((doc) => String(doc.title ?? '').toLowerCase().includes(needle)
    || String(doc.content ?? '').toLowerCase().includes(needle))
}

/**
 * 排序。三种方式都带**次级排序**，避免同分时顺序随实现漂移：
 *
 * - `createdAt`：最近导入的在前
 * - `charCount`：字数多的在前，同字数按导入时间倒序
 * - `title`：按拼音（`zh-Hans-CN` 排序规则），同名再按导入时间倒序
 *
 * @param {Array} docs
 * @param {'createdAt'|'charCount'|'title'} [sortBy]
 * @returns {Array} 新数组
 */
export function sortDocs(docs, sortBy = SORT_BY.CREATED) {
  const list = [...docs]

  if (sortBy === SORT_BY.CHARS) {
    return list.sort((left, right) => countChars(right.content) - countChars(left.content)
      || compareDateTime(right.createdAt, left.createdAt))
  }

  if (sortBy === SORT_BY.TITLE) {
    return list.sort((left, right) => String(left.title ?? '').localeCompare(String(right.title ?? ''), 'zh-Hans-CN')
      || compareDateTime(right.createdAt, left.createdAt))
  }

  return list.sort((left, right) => compareDateTime(right.createdAt, left.createdAt))
}

/**
 * 页面的一站式查询：排除已删除 → 过滤 → 排序。
 *
 * @param {Array} docs - 存储里的全部文档（含已删除）
 * @param {{ keyword?: string, sortBy?: string }} [options]
 * @returns {Array} 可直接渲染的列表
 */
export function queryDocs(docs, options = {}) {
  return sortDocs(filterDocs(visibleDocs(docs), options.keyword), options.sortBy)
}

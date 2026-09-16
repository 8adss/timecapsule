/**
 * 「我的分身」领域逻辑。
 *
 * 分身 = **名称 + 代表哪个时间点 + 引用知识库里的哪几篇材料 + 画像 + 说话风格**。
 * 它与时间胶囊是一对：胶囊代表「写下那句话时的我」，分身代表「何时的我」。
 *
 * ## 这一期不接大模型
 *
 * 画像与说话风格由用户**手写**。所以 `status` 恒为 `READY`，
 * `failReason` / `model` 恒为 `null`——这三个字段是**为下一步预留**的：
 * 接上大模型之后，创建分身会走 `GENERATING → READY / FAILED` 这条状态机，
 * 届时数据结构不用动、不用做迁移，界面上那两条分支也现成。
 *
 * ## 三处刻意的取舍
 *
 * 1. **`docCount` 不落盘**，由 `docIds.length` 派生。与知识库的字数、摘要同理：
 *    存下来就多一份可能与事实不符的副本——用户删掉一篇材料之后，那个数字还在。
 * 2. **至少引用一篇材料**才能建分身。这不是形式要求：一个不引用任何材料的
 *    「分身」没有来源，写出来的画像和任何人都没有关系，只会让这个概念变廉价。
 * 3. **长度上限在写入侧就拦住**。界面的 `maxlength` 只挡得住手输，
 *    挡不住别处直接赋值；超限的值一旦落盘，导出备份正常、再导入回来却会被
 *    备份校验拒收——「存得进去、导不回来」是最难查的一类问题。
 */
import { DomainError, requireMaxLength, requireText } from './errors.js'
import { newId } from './id.js'
import { compareDateTime, nowDateTimeString } from './time.js'

/**
 * 分身状态。
 *
 * **本期只会产生 `READY`**：画像是手写的，没有「生成中」这回事。
 * 另外三个取值留给「接上大模型」那一步，现在写在这里是为了让备份校验
 * 与界面分支不用等到那时候再改。
 */
export const PERSONA_STATUS = Object.freeze({
  DRAFT: 'DRAFT',
  GENERATING: 'GENERATING',
  READY: 'READY',
  FAILED: 'FAILED'
})

/**
 * 字段上限。与 `domain/backup.js` 的校验共用同一份数字——
 * 两边各写一遍迟早漂移，届时会出现「界面能存进去、备份导不回来」。
 */
export const PERSONA_LIMITS = Object.freeze({
  name: 100,
  summary: 2_000,
  stylePrompt: 2_000,
  /** 一个分身最多引用多少篇材料 */
  docIds: 100,
  failReason: 500,
  model: 100
})

/** 代表时间点的格式 `yyyy-MM-dd`，与后端的 LocalDate 一致。 */
const SELF_DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/**
 * 允许被修改的字段。
 * `id` / `status` / `failReason` / `model` / 时间戳都不在其中——
 * 前四个是生成过程的产物，不该由编辑表单改写。
 */
const PATCHABLE_FIELDS = Object.freeze(['name', 'selfDate', 'docIds', 'summary', 'stylePrompt'])

/**
 * 校验并规范化引用的材料 id。
 *
 * 去重是必要的：同一篇材料选两次没有意义，却在计数与备份校验里会变成两条。
 */
function requireDocIds(value) {
  const list = Array.isArray(value) ? value.filter((id) => typeof id === 'string' && id !== '') : []
  const unique = [...new Set(list)]

  if (unique.length === 0) {
    throw new DomainError('至少要选一篇材料', { key: 'errors.personaDocsRequired' })
  }
  if (unique.length > PERSONA_LIMITS.docIds) {
    throw new DomainError(`引用的材料不能超过 ${PERSONA_LIMITS.docIds} 篇`, {
      key: 'errors.personaDocsTooMany',
      params: { max: PERSONA_LIMITS.docIds }
    })
  }
  return unique
}

/** 校验代表时间点。 */
function requireSelfDate(value) {
  if (typeof value !== 'string' || !SELF_DATE_RE.test(value)) {
    throw new DomainError('请选择代表的时间点', { key: 'errors.personaSelfDateRequired' })
  }
  return value
}

/**
 * 画像与说话风格这一期是手写的，允许留空（卡片上会给占位提示），
 * 只校验非字符串与超长两种情况。
 *
 * 语言键**必须以 `{ key: '...' }` 的形式传进来**，不能写成位置参数：
 * `domain/errors.test.js` 靠扫 `key: '...'` 字面量来保证「源码里声明的键
 * 在两份语言包里都有翻译」，同时反查「语言包里没有死键」。
 * 写成位置参数两边都会漏过去——缺翻译时界面会静默退回中文，而测试全绿。
 */
function optionalText(value, max, message, options) {
  if (value === null || value === undefined) return ''
  if (typeof value !== 'string') return ''
  requireMaxLength(value, max, message, options)
  return value.trim()
}

/**
 * 校验分身名称：必填，且不超上限。
 *
 * 上限这件事必须在这里管，不能只靠表单的 `maxlength`——`buildPersona` /
 * `applyPersonaPatch` 是这一层的入口，将来接上大模型后会有程序化的写入路径，
 * 而备份校验器按 `PERSONA_LIMITS.name` 拒收超限的文件：一旦超限值落盘，
 * 用户导出的备份**再也导不回来**（存得进去、导不回来）。
 */
function requireName(value) {
  const name = requireText(value, '请填写分身名称', { key: 'errors.personaNameRequired' })
  requireMaxLength(name, PERSONA_LIMITS.name, `分身名称超过 ${PERSONA_LIMITS.name} 字上限`, {
    key: 'errors.personaNameTooLong'
  })
  return name
}

/**
 * 构造一个新的分身。
 *
 * @param {object} input
 * @param {string} input.name - 分身名称，必填
 * @param {string} input.selfDate - 代表的时间点 `yyyy-MM-dd`，必填
 * @param {string[]} input.docIds - 引用的知识库文档 id，至少一篇
 * @param {string} [input.summary] - 画像，可留空
 * @param {string} [input.stylePrompt] - 说话风格，可留空
 * @param {Date} [now] - 参考时刻，测试用
 * @returns {object} 新分身实体
 */
export function buildPersona(input, now = new Date()) {
  const timestamp = nowDateTimeString(now)

  return {
    id: newId(),
    name: requireName(input.name),
    selfDate: requireSelfDate(input.selfDate),
    docIds: requireDocIds(input.docIds),
    summary: optionalText(
      input.summary,
      PERSONA_LIMITS.summary,
      `画像超过 ${PERSONA_LIMITS.summary} 字上限`,
      { key: 'errors.personaSummaryTooLong' }
    ),
    stylePrompt: optionalText(
      input.stylePrompt,
      PERSONA_LIMITS.stylePrompt,
      `说话风格超过 ${PERSONA_LIMITS.stylePrompt} 字上限`,
      { key: 'errors.personaStyleTooLong' }
    ),
    // 本期没有生成过程，建出来就是「已就绪」
    status: PERSONA_STATUS.READY,
    failReason: null,
    model: null,
    deleted: 0,
    createdAt: timestamp,
    updatedAt: timestamp
  }
}

/**
 * 把允许修改的字段应用到分身上，返回新对象。
 *
 * 「传空」的语义分两类，与知识库那边保持一致：
 *
 * - `name` 传空字符串 = **没填**，保持原值（与任务名称、文档标题同理）；
 * - `selfDate` / `docIds` 传空 = **报错**。一个没有代表时间点、或没有任何材料来源的
 *   分身不成立，与「文档不能没有正文」是同一条理由。edit 表单里这两个字段
 *   用户都看得见，清空后保存却悄悄保留旧值，才是更意外的行为。
 *
 * `summary` / `stylePrompt` 可以直接清空——它们允许留空。
 *
 * @param {object} persona - 原分身
 * @param {object} patch - 变更内容
 * @param {Date} [now] - 参考时刻，测试用
 * @returns {object} 变更后的新分身
 * @throws {DomainError} 时间点或材料被清空、或文本超长时
 */
export function applyPersonaPatch(persona, patch, now = new Date()) {
  const next = { ...persona }

  for (const field of PATCHABLE_FIELDS) {
    if (!(field in patch)) continue

    if (field === 'name') {
      const name = patch.name
      // 空字符串 = 没填，保持原值（与任务名称、文档标题同理）；
      // 非空则走与新建完全相同的校验，上限也不例外
      if (typeof name === 'string' && name.trim() !== '') {
        next.name = requireName(name)
      }
      continue
    }

    if (field === 'selfDate') {
      next.selfDate = requireSelfDate(patch.selfDate)
      continue
    }

    if (field === 'docIds') {
      next.docIds = requireDocIds(patch.docIds)
      continue
    }

    if (field === 'summary') {
      next.summary = optionalText(
        patch.summary,
        PERSONA_LIMITS.summary,
        `画像超过 ${PERSONA_LIMITS.summary} 字上限`,
        { key: 'errors.personaSummaryTooLong' }
      )
      continue
    }

    next.stylePrompt = optionalText(
      patch.stylePrompt,
      PERSONA_LIMITS.stylePrompt,
      `说话风格超过 ${PERSONA_LIMITS.stylePrompt} 字上限`,
      { key: 'errors.personaStyleTooLong' }
    )
  }

  next.updatedAt = nowDateTimeString(now)
  return next
}

/**
 * 可见分身（排除逻辑删除）。
 * @param {Array} personas
 * @returns {Array}
 */
export function visiblePersonas(personas) {
  return personas.filter((persona) => persona.deleted !== 1)
}

/**
 * 排序：代表的时间点越近的排越前，同一时间点按创建时间倒序。
 *
 * 用 `selfDate` 而不是 `createdAt` 做主序：用户关心的是「这个分身代表什么时候的我」，
 * 而「何时的我」之间天然有时间远近。次级排序是为了让顺序稳定、不随实现漂移。
 *
 * @param {Array} personas
 * @returns {Array} 新数组
 */
export function sortPersonas(personas) {
  return [...personas].sort((left, right) => compareDateTime(right.selfDate, left.selfDate)
    || compareDateTime(right.createdAt, left.createdAt))
}

/**
 * 把 `docIds` 解析成真正的文档，供详情页展示。
 *
 * 找不到的（材料已被删除）**保留位置并标记 `missing`**，而不是悄悄滤掉：
 * 用户需要看到「这个分身原本引用了 3 篇，其中 1 篇已经不在了」，
 * 否则会以为分身本来就只有 2 篇来源。
 *
 * @param {object} persona
 * @param {Array} docs - 当前可见的知识库文档
 * @returns {Array<{ id: string, doc: object|null, missing: boolean }>}
 */
export function resolveMaterials(persona, docs) {
  const byId = new Map((docs ?? []).map((doc) => [doc.id, doc]))

  return (persona?.docIds ?? []).map((id) => {
    const doc = byId.get(id)
    return { id, doc: doc ?? null, missing: doc === undefined }
  })
}

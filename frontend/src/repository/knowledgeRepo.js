/**
 * 知识库仓储 —— 「一次业务操作」的边界，负责持有写锁并落盘。
 *
 * 与 `taskRepo` 相比这里简单得多：知识库只有一份集合，不存在
 * 「改了 A 还必须一起改 B」的场景，所以用不到 `writeMany`，
 * 每次操作只写 `KEY.knowledge` 一个键。
 *
 * 判定规则一律下沉到 `domain/knowledge.js`，本层只负责「读 → 交给领域层 → 写回」。
 */
import { read, write, KEY } from '../storage/index.js'
import { withWriteLock } from '../storage/lock.js'
import { DomainError } from '../domain/errors.js'
import { nowDateTimeString } from '../domain/time.js'
import { applyDocPatch, buildDoc, sortDocs, visibleDocs } from '../domain/knowledge.js'

/**
 * 读取全部文档（含逻辑删除的记录）。
 * @returns {Promise<Array>}
 */
export async function loadDocs() {
  const list = await read(KEY.knowledge, [])
  return Array.isArray(list) ? list : []
}

/**
 * 写回全部文档。
 * @param {Array} list
 * @returns {Promise<void>}
 */
export async function saveDocs(list) {
  await write(KEY.knowledge, list)
}

/** 在列表里找一篇未删除的文档，找不到就抛 404。 */
function findOrThrow(docs, id) {
  const doc = docs.find((item) => item.id === id && item.deleted !== 1)
  if (!doc) {
    throw new DomainError('文档不存在', { status: 404, key: 'errors.knowledgeNotFound' })
  }
  return doc
}

/**
 * 逻辑删除若干篇，返回新数组与真正改动了几条。
 *
 * 用逻辑删除而不是从数组里抹掉：备份合并按 id 去重、冲突时取 `updatedAt` 较新者，
 * 留下墓碑才能让「删除」这个动作本身被合并进去；直接抹掉的话，
 * 导入一份较旧的备份会让已删的文档原样复活。
 */
function markDeleted(docs, ids) {
  const timestamp = nowDateTimeString()
  const wanted = new Set(ids)
  let changed = 0

  const list = docs.map((item) => {
    if (!wanted.has(item.id) || item.deleted === 1) return item
    changed += 1
    return { ...item, deleted: 1, updatedAt: timestamp }
  })

  return { list, changed }
}

/**
 * 供页面调用的列表：排除已删除，默认按导入时间倒序。
 * 搜索与其它排序由页面在内存里做（见 `domain/knowledge.js` 的 `queryDocs`）——
 * 数据本来就在本地，再往下压一层查询没有意义。
 * @returns {Promise<Array>}
 */
export async function list() {
  return sortDocs(visibleDocs(await loadDocs()))
}

/**
 * 新建一篇文档。
 * @param {object} input - { title, content, sourceType, originName }
 * @returns {Promise<object>} 新建的文档
 */
export async function create(input) {
  return withWriteLock(async () => {
    const docs = await loadDocs()
    const doc = buildDoc(input)
    await saveDocs([...docs, doc])
    return doc
  })
}

/**
 * 修改文档。只有标题与正文会变——来源记录的是「当时怎么进来的」，
 * 事后编辑不该把它改写成另一个来源。
 *
 * @param {string} id
 * @param {{ title?: string, content?: string }} patch
 * @returns {Promise<object>} 更新后的文档
 */
export async function update(id, patch) {
  return withWriteLock(async () => {
    const docs = await loadDocs()
    const target = findOrThrow(docs, id)
    const next = applyDocPatch(target, patch)
    await saveDocs(docs.map((item) => (item.id === id ? next : item)))
    return next
  })
}

/**
 * 删除一篇文档（逻辑删除）。
 * @param {string} id
 * @returns {Promise<void>}
 */
export async function remove(id) {
  return withWriteLock(async () => {
    const docs = await loadDocs()
    findOrThrow(docs, id)
    const { list: next } = markDeleted(docs, [id])
    await saveDocs(next)
  })
}

/**
 * 批量删除，返回真正删掉的条数。
 *
 * 与单个删除有一处**有意不同**：这里不为「找不到的 id」抛错。
 * 用户勾选的是列表里的行，若其中一条已被另一个标签页删掉，
 * 整批失败只会让人困惑——删掉能删的、如实报告条数更合理。
 * 全都没改动时不写盘，省掉一次无意义的 IndexedDB 写入。
 *
 * @param {string[]} ids
 * @returns {Promise<number>} 实际删除的条数
 */
export async function removeMany(ids) {
  return withWriteLock(async () => {
    const wanted = (Array.isArray(ids) ? ids : [])
      .filter((id) => typeof id === 'string' && id !== '')
    if (wanted.length === 0) return 0

    const docs = await loadDocs()
    const { list: next, changed } = markDeleted(docs, wanted)
    if (changed === 0) return 0

    await saveDocs(next)
    return changed
  })
}

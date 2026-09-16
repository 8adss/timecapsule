/**
 * 分身仓储 —— 「一次业务操作」的边界，负责持有写锁并落盘。
 *
 * 与知识库仓储同构：判定规则一律下沉到 `domain/persona.js`，
 * 本层只做「读 → 交给领域层 → 写回」。
 *
 * 唯一的例外是 `remove`：删分身要**连带删掉它名下的对话**，
 * 于是那一次操作会同时写 `KEY.personas` 与 `KEY.dialogues` 两个键
 * （必须同一个事务，理由见那个函数）。
 */
import { read, write, writeMany, KEY } from '../storage/index.js'
import { withWriteLock } from '../storage/lock.js'
import { DomainError } from '../domain/errors.js'
import { nowDateTimeString } from '../domain/time.js'
import { applyPersonaPatch, buildPersona, sortPersonas, visiblePersonas } from '../domain/persona.js'
import { loadDialogues, markTargetDeletedWithinLock } from './chatRepo.js'

/**
 * 读取全部分身（含逻辑删除的记录）。
 * @returns {Promise<Array>}
 */
export async function loadPersonas() {
  const list = await read(KEY.personas, [])
  return Array.isArray(list) ? list : []
}

/**
 * 写回全部分身。
 * @param {Array} list
 * @returns {Promise<void>}
 */
export async function savePersonas(list) {
  await write(KEY.personas, list)
}

/** 在列表里找一个未删除的分身，找不到就抛 404。 */
function findOrThrow(personas, id) {
  const persona = personas.find((item) => item.id === id && item.deleted !== 1)
  if (!persona) {
    throw new DomainError('分身不存在', { status: 404, key: 'errors.personaNotFound' })
  }
  return persona
}

/**
 * 供页面调用的列表：排除已删除，按代表时间点由近及远。
 * @returns {Promise<Array>}
 */
export async function list() {
  return sortPersonas(visiblePersonas(await loadPersonas()))
}

/**
 * 新建分身。画像与说话风格这一期由用户手写。
 * @param {object} input - { name, selfDate, docIds, summary, stylePrompt }
 * @returns {Promise<object>} 新建的分身
 */
export async function create(input) {
  return withWriteLock(async () => {
    const personas = await loadPersonas()
    const persona = buildPersona(input)
    await savePersonas([...personas, persona])
    return persona
  })
}

/**
 * 修改分身：名称、代表时间点、引用材料、画像、说话风格。
 * @param {string} id
 * @param {object} patch
 * @returns {Promise<object>} 更新后的分身
 */
export async function update(id, patch) {
  return withWriteLock(async () => {
    const personas = await loadPersonas()
    const target = findOrThrow(personas, id)
    const next = applyPersonaPatch(target, patch)
    await savePersonas(personas.map((item) => (item.id === id ? next : item)))
    return next
  })
}

/**
 * 删除一个分身（逻辑删除），**连同它的对话一起**。
 *
 * 不做批量删除：分身是手工一个个建的，数量天然有限，
 * 不像知识库那样可能一次导入几十篇。没有真实需求就不加这个入口。
 *
 * 对话必须一起删：删掉分身之后，那些记录从任何页面都到不了，
 * 只会在导出文件里悄悄堆积，而用户以为「那个分身连同我们说过的话都没了」。
 * 两处写入放进同一个事务（`writeMany`），否则可能删掉分身却留下一堆孤儿记录。
 *
 * @param {string} id
 * @returns {Promise<void>}
 */
export async function remove(id) {
  return withWriteLock(async () => {
    const personas = await loadPersonas()
    findOrThrow(personas, id)
    const timestamp = nowDateTimeString()

    const nextPersonas = personas.map((item) => (
      item.id === id && item.deleted !== 1 ? { ...item, deleted: 1, updatedAt: timestamp } : item
    ))
    const nextDialogues = markTargetDeletedWithinLock(
      await loadDialogues(),
      { personaId: id },
      timestamp
    )

    await writeMany([
      [KEY.personas, nextPersonas],
      [KEY.dialogues, nextDialogues]
    ])
  })
}

/**
 * 对话记录仓储。
 *
 * 一份集合、一个键，所以每次操作只写 `KEY.dialogues`。
 * 判定规则（可见性、排序、按对象取历史）都在 `domain/chat.js`，本层只管读写。
 */
import { read, write, KEY } from '../storage/index.js'
import { withWriteLock } from '../storage/lock.js'
import { nowDateTimeString } from '../domain/time.js'
import { DIALOGUE_ROLE, buildDialogue, historyFor, pickPersona } from '../domain/chat.js'

/**
 * 读取全部对话记录（含逻辑删除的）。
 * @returns {Promise<Array>}
 */
export async function loadDialogues() {
  const list = await read(KEY.dialogues, [])
  return Array.isArray(list) ? list : []
}

/**
 * 写回全部对话记录。
 * @param {Array} list
 */
export async function saveDialogues(list) {
  await write(KEY.dialogues, list)
}

/**
 * 某个对话对象的完整历史（时间正序，不含已删除的）。
 * @param {{capsuleId?: string, personaId?: string}} target
 * @returns {Promise<Array>}
 */
export async function history(target) {
  return historyFor(await loadDialogues(), target)
}

/**
 * 追加一轮对话：用户说的话与 AI 的回复。
 *
 * **两条记录一次写入**，不拆成两次。否则一旦中间失败，历史里会留下一条
 * 没有回复的用户消息——而界面上的处理是「发送失败就把文字还给输入框」，
 * 那条半截记录会变成一个用户看不见、也删不掉的幽灵。
 *
 * @param {{capsuleId?: string, personaId?: string, message: string, reply: string, emotionTag?: string}} input
 * @returns {Promise<{user: object, ai: object}>}
 */
export async function appendTurn(input) {
  return withWriteLock(async () => {
    const list = await loadDialogues()
    const scope = { capsuleId: input.capsuleId ?? null, personaId: input.personaId ?? null }

    // 落盘前**再确认一次目标还在**。模型回复可能要等上一分钟，这期间用户完全可能
    // 在另一个标签页里把这个分身删掉——那之后写进去的记录没有任何入口能到达，
    // 只会永远留在存储与每一份备份里。（删分身那一步已经会连带删它的对话，
    // 但那是「先发生」的顺序；这里是「后发生」的那一半。）
    //
    // 直接读 KEY.personas 而不是走 personaRepo：后者为了「删分身时连带删对话」
    // 已经 import 了本模块，反过来再 import 它就成环了。
    if (scope.personaId) {
      const personas = await read(KEY.personas, [])
      pickPersona(Array.isArray(personas) ? personas : [], scope.personaId)
    }

    const user = buildDialogue({
      ...scope,
      role: DIALOGUE_ROLE.USER,
      content: input.message,
      emotionTag: input.emotionTag
    })
    const ai = buildDialogue({
      ...scope,
      // 角色跟着对话对象走：分身那一侧说自己是「何时的自己」
      role: scope.personaId ? DIALOGUE_ROLE.PERSONA : DIALOGUE_ROLE.PAST_SELF,
      content: input.reply
    })

    await saveDialogues([...list, user, ai])
    return { user, ai }
  })
}

/**
 * 把若干个对象名下的对话**全部标记删除**，返回新的列表。
 *
 * 做成 `...WithinLock` 形式的纯函数，是因为有几个调用方需要在**它们自己的锁里**
 * 顺手用一下：
 * - 本模块的 `removeByTarget`（用户点「清空这段对话」）；
 * - `personaRepo.remove`——删分身时要把它的对话一起删掉，且必须与分身那次写入
 *   在同一个事务里，否则可能出现「分身没了、对话还在」的孤儿记录；
 * - `demoRepo.clear`——清空示例分身时同理。
 *
 * @param {Array} list
 * @param {{capsuleIds?: string[], personaIds?: string[]}} targets
 * @param {string} timestamp
 * @returns {Array}
 */
export function markTargetsDeletedWithinLock(list, targets, timestamp) {
  const capsuleIds = new Set(targets?.capsuleIds ?? [])
  const personaIds = new Set(targets?.personaIds ?? [])

  return list.map((item) => {
    const belongs = (item.capsuleId && capsuleIds.has(item.capsuleId))
      || (item.personaId && personaIds.has(item.personaId))
    return !belongs || item.deleted === 1 ? item : { ...item, deleted: 1, updatedAt: timestamp }
  })
}

/**
 * 单个对象那一版，转发给上面那个。
 *
 * @param {Array} list
 * @param {{capsuleId?: string, personaId?: string}} target
 * @param {string} timestamp
 * @returns {Array}
 */
export function markTargetDeletedWithinLock(list, target, timestamp) {
  return markTargetsDeletedWithinLock(
    list,
    { capsuleIds: [target?.capsuleId], personaIds: [target?.personaId] },
    timestamp
  )
}

/**
 * 删掉某个对话对象的全部历史（逻辑删除）。
 *
 * 两个地方会用到它，做的是同一件事：
 * - 用户在对话页点「清空这段对话」；
 * - 用户删掉一个分身——那些记录从此没有任何入口能到达它们，
 *   留着只会在备份文件里悄悄堆积。
 *
 * @param {{capsuleId?: string, personaId?: string}} target
 * @param {Date} [now]
 * @returns {Promise<number>} 实际删掉几条
 */
export async function removeByTarget(target, now = new Date()) {
  return withWriteLock(async () => {
    const list = await loadDialogues()
    const next = markTargetDeletedWithinLock(list, target, nowDateTimeString(now))
    const changed = next.reduce((count, item, index) => (item === list[index] ? count : count + 1), 0)

    if (changed > 0) await saveDialogues(next)
    return changed
  })
}

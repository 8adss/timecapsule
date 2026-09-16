/**
 * 知识库接口。
 *
 * 本地化之后这里不再是 HTTP 调用，而是转发到仓储层——但**保留这一层的意义**在于：
 * 页面只依赖这几个函数名，将来接外接存储（走网络）时，改动局限在本文件内部，
 * 页面与仓储都不用动。它是「传输方式」与「业务逻辑」之间的接缝。
 *
 * 与旧版 API 的两处差异：
 * - 不再有 `userId` 参数：本地应用是单用户的，没有账号也没有用户列表；
 * - 不再有「取详情」接口：旧版列表只返回摘要、正文要再查一次，
 *   而本地存储里整篇都在手上，详情直接用列表里的那一行即可。
 */
import { run } from './local'
import * as knowledgeRepo from '../repository/knowledgeRepo'

/** 全部文档（排除已删除），默认按导入时间倒序。 */
export const listDocs = () => run(() => knowledgeRepo.list())

/** 导入一篇文档。 */
export const createDoc = (data) => run(() => knowledgeRepo.create(data))

/** 修改标题或正文。 */
export const updateDoc = (id, data) => run(() => knowledgeRepo.update(id, data))

/** 删除一篇文档（逻辑删除）。 */
export const deleteDoc = (id) => run(() => knowledgeRepo.remove(id))

/** 批量删除，返回实际删除的条数。 */
export const deleteDocs = (ids) => run(() => knowledgeRepo.removeMany(ids))

/**
 * 展示与查询用的纯函数，直接从领域层透出。
 *
 * 为什么放在这一层：页面的约定是**只依赖 `api/` 与 `utils/`**，不直接引 `domain/`。
 * 而字数和摘要都是正文的函数、搜索与排序也只作用于已经在内存里的数组——
 * 它们是同步的纯函数，走不了上面那些异步接口。透出这几个名字，
 * 既守住了分层，又不必在页面里把已经写好、已经测过的逻辑再抄一遍。
 */
export {
  buildPreview,
  countChars,
  KNOWLEDGE_LIMITS,
  queryDocs,
  SOURCE_TYPE,
  SORT_BY
} from '../domain/knowledge'

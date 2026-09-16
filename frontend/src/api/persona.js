/**
 * 「我的分身」接口。
 *
 * 与知识库那份同构：本地化之后这里不再是 HTTP 调用，而是转发到仓储层，
 * 保留这一层的意义在于页面只依赖这几个函数名，将来接大模型或换存储时，
 * 改动局限在本文件内部。
 *
 * 与旧版 API 的差异：
 * - 不再有 `userId`（本地单用户）；
 * - `regenerate` 暂不提供——它要调大模型，属于下一步；
 * - 新增 `updatePersona`：画像与说话风格这一期由用户手写，就得能改。
 */
import { run } from './local'
import * as personaRepo from '../repository/personaRepo'

/** 全部分身（排除已删除），按代表时间点由近及远。 */
export const listPersonas = () => run(() => personaRepo.list())

/** 新建分身。 */
export const createPersona = (data) => run(() => personaRepo.create(data))

/** 修改分身：名称、代表时间点、引用材料、画像、说话风格。 */
export const updatePersona = (id, data) => run(() => personaRepo.update(id, data))

/** 删除一个分身（逻辑删除）。 */
export const deletePersona = (id) => run(() => personaRepo.remove(id))

/**
 * 展示用纯函数，直接从领域层透出。
 *
 * 与 `api/knowledge.js` 同一个理由：页面的约定是只依赖 `api/` 与 `utils/`，
 * 不直接引 `domain/`；而这几件事都是同步纯函数，走不了上面那些异步接口。
 */
export {
  PERSONA_LIMITS,
  PERSONA_STATUS,
  resolveMaterials,
  visiblePersonas
} from '../domain/persona'

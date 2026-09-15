/**
 * 成就接口。
 *
 * 成就没有「手动发放」入口——它只由完成任务、开启胶囊这两个动作自动触发，
 * 判定逻辑在仓储层。这里只提供只读查询。
 */
import { run } from './local'
import * as achievementRepo from '../repository/achievementRepo'

/** 全部已解锁成就，按类型与数值升序。 */
export const listAchievements = () => run(() => achievementRepo.list())

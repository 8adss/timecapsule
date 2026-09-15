import request from './request'

// 成就接口（成就由完成任务 / 开启胶囊自动发放，没有手动发放接口）
export const listAchievements = (userId) =>
  request.get('/achievements', { params: { userId } })

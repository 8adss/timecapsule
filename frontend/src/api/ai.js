import request from './request'

// AI 模型配置接口
// 注意：查询返回的 apiKey 是掩码，保存时留空表示"不改动已有 key"
export const getAiConfig = () => request.get('/ai/config')

export const saveAiConfig = (data) => request.put('/ai/config', data)

export const testAiConfig = (data) => request.post('/ai/config/test', data)

// 拉取当前端点支持的模型列表（OpenAI 兼容的 GET /models）
export const listAiModels = () => request.get('/ai/models')

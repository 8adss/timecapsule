<template>
  <div class="page">
    <div class="page-head">
      <div>
        <h1 class="page-title">设置</h1>
        <p class="page-desc">配置大模型端点与模型名。保存后会存进数据库，优先级高于配置文件</p>
      </div>
    </div>

    <el-card shadow="never" class="status-card" v-loading="loading">
      <div class="status-row">
        <el-tag :type="config.configured ? 'success' : 'warning'" size="large" effect="light">
          {{ config.configured ? '已配置，可以调用' : '未配置 API Key' }}
        </el-tag>
        <span v-if="config.configured" class="status-detail">
          当前：{{ config.provider }} / {{ config.model }}
          <span class="key-source">
            （Key 来源：{{ config.keyFromDb ? '数据库' : (config.keyFromConfig ? '本地配置文件' : '未知') }}）
          </span>
        </span>
      </div>
      <div v-if="config.apiKey" class="mask-row">已保存的 Key：<code>{{ config.apiKey }}</code></div>
    </el-card>

    <el-card shadow="never" class="form-card">
      <el-form label-width="120px" label-position="right">
        <el-form-item label="供应商预设">
          <div class="presets">
            <div
              v-for="preset in PRESETS"
              :key="preset.provider"
              :class="['preset', { active: form.provider === preset.provider }]"
              @click="applyPreset(preset)"
            >
              <div class="preset-name">{{ preset.provider }}</div>
              <div class="preset-desc">{{ preset.desc }}</div>
            </div>
          </div>
        </el-form-item>

        <el-form-item label="名称">
          <el-input v-model="form.provider" placeholder="仅用于展示，例如 DeepSeek" maxlength="50" />
        </el-form-item>

        <el-form-item label="接口地址" required>
          <el-input v-model="form.baseUrl" placeholder="OpenAI 兼容的 chat/completions 完整地址" />
          <div class="tip">必须是完整端点，例如 https://api.deepseek.com/chat/completions</div>
        </el-form-item>

        <el-form-item label="模型" required>
          <div class="model-row">
            <el-select
              v-model="form.model"
              filterable
              allow-create
              default-first-option
              placeholder="选择或直接输入模型名"
              style="flex: 1"
            >
              <el-option v-for="m in modelOptions" :key="m" :label="m" :value="m" />
            </el-select>
            <el-button :loading="fetchingModels" @click="fetchModels">拉取可用模型</el-button>
          </div>
          <div class="tip">
            下拉里是预设模型；点「拉取可用模型」会调用端点的 {{ '/models' }} 接口，用你这个 Key 实际能用的模型覆盖
          </div>
        </el-form-item>

        <el-form-item label="API Key">
          <el-input
            v-model="form.apiKey"
            type="password"
            show-password
            :placeholder="config.apiKey ? '留空表示不修改已保存的 Key' : '粘贴你的 API Key'"
          />
          <div class="tip">
            出于安全考虑，查询接口只返回掩码。留空保存＝沿用现有 Key，不会被掩码覆盖。
          </div>
        </el-form-item>

        <el-form-item label="采样温度">
          <el-slider v-model="form.temperature" :min="0" :max="2" :step="0.1" show-input style="max-width: 460px" />
          <div class="tip">越低越稳定收敛，越高越发散。角色扮演建议 0.7~1.0</div>
        </el-form-item>

        <el-form-item>
          <el-button type="primary" :loading="saving" @click="save">保存配置</el-button>
          <el-button :loading="testing" @click="test">测试连接</el-button>
          <el-button text @click="load">重置</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <el-card v-if="testResult" shadow="never" class="result-card">
      <div class="result-title">测试结果</div>
      <pre class="result-body">{{ testResult }}</pre>
    </el-card>
  </div>
</template>

<script setup>
import { onMounted, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { getAiConfig, listAiModels, saveAiConfig, testAiConfig } from '../api/ai'

// 预设只填「地址 + 常见模型」，Key 一律由用户自己填
const PRESETS = [
  {
    provider: 'DeepSeek',
    desc: '深度求索官方',
    baseUrl: 'https://api.deepseek.com/chat/completions',
    models: ['deepseek-v4-pro', 'deepseek-flash']
  },
  {
    provider: '豆包方舟',
    desc: '火山引擎',
    baseUrl: 'https://ark.cn-beijing.volces.com/api/v3/chat/completions',
    models: ['doubao-seed-1-6-250615']
  },
  {
    provider: '通义千问',
    desc: '阿里云百炼（兼容模式）',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
    models: ['qwen-plus', 'qwen-max']
  },
  { provider: '自定义', desc: '任意 OpenAI 兼容端点', baseUrl: '', models: [] }
]

const loading = ref(false)
const saving = ref(false)
const testing = ref(false)
const fetchingModels = ref(false)
const testResult = ref('')
const modelOptions = ref([])

const config = reactive({
  provider: '',
  baseUrl: '',
  apiKey: '',
  model: '',
  temperature: 0.7,
  configured: false,
  keyFromDb: false,
  keyFromConfig: false
})

const form = reactive({
  provider: '',
  baseUrl: '',
  apiKey: '',
  model: '',
  temperature: 0.7
})

const load = async () => {
  loading.value = true
  try {
    const data = await getAiConfig()
    Object.assign(config, data)
    form.provider = data.provider
    form.baseUrl = data.baseUrl
    form.model = data.model
    form.temperature = data.temperature
    // apiKey 不回填明文；留空即"不修改"
    form.apiKey = ''
    const preset = PRESETS.find((p) => p.provider === data.provider)
    modelOptions.value = preset ? [...preset.models] : [data.model].filter(Boolean)
  } finally {
    loading.value = false
  }
}

const applyPreset = (preset) => {
  form.provider = preset.provider
  if (preset.baseUrl) {
    form.baseUrl = preset.baseUrl
  }
  modelOptions.value = [...preset.models]
  if (preset.models.length > 0 && !preset.models.includes(form.model)) {
    form.model = preset.models[0]
  }
}

const buildPayload = () => ({
  provider: form.provider,
  baseUrl: form.baseUrl,
  model: form.model,
  // 留空表示不改动已保存的 Key
  apiKey: form.apiKey,
  temperature: form.temperature
})

const fetchModels = async () => {
  fetchingModels.value = true
  try {
    const models = await listAiModels()
    if (models.length === 0) {
      ElMessage.warning('该端点没有返回任何模型')
      return
    }
    modelOptions.value = models
    if (!models.includes(form.model)) {
      form.model = models[0]
    }
    ElMessage.success(`拉到 ${models.length} 个可用模型`)
  } catch (e) {
    /* 错误已由拦截器提示 */
  } finally {
    fetchingModels.value = false
  }
}

const save = async () => {
  if (!form.baseUrl.trim() || !form.model.trim()) {
    ElMessage.warning('接口地址和模型名不能为空')
    return
  }
  saving.value = true
  try {
    const data = await saveAiConfig(buildPayload())
    Object.assign(config, data)
    form.apiKey = ''
    ElMessage.success('配置已保存')
  } catch (e) {
    /* 已提示 */
  } finally {
    saving.value = false
  }
}

const test = async () => {
  testing.value = true
  testResult.value = ''
  try {
    testResult.value = await testAiConfig(buildPayload())
    ElMessage.success('连接成功')
  } catch (e) {
    testResult.value = '测试失败：' + (e.message || '未知错误')
  } finally {
    testing.value = false
  }
}

onMounted(load)
</script>

<style scoped>
.status-card {
  margin-bottom: var(--sp-4);
}
.status-row {
  display: flex;
  align-items: center;
  gap: var(--sp-3);
  flex-wrap: wrap;
}
.status-detail {
  font-size: var(--fs-sm);
  color: var(--mt-text-sub);
}
.key-source {
  color: var(--mt-text-faint);
}
.mask-row {
  margin-top: var(--sp-3);
  font-size: var(--fs-sm);
  color: var(--mt-text-muted);
}
.mask-row code {
  padding: 2px 8px;
  border-radius: var(--radius-sm);
  background: var(--mt-surface-alt);
  color: var(--mt-primary-deep);
}
.form-card {
  margin-bottom: var(--sp-4);
}
.presets {
  display: flex;
  gap: var(--sp-3);
  flex-wrap: wrap;
}
.preset {
  width: 152px;
  padding: var(--sp-3) var(--sp-4);
  border: 1px solid var(--mt-border);
  border-radius: var(--radius);
  background: var(--mt-surface);
  cursor: pointer;
  transition: border-color var(--dur) var(--ease), background-color var(--dur) var(--ease);
}
.preset:hover {
  border-color: var(--mt-primary-light, #cead8e);
  background: var(--mt-primary-wash);
}
.preset.active {
  border-color: var(--mt-primary);
  background: var(--mt-primary-wash);
}
.preset-name {
  font-size: var(--fs-base);
  font-weight: 500;
  color: var(--mt-text);
}
.preset-desc {
  margin-top: 2px;
  font-size: var(--fs-xs);
  color: var(--mt-text-faint);
}
.model-row {
  display: flex;
  gap: var(--sp-2);
  width: 100%;
}
.tip {
  font-size: var(--fs-xs);
  color: var(--mt-text-faint);
  line-height: var(--lh-base);
  margin-top: var(--sp-1);
}
.result-card {
  margin-bottom: var(--sp-4);
}
.result-title {
  margin-bottom: var(--sp-2);
  font-size: var(--fs-base);
  font-weight: 500;
  color: var(--mt-text);
}
.result-body {
  margin: 0;
  padding: var(--sp-4);
  border-radius: var(--radius);
  background: var(--mt-surface-alt);
  font-size: var(--fs-sm);
  line-height: var(--lh-base);
  color: var(--mt-text-sub);
  white-space: pre-wrap;
  word-break: break-all;
}
</style>

<template>
  <div class="page">
    <div class="page-head">
      <div>
        <h1 class="page-title">我的分身</h1>
        <p class="page-desc">把知识库里的个人资料蒸馏成「某个时间点的自己」，之后就可以选择和那时的你对话</p>
      </div>
      <div class="page-actions">
        <el-button @click="$router.push('/knowledge')">去知识库</el-button>
        <el-button type="primary" @click="openCreate">创建分身</el-button>
      </div>
    </div>

    <el-empty
      v-if="!loading && personas.length === 0"
      description="还没有分身。先在知识库导入几篇你写的文字，再回来创建一个"
    />

    <el-card v-for="p in personas" :key="p.id" class="persona-card" shadow="never">
      <template #header>
        <div class="persona-head">
          <div class="persona-title">
            <span class="name">{{ p.name }}</span>
            <span class="date">代表 {{ p.selfDate }} 的我</span>
          </div>
          <div class="tags">
            <el-tag :type="statusMeta(p.status).type" effect="light">
              {{ statusMeta(p.status).text }}
            </el-tag>
            <el-tag type="info" effect="plain" size="small">{{ p.docCount }} 篇材料</el-tag>
          </div>
        </div>
      </template>

      <!-- 生成中：显示进度提示 -->
      <div v-if="p.status === 'GENERATING'" class="state-box generating">
        <el-icon class="is-loading"><Loading /></el-icon>
        正在阅读你的材料并蒸馏画像，通常需要 10~60 秒，页面会自动刷新…
      </div>

      <!-- 生成失败：显示原因 + 重试 -->
      <div v-else-if="p.status === 'FAILED'" class="state-box failed">
        <div class="fail-title">生成失败</div>
        <div class="fail-reason">{{ p.failReason || '未知原因' }}</div>
        <div class="fail-tip">
          常见原因：AI 模型还没配置（去「设置」页填写 Key）、Key 余额不足、端点或模型名不对。
        </div>
      </div>

      <!-- 就绪：显示画像 -->
      <div v-else-if="p.status === 'READY'">
        <div class="section-label">画像</div>
        <p class="summary">{{ p.summary }}</p>
        <div class="section-label">说话风格</div>
        <p class="style">{{ p.stylePrompt }}</p>
      </div>

      <template #footer>
        <el-button v-if="p.status === 'READY'" type="primary" @click="goChat(p)">
          和那时的我对话
        </el-button>
        <el-button v-else-if="p.status === 'FAILED'" type="primary" @click="doRegenerate(p)">
          重新生成
        </el-button>
        <el-button @click="openDetail(p)">查看详情</el-button>
        <el-popconfirm title="确定删除这个分身吗？" @confirm="doDelete(p)">
          <template #reference>
            <el-button type="danger" plain>删除</el-button>
          </template>
        </el-popconfirm>
      </template>
    </el-card>

    <!-- 创建分身 -->
    <el-dialog v-model="dialogVisible" title="创建分身" width="600px">
      <el-form label-width="110px">
        <el-form-item label="分身名称" required>
          <el-input v-model="form.name" placeholder="例如：2026 年 9 月的我" maxlength="100" />
        </el-form-item>
        <el-form-item label="代表时间点" required>
          <el-date-picker
            v-model="form.selfDate"
            type="date"
            value-format="YYYY-MM-DD"
            placeholder="这个分身代表哪个时候的你"
            style="width: 100%"
          />
          <div class="tip">同一个人的不同时期，性格和在意的事会很不一样，所以时间点要选准</div>
        </el-form-item>
        <el-form-item label="引用材料" required>
          <el-select
            v-model="form.docIds"
            multiple
            collapse-tags
            collapse-tags-tooltip
            placeholder="选择知识库里的文档"
            style="width: 100%"
          >
            <el-option v-for="d in docs" :key="d.id" :label="d.title" :value="d.id" />
          </el-select>
          <div class="tip">
            至少要选一篇。选得越贴近那个时间点的你，生成的人设越准（当前知识库 {{ docs.length }} 篇）
          </div>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="doCreate">开始生成</el-button>
      </template>
    </el-dialog>

    <!-- 详情 -->
    <el-dialog v-model="detailVisible" :title="detail?.persona?.name || '分身详情'" width="680px">
      <template v-if="detail">
        <div class="detail-meta">
          代表 {{ detail.persona.selfDate }} 的我
          <span v-if="detail.persona.model">· 由 {{ detail.persona.model }} 生成</span>
        </div>
        <div class="section-label">画像</div>
        <p class="summary">{{ detail.persona.summary || '（无）' }}</p>
        <div class="section-label">说话风格</div>
        <p class="style">{{ detail.persona.stylePrompt || '（无）' }}</p>
        <div class="section-label">引用的材料</div>
        <el-tag v-for="d in detail.docs" :key="d.id" class="doc-tag" effect="plain">
          {{ d.title }}（{{ d.charCount }} 字）
        </el-tag>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { onMounted, onUnmounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { Loading } from '@element-plus/icons-vue'
import { createPersona, deletePersona, getPersona, listPersonas, regeneratePersona } from '../api/persona'
import { listDocs } from '../api/knowledge'
import { useUserStore } from '../stores/user'

const userStore = useUserStore()
const router = useRouter()

const personas = ref([])
const docs = ref([])
const loading = ref(false)
const submitting = ref(false)
const dialogVisible = ref(false)
const detailVisible = ref(false)
const detail = ref(null)

const form = reactive({ name: '', selfDate: '', docIds: [] })

const STATUS = {
  DRAFT: { text: '草稿', type: 'info' },
  GENERATING: { text: '生成中', type: 'warning' },
  READY: { text: '已就绪', type: 'success' },
  FAILED: { text: '生成失败', type: 'danger' }
}
const statusMeta = (status) => STATUS[status] || { text: status || '未知', type: 'info' }

let timer = null

const stopPolling = () => {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
}

/** 有分身还在生成中时，每 2.5 秒刷新一次列表；全部就绪后自动停止 */
const startPolling = () => {
  if (timer) return
  timer = setInterval(async () => {
    if (!personas.value.some((p) => p.status === 'GENERATING')) {
      stopPolling()
      return
    }
    await load()
  }, 2500)
}

const load = async () => {
  loading.value = true
  try {
    personas.value = await listPersonas(userStore.userId)
    if (personas.value.some((p) => p.status === 'GENERATING')) {
      startPolling()
    }
  } finally {
    loading.value = false
  }
}

const loadDocs = async () => {
  docs.value = await listDocs(userStore.userId)
}

const openCreate = async () => {
  await loadDocs()
  if (docs.value.length === 0) {
    ElMessage.warning('知识库还是空的，先去导入几篇你写过的文字')
    return
  }
  form.name = ''
  form.selfDate = new Date().toISOString().slice(0, 10)
  form.docIds = []
  dialogVisible.value = true
}

const doCreate = async () => {
  if (!form.name.trim()) {
    ElMessage.warning('请填写分身名称')
    return
  }
  if (!form.selfDate) {
    ElMessage.warning('请选择代表的时间点')
    return
  }
  if (form.docIds.length === 0) {
    ElMessage.warning('至少选择一篇材料')
    return
  }
  submitting.value = true
  try {
    await createPersona({
      userId: userStore.userId,
      name: form.name.trim(),
      selfDate: form.selfDate,
      docIds: form.docIds
    })
    ElMessage.success('已开始生成，稍等十几秒')
    dialogVisible.value = false
    await load()
  } catch (e) {
    /* 已提示 */
  } finally {
    submitting.value = false
  }
}

const doRegenerate = async (persona) => {
  try {
    await regeneratePersona(persona.id, userStore.userId)
    ElMessage.success('已重新提交生成')
    await load()
  } catch (e) {
    /* 已提示 */
  }
}

const openDetail = async (persona) => {
  detail.value = await getPersona(persona.id, userStore.userId)
  detailVisible.value = true
}

const doDelete = async (persona) => {
  try {
    await deletePersona(persona.id, userStore.userId)
    ElMessage.success('已删除')
    await load()
  } catch (e) {
    /* 已提示 */
  }
}

const goChat = (persona) => {
  router.push({ path: '/chat', query: { mode: 'persona', personaId: persona.id } })
}

onMounted(load)
onUnmounted(stopPolling)
</script>

<style scoped>
.persona-card {
  margin-bottom: var(--sp-4);
}
.persona-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}
.persona-title {
  display: flex;
  align-items: baseline;
  gap: 10px;
}
.name {
  font-size: var(--fs-lg);
  font-weight: 600;
  color: var(--mt-text);
}
.date {
  font-size: var(--fs-xs);
  color: var(--mt-text-faint);
}
.tags {
  display: flex;
  gap: var(--sp-2);
  align-items: center;
}
.summary,
.style {
  margin: 0 0 var(--sp-4);
  font-size: var(--fs-base);
  line-height: var(--lh-loose);
  color: var(--mt-text);
  white-space: pre-wrap;
}
.style {
  color: var(--mt-text-sub);
}
.state-box {
  padding: var(--sp-3) var(--sp-4);
  border-radius: var(--radius);
  font-size: var(--fs-sm);
  line-height: var(--lh-base);
}
.generating {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  background: var(--mt-primary-wash);
  color: var(--mt-text-sub);
}
.failed {
  background: var(--el-color-danger-light-9);
  border: 1px solid var(--el-color-danger-light-7);
}
.fail-title {
  margin-bottom: var(--sp-1);
  font-weight: 500;
  color: var(--el-color-danger-dark-2);
}
.fail-reason {
  color: var(--mt-text-sub);
  word-break: break-all;
}
.fail-tip {
  margin-top: var(--sp-2);
  font-size: var(--fs-xs);
  color: var(--mt-text-muted);
}
.tip {
  font-size: var(--fs-xs);
  color: var(--mt-text-faint);
  line-height: var(--lh-base);
  margin-top: var(--sp-1);
}
.detail-meta {
  margin-bottom: var(--sp-3);
  font-size: var(--fs-xs);
  color: var(--mt-text-muted);
}
.doc-tag {
  margin: 0 var(--sp-2) var(--sp-2) 0;
}
</style>

<template>
  <div class="page">
    <div class="page-head">
      <div>
        <h1 class="page-title">{{ t('persona.title') }}</h1>
        <p class="page-desc">{{ t('persona.desc') }}</p>
      </div>
      <div class="page-actions">
        <el-button @click="router.push('/app/knowledge')">{{ t('persona.goKnowledge') }}</el-button>
        <el-button type="primary" @click="openCreate">{{ t('persona.create') }}</el-button>
      </div>
    </div>

    <DemoBanner @cleared="reloadAll" />

    <el-empty v-if="!loading && personas.length === 0" :description="t('persona.empty')" />

    <el-card v-for="item in personas" :key="item.id" class="persona-card" shadow="never">
      <template #header>
        <div class="persona-head">
          <div class="persona-title">
            <span class="name">{{ item.name }}</span>
            <span class="date">{{ t('persona.detailDate', { date: item.selfDate }) }}</span>
          </div>
          <el-tag type="info" effect="plain" size="small">
            {{ t('persona.materialCount', { n: item.docIds.length }) }}
          </el-tag>
        </div>
      </template>

      <div class="section-label">{{ t('persona.summaryLabel') }}</div>
      <p v-if="item.summary" class="summary">{{ item.summary }}</p>
      <p v-else class="placeholder">{{ t('persona.noSummary') }}</p>

      <div class="section-label">{{ t('persona.styleLabel') }}</div>
      <p v-if="item.stylePrompt" class="style">{{ item.stylePrompt }}</p>
      <p v-else class="placeholder">{{ t('persona.noStyle') }}</p>

      <template #footer>
        <el-button type="primary" @click="goChat">{{ t('persona.chat') }}</el-button>
        <el-button @click="openDetail(item)">{{ t('persona.detail') }}</el-button>
        <el-button @click="openEdit(item)">{{ t('persona.edit') }}</el-button>
        <el-popconfirm :title="t('persona.deleteConfirm')" @confirm="doDelete(item)">
          <template #reference>
            <el-button type="danger" plain>{{ t('persona.delete') }}</el-button>
          </template>
        </el-popconfirm>
      </template>
    </el-card>

    <!-- 新建与编辑共用一个弹窗：字段完全一样，差别只在标题与提交时调哪个接口 -->
    <el-dialog
      v-model="dialogVisible"
      :title="isEdit ? t('persona.edit') : t('persona.create')"
      width="680px"
    >
      <el-form label-width="96px">
        <el-form-item :label="t('persona.nameLabel')" required>
          <el-input
            v-model="form.name"
            :placeholder="t('persona.namePlaceholder')"
            :maxlength="LIMITS.name"
          />
        </el-form-item>

        <el-form-item :label="t('persona.selfDateLabel')" required>
          <el-date-picker
            v-model="form.selfDate"
            type="date"
            value-format="YYYY-MM-DD"
            :placeholder="t('persona.selfDatePlaceholder')"
            style="width: 100%"
          />
          <div class="tip">{{ t('persona.selfDateTip') }}</div>
        </el-form-item>

        <el-form-item :label="t('persona.docsLabel')" required>
          <el-select
            v-model="form.docIds"
            multiple
            collapse-tags
            collapse-tags-tooltip
            :placeholder="t('persona.docsPlaceholder')"
            style="width: 100%"
          >
            <el-option v-for="doc in docs" :key="doc.id" :label="doc.title" :value="doc.id" />
          </el-select>
          <div class="tip">{{ t('persona.docsTip', { n: docs.length }) }}</div>
        </el-form-item>

        <el-form-item :label="t('persona.summaryLabel')">
          <el-input
            v-model="form.summary"
            type="textarea"
            :rows="5"
            :maxlength="LIMITS.summary"
            show-word-limit
            :placeholder="t('persona.summaryPlaceholder')"
          />
        </el-form-item>

        <el-form-item :label="t('persona.styleLabel')">
          <el-input
            v-model="form.stylePrompt"
            type="textarea"
            :rows="5"
            :maxlength="LIMITS.stylePrompt"
            show-word-limit
            :placeholder="t('persona.stylePlaceholder')"
          />
        </el-form-item>
      </el-form>

      <template #footer>
        <el-button @click="dialogVisible = false">{{ t('persona.cancel') }}</el-button>
        <el-button type="primary" :loading="submitting" @click="doSubmit">
          {{ isEdit ? t('persona.save') : t('persona.submitCreate') }}
        </el-button>
      </template>
    </el-dialog>

    <!-- 详情 -->
    <el-dialog v-model="detailVisible" :title="detail?.name || t('persona.detail')" width="680px">
      <template v-if="detail">
        <div class="detail-meta">{{ t('persona.detailDate', { date: detail.selfDate }) }}</div>

        <div class="section-label">{{ t('persona.summaryLabel') }}</div>
        <p v-if="detail.summary" class="summary">{{ detail.summary }}</p>
        <p v-else class="placeholder">{{ t('persona.noSummary') }}</p>

        <div class="section-label">{{ t('persona.styleLabel') }}</div>
        <p v-if="detail.stylePrompt" class="style">{{ detail.stylePrompt }}</p>
        <p v-else class="placeholder">{{ t('persona.noStyle') }}</p>

        <div class="section-label">{{ t('persona.materialsLabel') }}</div>
        <template v-for="material in materials" :key="material.id">
          <el-tag v-if="!material.missing" class="doc-tag" effect="plain">
            {{ material.doc.title }}
          </el-tag>
          <el-tag v-else class="doc-tag" type="danger" effect="plain">
            {{ t('persona.materialMissing') }}
          </el-tag>
        </template>
        <div class="tip">{{ t('persona.materialsTip') }}</div>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
// ElMessage / ElMessageBox 由 unplugin-auto-import 自动引入，见 vite.config.js
import DemoBanner from '../components/DemoBanner.vue'
import { listDocs } from '../api/knowledge'
import {
  createPersona,
  deletePersona,
  listPersonas,
  PERSONA_LIMITS as LIMITS,
  resolveMaterials,
  updatePersona
} from '../api/persona'
import { toDateTimeString } from '../utils/date'

const { t } = useI18n()
const router = useRouter()

const personas = ref([])
const docs = ref([])
const loading = ref(false)
const submitting = ref(false)

const dialogVisible = ref(false)
const detailVisible = ref(false)
const detail = ref(null)
/** 正在编辑的那一个的 id；为空表示这是「新建」 */
const editingId = ref('')

const form = reactive({ name: '', selfDate: '', docIds: [], summary: '', stylePrompt: '' })

const isEdit = computed(() => editingId.value !== '')

/**
 * 详情里的引用材料。
 * 找不到的文档会保留位置并标成「材料已删除」，而不是悄悄少一行——
 * 用户得看出「原本引用了 3 篇，其中 1 篇不在了」。
 */
const materials = computed(() => (detail.value ? resolveMaterials(detail.value, docs.value) : []))

/** 表单里代表时间点的默认值。用本地时间，不能用 toISOString（那是 UTC，东八区半夜会差一天）。 */
const today = () => toDateTimeString(new Date()).slice(0, 10)

const load = async () => {
  loading.value = true
  try {
    personas.value = await listPersonas()
  } finally {
    loading.value = false
  }
}

const loadDocs = async () => {
  docs.value = await listDocs()
}

/** 清空示例之后两边都要重来：引用的材料没了，材料数也会变 */
const reloadAll = async () => {
  await Promise.all([load(), loadDocs()])
}

const openCreate = async () => {
  await loadDocs()
  if (docs.value.length === 0) {
    ElMessage.warning(t('persona.emptyKnowledge'))
    return
  }
  editingId.value = ''
  form.name = ''
  form.selfDate = today()
  form.docIds = []
  form.summary = ''
  form.stylePrompt = ''
  dialogVisible.value = true
}

const openEdit = async (item) => {
  await loadDocs()
  editingId.value = item.id
  form.name = item.name
  form.selfDate = item.selfDate
  form.docIds = [...item.docIds]
  form.summary = item.summary
  form.stylePrompt = item.stylePrompt
  dialogVisible.value = true
}

const openDetail = (item) => {
  detail.value = item
  detailVisible.value = true
}

const doSubmit = async () => {
  if (!form.name.trim()) {
    ElMessage.warning(t('persona.errName'))
    return
  }
  if (!form.selfDate) {
    ElMessage.warning(t('persona.errSelfDate'))
    return
  }
  if (form.docIds.length === 0) {
    ElMessage.warning(t('persona.errDocs'))
    return
  }

  submitting.value = true
  try {
    const payload = {
      name: form.name,
      selfDate: form.selfDate,
      docIds: form.docIds,
      summary: form.summary,
      stylePrompt: form.stylePrompt
    }

    if (isEdit.value) {
      await updatePersona(editingId.value, payload)
      ElMessage.success(t('persona.msgUpdated'))
    } else {
      await createPersona(payload)
      ElMessage.success(t('persona.msgCreated'))
    }
    dialogVisible.value = false
    await load()
  } catch (e) {
    /* 已提示 */
  } finally {
    submitting.value = false
  }
}

const doDelete = async (item) => {
  try {
    await deletePersona(item.id)
    ElMessage.success(t('persona.msgDeleted'))
    await load()
  } catch (e) {
    /* 已提示 */
  }
}

/**
 * 「和那时的我对话」。
 *
 * 对话要调大模型，属于下一步——这里明确说一句，而不是跳到尚且不存在的对话页
 * （旧版这里直接 router.push('/chat')，那个页面在新版里没挂载）。
 */
const goChat = () => {
  ElMessage.info(t('persona.chatNotReady'))
}

onMounted(reloadAll)
</script>

<style scoped>
.persona-card {
  margin-bottom: var(--sp-4);
}
.persona-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: var(--sp-3);
  flex-wrap: wrap;
}
.persona-title {
  display: flex;
  align-items: baseline;
  gap: var(--sp-2);
  min-width: 0;
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
.summary,
.style {
  margin: 0 0 var(--sp-3);
  font-size: var(--fs-base);
  line-height: var(--lh-loose);
  color: var(--mt-text);
  white-space: pre-wrap;
}
.style {
  color: var(--mt-text-sub);
}
.placeholder {
  margin: 0 0 var(--sp-3);
  font-size: var(--fs-sm);
  color: var(--mt-text-faint);
}
.tip {
  font-size: var(--fs-xs);
  line-height: var(--lh-base);
  color: var(--mt-text-faint);
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

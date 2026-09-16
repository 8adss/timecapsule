<template>
  <div class="page">
    <div class="page-head">
      <div>
        <h1 class="page-title">{{ t('knowledge.title') }}</h1>
        <p class="page-desc">{{ t('knowledge.desc') }}</p>
      </div>
      <div class="page-actions">
        <!-- 批量删除只在真的勾了东西时出现：否则它是个永远点不动的按钮 -->
        <el-button v-if="selection.length > 0" type="danger" plain @click="doBatchDelete">
          {{ t('knowledge.batchDelete', { n: selection.length }) }}
        </el-button>
        <el-button type="primary" @click="openCreate">{{ t('knowledge.import') }}</el-button>
      </div>
    </div>

    <el-card shadow="never">
      <div class="toolbar">
        <el-input
          v-model="keyword"
          :placeholder="t('knowledge.searchPlaceholder')"
          clearable
          class="toolbar-search"
        />
        <el-select v-model="sortBy" class="toolbar-sort">
          <el-option :label="t('knowledge.sortCreated')" :value="SORT_BY.CREATED" />
          <el-option :label="t('knowledge.sortChars')" :value="SORT_BY.CHARS" />
          <el-option :label="t('knowledge.sortTitle')" :value="SORT_BY.TITLE" />
        </el-select>
      </div>

      <el-table
        ref="tableRef"
        v-loading="loading"
        :data="rows"
        border
        stripe
        row-key="id"
        :empty-text="keyword.trim() ? t('knowledge.emptySearch') : t('knowledge.empty')"
        @selection-change="onSelectionChange"
      >
        <el-table-column type="selection" width="46" />
        <el-table-column
          prop="title"
          :label="t('knowledge.colTitle')"
          min-width="180"
          show-overflow-tooltip
        />
        <el-table-column :label="t('knowledge.colSource')" width="150" show-overflow-tooltip>
          <template #default="{ row }">{{ sourceLabel(row) }}</template>
        </el-table-column>
        <el-table-column :label="t('knowledge.colChars')" width="90">
          <template #default="{ row }">{{ countChars(row.content) }}</template>
        </el-table-column>
        <el-table-column :label="t('knowledge.colPreview')" min-width="240" show-overflow-tooltip>
          <template #default="{ row }">
            <span class="preview">{{ buildPreview(row.content) }}</span>
          </template>
        </el-table-column>
        <el-table-column :label="t('knowledge.colCreated')" width="160">
          <template #default="{ row }">{{ formatDateTime(row.createdAt) }}</template>
        </el-table-column>
        <el-table-column :label="t('knowledge.colActions')" width="200" fixed="right">
          <template #default="{ row }">
            <el-button size="small" @click="openDetail(row)">{{ t('knowledge.actView') }}</el-button>
            <el-button size="small" @click="openEdit(row)">{{ t('knowledge.actEdit') }}</el-button>
            <el-popconfirm :title="t('knowledge.deleteConfirm')" @confirm="doDelete(row)">
              <template #reference>
                <el-button size="small" type="danger">{{ t('knowledge.actDelete') }}</el-button>
              </template>
            </el-popconfirm>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <!-- 导入 / 编辑共用一个弹窗：字段完全一样，差别只在标题与提交时调哪个接口 -->
    <el-dialog
      v-model="dialogVisible"
      :title="isEdit ? t('knowledge.editTitle') : t('knowledge.importTitle')"
      width="680px"
    >
      <el-form label-width="80px">
        <el-form-item :label="t('knowledge.titleLabel')" required>
          <el-input
            v-model="form.title"
            :placeholder="t('knowledge.titlePlaceholder')"
            :maxlength="LIMITS.title"
          />
        </el-form-item>
        <el-form-item :label="t('knowledge.contentLabel')" required>
          <!--
            编辑时不提供「选文件」：来源记录的是「当时怎么进来的」，
            事后改正文不该把它变成另一个来源。所以只让改标题与正文。
          -->
          <div v-if="!isEdit" class="upload-row">
            <input
              ref="fileInput"
              type="file"
              :accept="ACCEPT"
              hidden
              @change="onFilePicked"
            />
            <el-button size="small" @click="pickFile">{{ t('knowledge.pickFile') }}</el-button>
            <span class="upload-tip">{{ t('knowledge.uploadTip') }}</span>
          </div>
          <el-input
            v-model="form.content"
            type="textarea"
            :rows="12"
            :maxlength="LIMITS.content"
            show-word-limit
            :placeholder="t('knowledge.contentPlaceholder')"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">{{ t('knowledge.cancel') }}</el-button>
        <el-button type="primary" :loading="submitting" @click="doSubmit">
          {{ isEdit ? t('knowledge.save') : t('knowledge.submitImport') }}
        </el-button>
      </template>
    </el-dialog>

    <!-- 查看详情 -->
    <el-dialog v-model="detailVisible" :title="t('knowledge.detailTitle')" width="720px">
      <template v-if="detail">
        <div class="detail-title">{{ detail.title }}</div>
        <div class="detail-meta">
          <span>{{ t('knowledge.metaChars', { n: countChars(detail.content) }) }}</span>
          <span>{{ sourceLabel(detail) }}</span>
          <span>{{ t('knowledge.metaCreated', { time: formatDateTime(detail.createdAt) }) }}</span>
          <span v-if="detail.updatedAt !== detail.createdAt">
            {{ t('knowledge.metaUpdated', { time: formatDateTime(detail.updatedAt) }) }}
          </span>
        </div>
        <pre class="detail-body">{{ detail.content }}</pre>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
// ElMessage / ElMessageBox 由 unplugin-auto-import 自动引入，见 vite.config.js
import {
  buildPreview,
  countChars,
  createDoc,
  deleteDoc,
  deleteDocs,
  KNOWLEDGE_LIMITS as LIMITS,
  listDocs,
  queryDocs,
  SOURCE_TYPE,
  SORT_BY,
  updateDoc
} from '../api/knowledge'
import { formatDateTime } from '../utils/date'

const { t } = useI18n()

/** 可导入的文件类型。与旧版一致：只读纯文本，不做 Word / PDF 解析。 */
const ACCEPT = '.txt,.md,.markdown,.csv,.json,.log'

/** 存储里的全部文档（含已删除，由 api 层过滤掉） */
const docs = ref([])
const loading = ref(false)
const submitting = ref(false)

const keyword = ref('')
const sortBy = ref(SORT_BY.CREATED)
const selection = ref([])
const tableRef = ref(null)

const dialogVisible = ref(false)
const detailVisible = ref(false)
const detail = ref(null)
const fileInput = ref(null)

/** 正在编辑的那一篇的 id；为空表示这是「导入」而不是「编辑」 */
const editingId = ref('')
const form = reactive({ title: '', content: '' })
/** 正文是不是刚从文件读进来的，用来给文档打「文件 / 粘贴」标签 */
const fromFile = ref(false)
const originName = ref('')

const isEdit = computed(() => editingId.value !== '')

/**
 * 表格数据：过滤 + 排序都在内存里算。
 * 数据本来就在本地，为每次敲键再走一遍异步仓储没有任何意义。
 */
const rows = computed(() => queryDocs(docs.value, {
  keyword: keyword.value,
  sortBy: sortBy.value
}))

const load = async () => {
  loading.value = true
  try {
    docs.value = await listDocs()
  } finally {
    loading.value = false
  }
}

/**
 * 清空勾选。
 *
 * 列表内容一变就必须清一次：`el-table` 的勾选状态挂在行对象上，
 * 筛选之后被滤掉的行会留下「看不见但还勾着」的幽灵，
 * 此时点批量删除，删掉的东西和屏幕上显示的对不上。
 */
const resetSelection = () => {
  selection.value = []
  tableRef.value?.clearSelection()
}

const onSelectionChange = (picked) => {
  selection.value = picked
}

watch([keyword, sortBy], resetSelection)

const openCreate = () => {
  editingId.value = ''
  form.title = ''
  form.content = ''
  fromFile.value = false
  originName.value = ''
  dialogVisible.value = true
}

const openEdit = (row) => {
  editingId.value = row.id
  form.title = row.title
  form.content = row.content
  fromFile.value = row.sourceType === SOURCE_TYPE.FILE
  originName.value = row.originName ?? ''
  dialogVisible.value = true
}

const openDetail = (row) => {
  // 本地存储里整篇正文就在手上，不必再查一次
  detail.value = row
  detailVisible.value = true
}

const pickFile = () => fileInput.value?.click()

/** 纯前端把本地文本文件读成文字，填进输入框——与旧版行为一致 */
const onFilePicked = (event) => {
  const file = event.target.files?.[0]
  if (!file) return

  const reader = new FileReader()
  reader.onload = () => {
    form.content = String(reader.result || '')
    fromFile.value = true
    originName.value = file.name
    if (!form.title.trim()) {
      form.title = file.name.replace(/\.[^.]+$/, '')
    }
    ElMessage.success(t('knowledge.fileRead', { name: file.name, n: form.content.length }))
  }
  reader.onerror = () => ElMessage.error(t('knowledge.fileReadFailed'))
  reader.readAsText(file, 'utf-8')
  // 清掉 value，否则连续选同一个文件不会再触发 change
  event.target.value = ''
}

const doSubmit = async () => {
  if (!form.title.trim()) {
    ElMessage.warning(t('knowledge.errTitle'))
    return
  }
  if (!form.content.trim()) {
    ElMessage.warning(t('knowledge.errContent'))
    return
  }

  submitting.value = true
  try {
    if (isEdit.value) {
      await updateDoc(editingId.value, { title: form.title, content: form.content })
      ElMessage.success(t('knowledge.msgUpdated'))
    } else {
      await createDoc({
        title: form.title,
        content: form.content,
        sourceType: fromFile.value ? SOURCE_TYPE.FILE : SOURCE_TYPE.PASTE,
        originName: originName.value
      })
      ElMessage.success(t('knowledge.msgImported'))
    }
    dialogVisible.value = false
    await load()
    resetSelection()
  } catch (e) {
    /* 已提示 */
  } finally {
    submitting.value = false
  }
}

const doDelete = async (row) => {
  try {
    await deleteDoc(row.id)
    ElMessage.success(t('knowledge.msgDeleted'))
    await load()
    resetSelection()
  } catch (e) {
    /* 已提示 */
  }
}

const doBatchDelete = async () => {
  const ids = selection.value.map((row) => row.id)
  if (ids.length === 0) return

  try {
    await ElMessageBox.confirm(
      t('knowledge.batchDeleteConfirm', { n: ids.length }),
      t('knowledge.batchDeleteTitle'),
      { type: 'warning', confirmButtonText: t('common.confirm'), cancelButtonText: t('common.cancel') }
    )
  } catch {
    return
  }

  try {
    const removed = await deleteDocs(ids)
    ElMessage.success(t('knowledge.msgBatchDeleted', { n: removed }))
    await load()
    resetSelection()
  } catch (e) {
    /* 已提示 */
  }
}

/** 来源标签：文件来的带上原文件名，否则「文件」两个字认不出是哪一篇 */
const sourceLabel = (row) => {
  if (row.sourceType !== SOURCE_TYPE.FILE) return t('knowledge.sourcePaste')
  return row.originName
    ? t('knowledge.sourceWithName', { name: row.originName })
    : t('knowledge.sourceFile')
}

onMounted(load)
</script>

<style scoped>
.toolbar {
  display: flex;
  align-items: center;
  gap: var(--sp-3);
  margin-bottom: var(--sp-4);
}
.toolbar-search {
  max-width: 320px;
}
.toolbar-sort {
  width: 160px;
}

.preview {
  color: var(--mt-text-sub);
  font-size: var(--fs-sm);
}

.upload-row {
  display: flex;
  align-items: center;
  gap: var(--sp-3);
  margin-bottom: var(--sp-3);
}
.upload-tip {
  font-size: var(--fs-xs);
  color: var(--mt-text-faint);
}

.detail-title {
  font-size: var(--fs-lg);
  font-weight: 600;
  color: var(--mt-text);
  margin-bottom: var(--sp-2);
}
.detail-meta {
  display: flex;
  flex-wrap: wrap;
  gap: var(--sp-4);
  font-size: var(--fs-xs);
  color: var(--mt-text-muted);
  margin-bottom: var(--sp-3);
}
.detail-body {
  margin: 0;
  padding: var(--sp-4);
  max-height: 52vh;
  overflow-y: auto;
  background: var(--mt-surface-alt);
  border-radius: var(--radius);
  font-size: var(--fs-sm);
  line-height: var(--lh-loose);
  color: var(--mt-text);
  white-space: pre-wrap;
  word-break: break-word;
  font-family: inherit;
}
</style>

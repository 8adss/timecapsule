<template>
  <div class="page">
    <div class="page-head">
      <div>
        <h1 class="page-title">知识库</h1>
        <p class="page-desc">导入你写过的自我介绍、日记、笔记等个人资料，它们会被用来蒸馏出「何时的自己」</p>
      </div>
      <div class="page-actions">
        <el-button type="primary" @click="openCreate">导入文档</el-button>
      </div>
    </div>

    <el-card shadow="never" v-loading="loading">
      <el-table
        :data="docs"
        stripe
        empty-text="还没有导入任何资料。点右上角「导入文档」，先放几篇你写过的文字进来"
      >
        <el-table-column prop="title" label="标题" min-width="180" show-overflow-tooltip />
        <el-table-column label="来源" width="100">
          <template #default="{ row }">
            <el-tag :type="row.sourceType === 'FILE' ? 'warning' : 'info'" size="small" effect="plain">
              {{ row.sourceType === 'FILE' ? '文件' : '粘贴' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="charCount" label="字数" width="90" />
        <el-table-column label="预览" min-width="240" show-overflow-tooltip>
          <template #default="{ row }">
            <span class="preview">{{ row.preview }}</span>
          </template>
        </el-table-column>
        <el-table-column label="导入时间" width="160">
          <template #default="{ row }">{{ formatDateTime(row.createdAt) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="150" fixed="right">
          <template #default="{ row }">
            <el-button size="small" @click="openDetail(row)">查看</el-button>
            <el-popconfirm title="确定删除这篇文档吗？" @confirm="doDelete(row)">
              <template #reference>
                <el-button size="small" type="danger">删除</el-button>
              </template>
            </el-popconfirm>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <!-- 导入文档 -->
    <el-dialog v-model="dialogVisible" title="导入文档" width="640px">
      <el-form label-width="80px">
        <el-form-item label="标题" required>
          <el-input v-model="form.title" placeholder="例如：关于我（2026 年版）" maxlength="200" />
        </el-form-item>
        <el-form-item label="正文" required>
          <div class="upload-row">
            <input ref="fileInput" type="file" accept=".txt,.md,.markdown,.csv,.json,.log" hidden @change="onFilePicked" />
            <el-button size="small" @click="pickFile">选择 .txt / .md 文件</el-button>
            <span class="upload-tip">选择后会读成文本填进下面的输入框，也可以直接粘贴</span>
          </div>
          <el-input
            v-model="form.content"
            type="textarea"
            :rows="12"
            maxlength="200000"
            show-word-limit
            placeholder="把自我介绍、日记、读书笔记、年度总结这类「你写的文字」贴进来，越贴近你真实的样子，生成的分身越像你"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="doCreate">导入</el-button>
      </template>
    </el-dialog>

    <!-- 查看详情 -->
    <el-dialog v-model="detailVisible" :title="detail?.title || '文档详情'" width="700px">
      <div class="detail-meta">
        {{ detail?.charCount }} 字 · 导入于 {{ formatDateTime(detail?.createdAt) }}
      </div>
      <pre class="detail-body">{{ detail?.content }}</pre>
    </el-dialog>
  </div>
</template>

<script setup>
import { onMounted, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { createDoc, deleteDoc, getDoc, listDocs } from '../api/knowledge'
import { useUserStore } from '../stores/user'
import { formatDateTime } from '../utils/date'

const userStore = useUserStore()

const docs = ref([])
const loading = ref(false)
const submitting = ref(false)
const dialogVisible = ref(false)
const detailVisible = ref(false)
const detail = ref(null)
const fileInput = ref(null)

const form = reactive({ title: '', content: '' })
/** 记录正文是来自文件还是粘贴，用于给文档打来源标签 */
const fromFile = ref(false)

const load = async () => {
  loading.value = true
  try {
    docs.value = await listDocs(userStore.userId)
  } finally {
    loading.value = false
  }
}

const openCreate = () => {
  form.title = ''
  form.content = ''
  fromFile.value = false
  dialogVisible.value = true
}

const pickFile = () => fileInput.value?.click()

/** 纯前端读取本地文本文件，内容通过普通 JSON 接口提交，后端不需要处理文件上传 */
const onFilePicked = (event) => {
  const file = event.target.files?.[0]
  if (!file) return

  const reader = new FileReader()
  reader.onload = () => {
    form.content = String(reader.result || '')
    fromFile.value = true
    if (!form.title.trim()) {
      form.title = file.name.replace(/\.[^.]+$/, '')
    }
    ElMessage.success(`已读取 ${file.name}（${form.content.length} 字）`)
  }
  reader.onerror = () => ElMessage.error('文件读取失败')
  reader.readAsText(file, 'utf-8')
  // 允许重复选择同一个文件
  event.target.value = ''
}

const doCreate = async () => {
  if (!form.title.trim()) {
    ElMessage.warning('请填写标题')
    return
  }
  if (!form.content.trim()) {
    ElMessage.warning('正文不能为空')
    return
  }
  submitting.value = true
  try {
    await createDoc({
      userId: userStore.userId,
      title: form.title.trim(),
      content: form.content,
      sourceType: fromFile.value ? 'FILE' : 'PASTE'
    })
    ElMessage.success('已导入知识库')
    dialogVisible.value = false
    await load()
  } catch (e) {
    /* 已提示 */
  } finally {
    submitting.value = false
  }
}

const openDetail = async (row) => {
  detail.value = await getDoc(row.id, userStore.userId)
  detailVisible.value = true
}

const doDelete = async (row) => {
  try {
    await deleteDoc(row.id, userStore.userId)
    ElMessage.success('已删除')
    await load()
  } catch (e) {
    /* 已提示 */
  }
}

onMounted(load)
</script>

<style scoped>
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
.detail-meta {
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

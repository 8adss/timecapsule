<template>
  <div class="page">
    <div class="page-head">
      <div>
        <h1 class="page-title">设置</h1>
        <p class="page-desc">数据存储与关于</p>
      </div>
    </div>

    <el-card shadow="never" class="card">
      <template #header>
        <span class="card-title">数据存储</span>
      </template>

      <div class="row">
        <span class="label">存储位置</span>
        <span class="value">
          本机浏览器（{{ storageMode === 'memory' ? '内存模式' : 'IndexedDB' }}）
        </span>
      </div>
      <div class="row">
        <span class="label">联网情况</span>
        <span class="value">完全离线可用，不会向任何服务器发送数据</span>
      </div>

      <el-alert
        class="warn"
        type="warning"
        :closable="false"
        show-icon
        title="数据只存在这台设备上"
        description="清除浏览器数据、使用无痕模式、或更换设备都会导致数据消失。请定期导出备份。"
      />
    </el-card>

    <el-card shadow="never" class="card">
      <template #header>
        <span class="card-title">备份与恢复</span>
      </template>

      <div class="action-row">
        <el-button type="primary" :loading="exporting" @click="doExport">导出全部数据</el-button>
        <span class="action-hint">
          下载一个 JSON 文件，包含任务、胶囊、成就与个人资料
        </span>
      </div>

      <el-divider />

      <div class="field">
        <div class="field-label">导入方式</div>
        <el-radio-group v-model="importMode" :disabled="importing">
          <el-radio value="merge">合并</el-radio>
          <el-radio value="replace">覆盖</el-radio>
        </el-radio-group>
        <div class="field-hint">
          <template v-if="importMode === 'merge'">
            <strong>合并</strong>：把备份里独有的条目加进来；同一条目两边都有时取较新的那份。
            适合把另一台设备的数据并过来。注意「较新」也包括删除状态——
            若备份里某条记录是较新的已删除状态，本机对应的记录也会被删掉。
          </template>
          <template v-else>
            <strong>覆盖</strong>：清空现有数据后整体写入备份内容。
            适合在新设备上恢复，或用一份旧备份回到过去的状态。
          </template>
        </div>
      </div>

      <div class="action-row">
        <el-upload
          :show-file-list="false"
          :before-upload="beforeImport"
          :http-request="doImport"
          accept=".json,application/json"
        >
          <el-button :loading="importing">导入备份文件</el-button>
        </el-upload>
        <span class="action-hint">导入前会自动保存一份当前数据的快照，可随时回滚</span>
      </div>

      <el-divider />

      <div class="action-row">
        <el-button v-if="snapshot" @click="doRollback">回滚到上次操作前</el-button>
        <el-button v-else disabled>回滚到上次操作前</el-button>
        <span v-if="snapshot" class="action-hint">
          快照时间：{{ formatDateTime(snapshot.createdAt) }}（{{ reasonText }}）
        </span>
        <span v-else class="action-hint">暂无可回滚的快照</span>
      </div>
    </el-card>

    <el-card shadow="never" class="card">
      <template #header>
        <span class="card-title danger-title">危险操作</span>
      </template>
      <div class="action-row">
        <el-button type="danger" plain @click="doClear">清空全部数据</el-button>
        <span class="action-hint">
          删除本机的任务、胶囊与成就。操作前会自动存一份快照，可以回滚。
        </span>
      </div>
    </el-card>

    <el-card shadow="never" class="card">
      <template #header>
        <span class="card-title">关于</span>
      </template>
      <div class="row">
        <span class="label">应用</span>
        <span class="value">TimeCapsule · 时间胶囊</span>
      </div>
      <div class="row">
        <span class="label">版本</span>
        <span class="value">{{ version }}</span>
      </div>
      <div class="row">
        <span class="label">架构</span>
        <span class="value">本地优先 · 无账号 · 无后端</span>
      </div>
    </el-card>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
// ElMessage / ElMessageBox 由 unplugin-auto-import 自动引入，见 vite.config.js
import {
  exportBackup,
  getSnapshot,
  importFromFile,
  rollbackToSnapshot,
  wipeAllData
} from '../api/backup'
import { useUserStore } from '../stores/user'
import { formatDateTime } from '../utils/date'
import { detectStorageMode } from '../storage'

const userStore = useUserStore()

const version = ref(__APP_VERSION__)
const storageMode = ref(detectStorageMode())

const exporting = ref(false)
const importing = ref(false)
const importMode = ref('merge')
const snapshot = ref(null)

/** 快照来源的中文说明，让用户知道回滚会回到哪一步之前。 */
const reasonText = computed(() => {
  const reason = snapshot.value?.reason ?? ''
  if (reason.startsWith('import:replace')) return '覆盖导入前'
  if (reason.startsWith('import:merge')) return '合并导入前'
  if (reason === 'clear') return '清空数据前'
  if (reason === 'restore') return '上次回滚前'
  return '未知操作'
})

const refreshSnapshot = async () => {
  snapshot.value = await getSnapshot()
}

/**
 * 导出。
 *
 * 导出本身不改变任何数据，所以只在成功后给一条带条数的提示——
 * 用户需要确认「导出的确实是有内容的」，而空白备份是最容易发生的意外。
 */
const doExport = async () => {
  exporting.value = true
  try {
    const counts = await exportBackup()
    ElMessage.success(
      `已导出：${counts.tasks} 条任务、${counts.capsules} 条胶囊、${counts.achievements} 个成就`
    )
  } catch (e) {
    /* 已提示 */
  } finally {
    exporting.value = false
  }
}

/** 选文件前的预检：只挡明显的非 JSON，真正的校验在导入流程里做。 */
const beforeImport = (file) => {
  const name = (file.name || '').toLowerCase()
  if (!name.endsWith('.json')) {
    ElMessage.error('请选择 .json 格式的备份文件')
    return false
  }
  return true
}

/**
 * 执行导入。
 *
 * 覆盖模式是破坏性的，所以额外做一次确认；合并模式不删数据，问一次只会烦人。
 * 无论哪种模式，仓储层都会在落盘前自动存快照，确认框里如实告知。
 */
const doImport = async ({ file }) => {
  if (importMode.value === 'replace') {
    try {
      await ElMessageBox.confirm(
        '覆盖导入会先清空当前的任务、胶囊与成就，再写入备份内容。操作前会自动保存快照，可以回滚。确定继续吗？',
        '确认覆盖导入',
        { type: 'warning', confirmButtonText: '继续导入', cancelButtonText: '取消' }
      )
    } catch {
      return
    }
  }

  importing.value = true
  try {
    const result = await importFromFile(file, importMode.value)
    await Promise.all([userStore.refresh(), refreshSnapshot()])
    ElMessage.success(
      `导入完成：现有 ${result.counts.tasks} 条任务、${result.counts.capsules} 条胶囊。`
      + '切换到任务或胶囊页即可看到最新数据。'
    )
  } catch (e) {
    /* 已提示；校验失败时存储未被改动 */
  } finally {
    importing.value = false
  }
}

const doRollback = async () => {
  try {
    await ElMessageBox.confirm(
      '将把数据恢复到这份快照记录的时点。当前数据会先被存成新快照，所以这一步同样可以再回滚。确定继续吗？',
      '确认回滚',
      { type: 'warning', confirmButtonText: '回滚', cancelButtonText: '取消' }
    )
  } catch {
    return
  }

  try {
    const result = await rollbackToSnapshot()
    await Promise.all([userStore.refresh(), refreshSnapshot()])
    ElMessage.success(
      `已回滚：${result.restored.tasks} 条任务、${result.restored.capsules} 条胶囊`
    )
  } catch (e) {
    /* 已提示 */
  }
}

const doClear = async () => {
  try {
    await ElMessageBox.confirm(
      '这会删除本机全部任务、胶囊与成就。操作前会自动保存快照，之后可以回滚。确定清空吗？',
      '确认清空数据',
      { type: 'warning', confirmButtonText: '清空', cancelButtonText: '取消' }
    )
  } catch {
    return
  }

  try {
    await wipeAllData()
    await Promise.all([userStore.refresh(), refreshSnapshot()])
    ElMessage.success('数据已清空，可随时回滚')
  } catch (e) {
    /* 已提示 */
  }
}

onMounted(refreshSnapshot)
</script>

<style scoped>
.card {
  margin-bottom: var(--sp-4);
}
.card-title {
  font-size: var(--fs-base);
  font-weight: 600;
  color: var(--mt-text);
}
.danger-title {
  color: #b4553f;
}
.row {
  display: flex;
  gap: var(--sp-3);
  padding: 6px 0;
  font-size: var(--fs-sm);
}
.label {
  width: 84px;
  flex-shrink: 0;
  color: var(--mt-text-faint);
}
.value {
  color: var(--mt-text-sub);
}
.warn {
  margin-top: var(--sp-3);
}
.action-row {
  display: flex;
  align-items: center;
  gap: var(--sp-3);
  flex-wrap: wrap;
}
.action-hint {
  font-size: var(--fs-xs);
  color: var(--mt-text-faint);
  line-height: var(--lh-base);
}
.field {
  margin-bottom: var(--sp-4);
}
.field-label {
  margin-bottom: var(--sp-2);
  font-size: var(--fs-sm);
  color: var(--mt-text-sub);
}
.field-hint {
  margin-top: var(--sp-2);
  font-size: var(--fs-xs);
  line-height: var(--lh-base);
  color: var(--mt-text-faint);
}
.field-hint strong {
  color: var(--mt-text-muted);
}
</style>

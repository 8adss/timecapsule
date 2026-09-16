<template>
  <div class="page">
    <div class="page-head">
      <div>
        <h1 class="page-title">{{ t('settings.title') }}</h1>
        <p class="page-desc">{{ t('settings.desc') }}</p>
      </div>
    </div>

    <el-card shadow="never" class="card">
      <template #header>
        <span class="card-title">{{ t('settings.storageTitle') }}</span>
      </template>

      <div class="row">
        <span class="label">{{ t('settings.storageLocation') }}</span>
        <span class="value">
          {{ storageMode === 'memory' ? t('settings.storageMemory') : t('settings.storageIndexedDb') }}
        </span>
      </div>
      <div class="row">
        <span class="label">{{ t('settings.network') }}</span>
        <span class="value">{{ t('settings.offlineNote') }}</span>
      </div>

      <el-alert
        class="warn"
        type="warning"
        :closable="false"
        show-icon
        :title="t('settings.warnTitle')"
        :description="t('settings.warnDesc')"
      />
    </el-card>

    <el-card shadow="never" class="card">
      <template #header>
        <span class="card-title">{{ t('settings.backupTitle') }}</span>
      </template>

      <div class="action-row">
        <el-button type="primary" :loading="exporting" @click="doExport">
          {{ t('settings.export') }}
        </el-button>
        <span class="action-hint">{{ t('settings.exportHint') }}</span>
      </div>

      <el-divider />

      <div class="field">
        <div class="field-label">{{ t('settings.importMode') }}</div>
        <el-radio-group v-model="importMode" :disabled="importing">
          <el-radio value="merge">{{ t('settings.modeMerge') }}</el-radio>
          <el-radio value="replace">{{ t('settings.modeReplace') }}</el-radio>
        </el-radio-group>
        <div class="field-hint">
          {{ importMode === 'merge' ? t('settings.mergeHint') : t('settings.replaceHint') }}
        </div>
      </div>

      <div class="action-row">
        <el-upload
          :show-file-list="false"
          :before-upload="beforeImport"
          :http-request="doImport"
          accept=".json,application/json"
        >
          <el-button :loading="importing">{{ t('settings.import') }}</el-button>
        </el-upload>
        <span class="action-hint">{{ t('settings.importHint') }}</span>
      </div>

      <el-divider />

      <div class="action-row">
        <el-button v-if="snapshot" @click="doRollback">{{ t('settings.rollback') }}</el-button>
        <el-button v-else disabled>{{ t('settings.rollback') }}</el-button>
        <span v-if="snapshot" class="action-hint">
          {{ t('settings.rollbackAt', { time: formatDateTime(snapshot.createdAt), reason: reasonText }) }}
        </span>
        <span v-else class="action-hint">{{ t('settings.rollbackNone') }}</span>
      </div>
    </el-card>

    <el-card shadow="never" class="card">
      <template #header>
        <span class="card-title danger-title">{{ t('settings.dangerTitle') }}</span>
      </template>
      <div class="action-row">
        <el-button type="danger" plain @click="doClear">{{ t('settings.clear') }}</el-button>
        <span class="action-hint">{{ t('settings.clearHint') }}</span>
      </div>
    </el-card>

    <el-card shadow="never" class="card">
      <template #header>
        <span class="card-title">{{ t('settings.aboutTitle') }}</span>
      </template>

      <div class="field">
        <div class="field-label">{{ t('settings.language') }}</div>
        <el-radio-group v-model="currentLocale" @change="changeLocale">
          <el-radio v-for="item in SUPPORTED_LOCALES" :key="item.value" :value="item.value">
            {{ item.label }}
          </el-radio>
        </el-radio-group>
        <div class="field-hint">{{ t('settings.languageHint') }}</div>
      </div>

      <el-divider />

      <div class="row">
        <span class="label">{{ t('settings.aboutApp') }}</span>
        <span class="value">TimeCapsule · {{ t('app.name') }}</span>
      </div>
      <div class="row">
        <span class="label">{{ t('settings.aboutVersion') }}</span>
        <span class="value">{{ version }}</span>
      </div>
      <div class="row">
        <span class="label">{{ t('settings.aboutArch') }}</span>
        <span class="value">{{ t('settings.aboutArchValue') }}</span>
      </div>
    </el-card>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
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
import { SUPPORTED_LOCALES, getLocale, setLocale } from '../i18n'

const { t } = useI18n()
const userStore = useUserStore()

const version = ref(__APP_VERSION__)
const storageMode = ref(detectStorageMode())

const exporting = ref(false)
const importing = ref(false)
const importMode = ref('merge')
const snapshot = ref(null)

const currentLocale = ref(getLocale())

const changeLocale = (value) => {
  setLocale(value)
  currentLocale.value = value
}

/** 快照来源的说明，让用户知道回滚会回到哪一步之前。 */
const reasonText = computed(() => {
  const reason = snapshot.value?.reason ?? ''
  if (reason.startsWith('import:replace')) return t('settings.reasonImportReplace')
  if (reason.startsWith('import:merge')) return t('settings.reasonImportMerge')
  if (reason === 'clear') return t('settings.reasonClear')
  if (reason === 'restore') return t('settings.reasonRestore')
  return t('settings.reasonUnknown')
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
    ElMessage.success(t('settings.exportDone', counts))
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
    ElMessage.error(t('settings.importNotJson'))
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
        t('settings.importConfirm'),
        t('settings.importConfirmTitle'),
        { type: 'warning', confirmButtonText: t('settings.importConfirmOk'), cancelButtonText: t('common.cancel') }
      )
    } catch {
      return
    }
  }

  importing.value = true
  try {
    const result = await importFromFile(file, importMode.value)
    await Promise.all([userStore.refresh(), refreshSnapshot()])
    ElMessage.success(t('settings.importDone', result.counts))
  } catch (e) {
    /* 已提示；校验失败时存储未被改动 */
  } finally {
    importing.value = false
  }
}

const doRollback = async () => {
  try {
    await ElMessageBox.confirm(
      t('settings.rollbackConfirm'),
      t('settings.rollbackConfirmTitle'),
      { type: 'warning', confirmButtonText: t('settings.rollbackConfirmOk'), cancelButtonText: t('common.cancel') }
    )
  } catch {
    return
  }

  try {
    const result = await rollbackToSnapshot()
    await Promise.all([userStore.refresh(), refreshSnapshot()])
    ElMessage.success(t('settings.rollbackDone', result.restored))
  } catch (e) {
    /* 已提示 */
  }
}

const doClear = async () => {
  try {
    await ElMessageBox.confirm(
      t('settings.clearConfirm'),
      t('settings.clearConfirmTitle'),
      { type: 'warning', confirmButtonText: t('settings.clearConfirmOk'), cancelButtonText: t('common.cancel') }
    )
  } catch {
    return
  }

  try {
    await wipeAllData()
    await Promise.all([userStore.refresh(), refreshSnapshot()])
    ElMessage.success(t('settings.clearDone'))
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
</style>

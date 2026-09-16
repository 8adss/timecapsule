<template>
  <div class="page">
    <div class="page-head">
      <div>
        <h1 class="page-title">{{ t('task.title') }}</h1>
        <p class="page-desc">{{ t('task.desc') }}</p>
      </div>
      <div class="page-actions">
        <el-button type="primary" @click="openCreate">{{ t('task.create') }}</el-button>
      </div>
    </div>

    <el-card shadow="never">
      <el-table
        v-loading="loading"
        :data="tasks"
        border
        stripe
        :empty-text="t('task.empty')"
      >
        <el-table-column prop="title" :label="t('task.colTitle')" min-width="180" show-overflow-tooltip />
        <el-table-column :label="t('task.colCategory')" width="100">
          <template #default="{ row }">{{ categoryLabel(row.category) }}</template>
        </el-table-column>
        <el-table-column :label="t('task.colDue')" width="160">
          <template #default="{ row }">{{ formatDateTime(row.dueDate) }}</template>
        </el-table-column>
        <el-table-column :label="t('task.colRemind')" width="160">
          <template #default="{ row }">{{ formatDateTime(row.remindTime) }}</template>
        </el-table-column>
        <el-table-column :label="t('task.colStatus')" width="110">
          <template #default="{ row }">
            <el-tag :type="statusType(row.status)">{{ statusLabel(row.status) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column :label="t('task.colActions')" width="250" fixed="right">
          <template #default="{ row }">
            <el-button v-if="isOpen(row)" size="small" type="success" @click="doComplete(row)">
              {{ t('task.actComplete') }}
            </el-button>
            <el-button size="small" @click="openEdit(row)">{{ t('task.actEdit') }}</el-button>
            <el-button v-if="isOpen(row)" size="small" type="warning" @click="doAbandon(row)">
              {{ t('task.actAbandon') }}
            </el-button>
            <el-popconfirm :title="t('task.deleteConfirm')" @confirm="doDelete(row)">
              <template #reference>
                <el-button size="small" type="danger">{{ t('task.actDelete') }}</el-button>
              </template>
            </el-popconfirm>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <el-dialog
      v-model="dialogVisible"
      :title="isEdit ? t('task.edit') : t('task.create')"
      width="560px"
    >
      <el-form label-width="110px">
        <el-form-item :label="t('task.nameLabel')" required>
          <el-input v-model="form.title" :placeholder="t('task.namePlaceholder')" maxlength="100" />
        </el-form-item>
        <el-form-item :label="t('task.categoryLabel')">
          <el-select v-model="form.category" style="width: 100%">
            <!--
              注意 value 用的是中文字面量而不是语言键。
              类别是**存储值**：它写在 IndexedDB 里，也随导出备份流转，
              换一门语言就变一个值的话，已有数据和旧备份会全部对不上。
              所以只翻译显示用的 label，存进去的始终是这四个中文词。
            -->
            <el-option
              v-for="value in CATEGORY_VALUES"
              :key="value"
              :label="categoryLabel(value)"
              :value="value"
            />
          </el-select>
        </el-form-item>
        <el-form-item :label="t('task.dueLabel')">
          <el-date-picker
            v-model="form.dueDate"
            type="datetime"
            :placeholder="t('task.duePlaceholder')"
            style="width: 100%"
            @change="onDueDateChange"
          />
        </el-form-item>
        <el-form-item :label="t('task.remindLabel')">
          <el-date-picker
            v-model="form.remindTime"
            type="datetime"
            :placeholder="t('task.remindPlaceholder')"
            style="width: 100%"
          />
        </el-form-item>
        <el-form-item :label="t('task.descLabel')">
          <el-input v-model="form.description" :placeholder="t('task.descPlaceholder')" maxlength="500" />
        </el-form-item>

        <!-- 胶囊相关字段只在新建时出现：编辑已有任务不重复封存胶囊 -->
        <template v-if="!isEdit">
          <el-divider>{{ t('task.capsuleDivider') }}</el-divider>
          <el-form-item :label="t('task.capsuleContentLabel')" required>
            <el-input
              v-model="form.capsuleContent"
              type="textarea"
              :rows="4"
              maxlength="5000"
              show-word-limit
              :placeholder="t('task.capsuleContentPlaceholder')"
            />
          </el-form-item>
          <el-form-item :label="t('task.capsuleToDateLabel')" required>
            <el-date-picker
              v-model="form.capsuleToDate"
              type="datetime"
              :placeholder="t('task.capsuleToDatePlaceholder')"
              style="width: 100%"
              @change="capsuleToDateTouched = true"
            />
            <div class="form-tip">{{ t('task.capsuleToDateTip') }}</div>
          </el-form-item>
        </template>
      </el-form>

      <template #footer>
        <el-button @click="dialogVisible = false">{{ t('task.cancel') }}</el-button>
        <el-button type="primary" :loading="submitting" @click="submit">
          {{ isEdit ? t('task.save') : t('task.submitCreate') }}
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { onMounted, reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'
// ElMessage 由 unplugin-auto-import 自动引入，见 vite.config.js
import {
  abandonTask,
  completeTask,
  createTask,
  deleteTask,
  listTasks,
  updateTask
} from '../api/task'
import { useUserStore } from '../stores/user'
import { daysFromNow, formatDateTime, toDateTimeString } from '../utils/date'

const { t } = useI18n()
const userStore = useUserStore()

/** 类别的存储值。顺序即下拉框顺序，值本身永远是中文——理由见模板里的注释。 */
const CATEGORY_VALUES = ['学习', '健身', '工作', '习惯']
/** 存储值 → 语言键。分开写是为了让语言键里不出现中文，便于检索与校对。 */
const CATEGORY_KEY = { 学习: 'study', 健身: 'fitness', 工作: 'work', 习惯: 'habit' }

const STATUS_KEY = {
  0: 'task.statusOngoing',
  1: 'task.statusDone',
  2: 'task.statusOverdue',
  3: 'task.statusAbandoned'
}

const tasks = ref([])
const loading = ref(false)
const submitting = ref(false)
const dialogVisible = ref(false)
const isEdit = ref(false)
const editingId = ref(null)
const capsuleToDateTouched = ref(false)

const form = reactive({
  title: '',
  category: '习惯',
  description: '',
  dueDate: null,
  remindTime: null,
  capsuleContent: '',
  capsuleToDate: null
})

const isOpen = (row) => row.status === 0 || row.status === 2

const categoryLabel = (value) => t(`category.${CATEGORY_KEY[value] ?? 'other'}`)
const statusLabel = (status) => t(STATUS_KEY[status] ?? 'task.statusUnknown')
const statusType = (status) => ({ 0: 'primary', 1: 'success', 2: 'danger', 3: 'info' }[status] ?? 'info')

const load = async () => {
  loading.value = true
  try {
    tasks.value = await listTasks()
  } finally {
    loading.value = false
  }
}

/** 胶囊开启时间的推荐值：优先跟随截止时间，否则 7 天后（绝不能是"现在"，否则会立即开启） */
const suggestCapsuleToDate = () => {
  const due = form.dueDate
  if (due && due.getTime() > Date.now() + 60000) {
    return new Date(due)
  }
  return daysFromNow(7)
}

const onDueDateChange = () => {
  if (!isEdit.value && !capsuleToDateTouched.value) {
    form.capsuleToDate = suggestCapsuleToDate()
  }
}

const resetForm = () => {
  form.title = ''
  form.category = '习惯'
  form.description = ''
  form.dueDate = null
  form.remindTime = null
  form.capsuleContent = ''
  form.capsuleToDate = daysFromNow(7)
  capsuleToDateTouched.value = false
}

const openCreate = () => {
  isEdit.value = false
  editingId.value = null
  resetForm()
  dialogVisible.value = true
}

/** 存储里放的是 'yyyy-MM-dd HH:mm:ss'，要转成 Date 才能回填给日期选择器 */
const parseToDate = (value) => {
  if (!value) return null
  const date = new Date(String(value).replace(' ', 'T'))
  return Number.isNaN(date.getTime()) ? null : date
}

const openEdit = (row) => {
  isEdit.value = true
  editingId.value = row.id
  form.title = row.title
  form.category = row.category || '习惯'
  form.description = row.description || ''
  form.dueDate = parseToDate(row.dueDate)
  form.remindTime = parseToDate(row.remindTime)
  dialogVisible.value = true
}

const submit = async () => {
  // 这几条校验放在这里而不是依赖仓储层抛错：弹窗里的即时反馈比一次往返更直接。
  // 仓储层仍然会再校验一遍——那一层才是权威。
  if (!form.title.trim()) {
    ElMessage.warning(t('task.errName'))
    return
  }
  if (!isEdit.value) {
    if (!form.capsuleContent.trim()) {
      ElMessage.warning(t('task.errCapsuleContent'))
      return
    }
    if (!form.capsuleToDate) {
      ElMessage.warning(t('task.errCapsuleToDate'))
      return
    }
  }

  submitting.value = true
  try {
    const payload = {
      title: form.title.trim(),
      category: form.category,
      description: form.description,
      dueDate: toDateTimeString(form.dueDate),
      remindTime: toDateTimeString(form.remindTime)
    }

    if (isEdit.value) {
      await updateTask(editingId.value, payload)
      ElMessage.success(t('task.msgUpdated'))
    } else {
      // 任务与胶囊由仓储层在同一个 IndexedDB 事务里一起写入，不会出现"有任务没胶囊"
      await createTask({
        ...payload,
        capsuleContent: form.capsuleContent.trim(),
        capsuleToDate: toDateTimeString(form.capsuleToDate)
      })
      ElMessage.success(t('task.msgCreated'))
    }

    dialogVisible.value = false
    await load()
  } catch (e) {
    // 错误提示已由 api/local.js 统一弹出；这里只需保持弹窗打开，让用户能改
  } finally {
    submitting.value = false
  }
}

const doComplete = async (row) => {
  try {
    await completeTask(row.id)
    ElMessage.success(t('task.msgCompleted'))
    await load()
    // 完成会改变连续打卡与成长等级，同步刷新左侧用户信息
    await userStore.refresh()
  } catch (e) {
    /* 已提示 */
  }
}

const doAbandon = async (row) => {
  try {
    await abandonTask(row.id)
    ElMessage.success(t('task.msgAbandoned'))
    await load()
  } catch (e) {
    /* 已提示 */
  }
}

const doDelete = async (row) => {
  try {
    await deleteTask(row.id)
    ElMessage.success(t('task.msgDeleted'))
    await load()
  } catch (e) {
    /* 已提示 */
  }
}

onMounted(load)
</script>

<style scoped>
.form-tip {
  font-size: var(--fs-xs);
  color: var(--mt-text-faint);
  line-height: var(--lh-base);
  margin-top: var(--sp-1);
}
</style>

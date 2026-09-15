<template>
  <div class="page">
    <div class="page-head">
      <div>
        <h1 class="page-title">任务</h1>
        <p class="page-desc">完成任务会同步更新连续打卡、成长等级与成就徽章</p>
      </div>
      <div class="page-actions">
        <el-button type="primary" @click="openCreate">新建任务</el-button>
      </div>
    </div>

    <el-card shadow="never">
      <el-table
        v-loading="loading"
        :data="tasks"
        border
        stripe
        empty-text="还没有任务，点右上角新建一个吧"
      >
        <el-table-column prop="title" label="任务" min-width="180" show-overflow-tooltip />
        <el-table-column prop="category" label="类别" width="90" />
        <el-table-column label="截止时间" width="160">
          <template #default="{ row }">{{ formatDateTime(row.dueDate) }}</template>
        </el-table-column>
        <el-table-column label="提醒时间" width="160">
          <template #default="{ row }">{{ formatDateTime(row.remindTime) }}</template>
        </el-table-column>
        <el-table-column label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="statusType(row.status)">{{ statusText(row.status) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="250" fixed="right">
          <template #default="{ row }">
            <el-button v-if="isOpen(row)" size="small" type="success" @click="doComplete(row)">
              完成
            </el-button>
            <el-button size="small" @click="openEdit(row)">编辑</el-button>
            <el-button v-if="isOpen(row)" size="small" type="warning" @click="doAbandon(row)">
              放弃
            </el-button>
            <el-popconfirm title="确定删除这个任务吗？" @confirm="doDelete(row)">
              <template #reference>
                <el-button size="small" type="danger">删除</el-button>
              </template>
            </el-popconfirm>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <el-dialog v-model="dialogVisible" :title="isEdit ? '编辑任务' : '新建任务'" width="560px">
      <el-form label-width="110px">
        <el-form-item label="任务名称" required>
          <el-input v-model="form.title" placeholder="例如：每天背 30 个单词" maxlength="100" />
        </el-form-item>
        <el-form-item label="类别">
          <el-select v-model="form.category" style="width: 100%">
            <el-option label="学习" value="学习" />
            <el-option label="健身" value="健身" />
            <el-option label="工作" value="工作" />
            <el-option label="习惯" value="习惯" />
          </el-select>
        </el-form-item>
        <el-form-item label="截止时间">
          <el-date-picker
            v-model="form.dueDate"
            type="datetime"
            placeholder="选择截止时间（可不填）"
            style="width: 100%"
            @change="onDueDateChange"
          />
        </el-form-item>
        <el-form-item label="提醒时间">
          <el-date-picker
            v-model="form.remindTime"
            type="datetime"
            placeholder="选择提醒时间（可不填）"
            style="width: 100%"
          />
        </el-form-item>
        <el-form-item label="任务描述">
          <el-input v-model="form.description" placeholder="补充说明（可不填）" maxlength="500" />
        </el-form-item>

        <!-- 胶囊相关字段只在新建时出现：编辑已有任务不重复封存胶囊 -->
        <template v-if="!isEdit">
          <el-divider>时间胶囊（写给未来的自己）</el-divider>
          <el-form-item label="给未来的话" required>
            <el-input
              v-model="form.capsuleContent"
              type="textarea"
              :rows="4"
              maxlength="5000"
              show-word-limit
              placeholder="完成这个任务时，你想对未来的自己说什么？例如：希望你已经坚持下来了，我很期待见到你。"
            />
          </el-form-item>
          <el-form-item label="开启时间" required>
            <el-date-picker
              v-model="form.capsuleToDate"
              type="datetime"
              placeholder="到这个时候自动开启"
              style="width: 100%"
              @change="capsuleToDateTouched = true"
            />
            <div class="form-tip">默认 7 天后；到点后由定时任务自动开启，也可以提前手动打开</div>
          </el-form-item>
        </template>
      </el-form>

      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="submit">
          {{ isEdit ? '保存' : '创建任务' }}
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { onMounted, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
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

const userStore = useUserStore()

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
const statusText = (s) => ({ 0: '进行中', 1: '已完成', 2: '已逾期', 3: '已放弃' }[s] ?? '未知')
const statusType = (s) => ({ 0: 'primary', 1: 'success', 2: 'danger', 3: 'info' }[s] ?? 'info')

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

const openEdit = (row) => {
  isEdit.value = true
  editingId.value = row.id
  form.title = row.title
  form.category = row.category || '习惯'
  form.description = row.description || ''
  // 后端返回的是 'yyyy-MM-dd HH:mm:ss'，要转成 Date 才能回填给日期选择器
  form.dueDate = parseToDate(row.dueDate)
  form.remindTime = parseToDate(row.remindTime)
  dialogVisible.value = true
}

const parseToDate = (value) => {
  if (!value) return null
  const date = new Date(String(value).replace(' ', 'T'))
  return Number.isNaN(date.getTime()) ? null : date
}

const submit = async () => {
  if (!form.title.trim()) {
    ElMessage.warning('请填写任务名称')
    return
  }
  if (!isEdit.value) {
    if (!form.capsuleContent.trim()) {
      ElMessage.warning('请写下给未来的话')
      return
    }
    if (!form.capsuleToDate) {
      ElMessage.warning('请选择胶囊开启时间')
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
      ElMessage.success('任务已更新')
    } else {
      // 任务与胶囊由仓储层在同一个 IndexedDB 事务里一起写入，不会出现"有任务没胶囊"
      await createTask({
        ...payload,
        capsuleContent: form.capsuleContent.trim(),
        capsuleToDate: toDateTimeString(form.capsuleToDate)
      })
      ElMessage.success('任务已创建，时间胶囊已封存')
    }

    dialogVisible.value = false
    await load()
  } catch (e) {
    // 错误提示已由 request 拦截器统一弹出，这里只需要不关闭弹窗让用户改
  } finally {
    submitting.value = false
  }
}

const doComplete = async (row) => {
  try {
    await completeTask(row.id)
    ElMessage.success('任务已完成，去胶囊页看看过去的你说了什么')
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
    ElMessage.success('任务已标记为放弃')
    await load()
  } catch (e) {
    /* 已提示 */
  }
}

const doDelete = async (row) => {
  try {
    await deleteTask(row.id)
    ElMessage.success('任务已删除')
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

<template>
  <div class="page">
    <div class="page-head">
      <div>
        <h1 class="page-title">{{ t('chat.title') }}</h1>
        <p class="page-desc">{{ headHint }}</p>
      </div>
      <div class="page-actions">
        <el-radio-group v-model="mode" :disabled="sending" @change="onModeChange">
          <el-radio-button :value="CHAT_MODE.CAPSULE">{{ t('chat.modeCapsule') }}</el-radio-button>
          <el-radio-button :value="CHAT_MODE.PERSONA">{{ t('chat.modePersona') }}</el-radio-button>
        </el-radio-group>
      </div>
    </div>

    <!-- 没配 AI 就说清楚下一步去哪，而不是等用户打完字才报错 -->
    <el-alert
      v-if="!configured"
      class="ai-alert"
      type="info"
      :closable="false"
      show-icon
      :title="t('chat.notConfigured')"
    >
      <span>{{ t('chat.notConfiguredHint') }}</span>
      <el-button link type="primary" @click="router.push('/app/settings')">
        {{ t('chat.goSettings') }}
      </el-button>
    </el-alert>

    <el-card shadow="never" class="chat-card">
      <div class="chat-toolbar">
        <el-select
          v-model="targetId"
          class="target-select"
          :placeholder="targetPlaceholder"
          :loading="loadingTargets"
          :disabled="targets.length === 0 || sending"
          @change="loadHistory"
        >
          <el-option
            v-for="item in targets"
            :key="item.id"
            :label="targetLabel(item)"
            :value="item.id"
          />
        </el-select>

        <el-button @click="goManage">
          {{ isPersona ? t('chat.managePersona') : t('chat.goCapsule') }}
        </el-button>

        <el-popconfirm
          v-if="targetId && messages.length > 0"
          :title="t('chat.clearConfirm')"
          :confirm-button-text="t('common.confirm')"
          :cancel-button-text="t('common.cancel')"
          width="260"
          @confirm="doClear"
        >
          <template #reference>
            <el-button :disabled="sending">{{ t('chat.clear') }}</el-button>
          </template>
        </el-popconfirm>
      </div>

      <div ref="msgBox" v-loading="loadingHistory" class="msg-box">
        <el-empty v-if="targets.length === 0" :description="emptyHint">
          <el-button type="primary" @click="goManage">
            {{ isPersona ? t('chat.createPersona') : t('chat.createCapsule') }}
          </el-button>
        </el-empty>

        <template v-else>
          <div v-if="messages.length === 0" class="hint">{{ firstHint }}</div>

          <div
            v-for="item in messages"
            :key="item.id"
            :class="['msg-row', item.role === DIALOGUE_ROLE.USER ? 'user' : 'ai']"
          >
            <div class="bubble-wrap">
              <div class="bubble">{{ item.content }}</div>
              <div class="meta">
                <el-tag v-if="item.emotionTag" size="small" effect="plain">
                  {{ t(`emotion.${item.emotionTag}`) }}
                </el-tag>
                <span class="time">{{ item.createdAt.slice(0, 16) }}</span>
              </div>
            </div>
          </div>

          <!-- 等待时的占位气泡。用一句话而不是转圈：它本身就是这个产品该有的语气 -->
          <div v-if="sending" class="msg-row ai">
            <div class="bubble-wrap">
              <div class="bubble typing">{{ typingHint }}</div>
            </div>
          </div>
        </template>
      </div>

      <div class="chat-input">
        <el-input
          v-model="input"
          :placeholder="inputPlaceholder"
          :disabled="!targetId || sending"
          :maxlength="LIMITS.message"
          @keyup.enter="onEnter"
          @compositionstart="composing = true"
          @compositionend="composing = false"
        />
        <el-button
          type="primary"
          :loading="sending"
          :disabled="!targetId || sending || input.trim() === ''"
          @click="doSend"
        >
          {{ t('chat.send') }}
        </el-button>
      </div>
    </el-card>
  </div>
</template>

<script setup>
/**
 * 对话页：两种对象共用一个页面。
 *
 * 与旧版最大的差别在「数据从哪来」：旧版每一次读写都打后端接口，
 * 现在全部走本地仓储，只有**真正调用大模型**那一步会出网
 * （`api/chat.js` → 同源的 Cloudflare 函数，见 functions/api/ai.js）。
 *
 * 两处细节是照旧版保留下来的，都是踩过坑才有的：
 * 1. **中文输入法选词时按 Enter 不发送**（compositionstart/end 守卫），
 *    否则打「shurufa」的过程中就会被截成一条消息发出去；
 * 2. **发送失败把文字还给输入框**，用户不必重打一遍。
 */
import { computed, nextTick, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
// ElMessage / ElMessageBox 由 unplugin-auto-import 自动引入，见 vite.config.js
import {
  CHAT_LIMITS as LIMITS,
  CHAT_MODE,
  DIALOGUE_ROLE,
  clearHistory,
  getHistory,
  listTargets,
  sendMessage
} from '../api/chat'
import { getAiConfig } from '../api/ai'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()

const mode = ref(CHAT_MODE.CAPSULE)
const targets = ref([])
const targetId = ref('')
const messages = ref([])
const input = ref('')
const msgBox = ref(null)
const configured = ref(true)
const loadingTargets = ref(false)
const loadingHistory = ref(false)
const sending = ref(false)
const composing = ref(false)

/**
 * 每换一次对话对象就 +1，用来判断异步回来的回复还属不属于「当前这个对象」。
 *
 * 发送期间控件已经禁用，所以正常操作走不到这里；留着是因为「禁用」只是这一层的
 * 约定，而一次错配的后果很难看：消息其实存进了原来那个对象的历史，界面却把它
 * 追加到了当前列表里——用户看到的是「我刚发的话不见了，还多出一句莫名其妙的话」。
 */
let epoch = 0

const isPersona = computed(() => mode.value === CHAT_MODE.PERSONA)

const headHint = computed(() => (isPersona.value ? t('chat.headPersona') : t('chat.headCapsule')))

const targetPlaceholder = computed(() => (
  isPersona.value ? t('chat.pickPersona') : t('chat.pickCapsule')
))

const emptyHint = computed(() => (
  isPersona.value ? t('chat.noPersona') : t('chat.noCapsule')
))

const inputPlaceholder = computed(() => (
  isPersona.value ? t('chat.inputPersona') : t('chat.inputCapsule')
))

const typingHint = computed(() => (
  isPersona.value ? t('chat.typingPersona') : t('chat.typingCapsule')
))

const firstHint = computed(() => {
  if (!isPersona.value) return t('chat.firstCapsule')
  const current = targets.value.find((item) => item.id === targetId.value)
  return t('chat.firstPersona', { name: current?.name ?? '' })
})

/** 胶囊没有名字，用正文开头当标题——下拉框里得能分辨出是哪一枚。 */
const previewOf = (text) => {
  const flat = String(text ?? '').replace(/\s+/g, ' ').trim()
  return flat.length > 24 ? `${flat.slice(0, 24)}…` : flat
}

const targetLabel = (item) => (
  isPersona.value
    ? `${item.name} · ${item.selfDate}`
    : `${previewOf(item.content)} · ${item.createdAt.slice(0, 10)}`
)

const goManage = () => {
  router.push(isPersona.value ? '/app/persona' : '/app/capsules')
}

const scrollToBottom = async () => {
  await nextTick()
  if (msgBox.value) msgBox.value.scrollTop = msgBox.value.scrollHeight
}

const loadConfig = async () => {
  try {
    const config = await getAiConfig()
    configured.value = Boolean(config?.provider && config?.model && config?.apiKey)
  } catch (e) {
    // 读不到配置不该让整页报错：历史照样能看，只是不能发消息
    configured.value = false
  }
}

const loadTargets = async () => {
  loadingTargets.value = true
  epoch += 1
  try {
    targets.value = await listTargets(mode.value)
    // 默认选中第一个：进页面就能直接说话，少一次点击
    targetId.value = targets.value.length > 0 ? targets.value[0].id : ''
    messages.value = targetId.value === '' ? [] : await getHistory(mode.value, targetId.value)
    await scrollToBottom()
  } finally {
    loadingTargets.value = false
  }
}

const loadHistory = async () => {
  if (!targetId.value) {
    messages.value = []
    return
  }
  loadingHistory.value = true
  epoch += 1
  try {
    messages.value = await getHistory(mode.value, targetId.value)
    await scrollToBottom()
  } finally {
    loadingHistory.value = false
  }
}

const onModeChange = async () => {
  targetId.value = ''
  messages.value = []
  await loadTargets()
}

const onEnter = () => {
  // 输入法还在选词，这个 Enter 是「上屏」而不是「发送」
  if (composing.value) return
  doSend()
}

const doSend = async () => {
  const text = input.value.trim()
  if (text === '' || !targetId.value || sending.value) return

  const token = epoch
  sending.value = true
  try {
    const { user, ai } = await sendMessage(mode.value, targetId.value, text)
    // 发送是成功的，输入框照清——不管下面那一步走不走得到
    input.value = ''

    if (token === epoch) {
      messages.value = [...messages.value, user, ai]
      await scrollToBottom()
    }
  } catch (e) {
    // **输入框保持不动**：文字还在里面，用户可以直接重发。
    // 错误提示已由 api 层统一弹出（见 api/local.js），这里保持安静。
  } finally {
    sending.value = false
  }
}

const doClear = async () => {
  try {
    await clearHistory(mode.value, targetId.value)
    messages.value = []
    ElMessage.success(t('chat.cleared'))
  } catch (e) {
    /* 已提示 */
  }
}

onMounted(async () => {
  // 从分身页/胶囊页跳过来时带着 mode 与目标 id
  if (route.query.mode === CHAT_MODE.PERSONA) mode.value = CHAT_MODE.PERSONA

  await Promise.all([loadConfig(), loadTargets()])

  const wanted = isPersona.value ? route.query.personaId : route.query.capsuleId
  if (typeof wanted === 'string' && targets.value.some((item) => item.id === wanted)) {
    targetId.value = wanted
    await loadHistory()
  }
})
</script>

<style scoped>
.ai-alert {
  margin-bottom: var(--sp-4);
}

.chat-card :deep(.el-card__body) {
  display: flex;
  flex-direction: column;
}

.chat-toolbar {
  display: flex;
  gap: var(--sp-2);
  align-items: center;
}

.target-select {
  flex: 1;
}

.msg-box {
  min-height: 300px;
  max-height: 52vh;
  overflow-y: auto;
  margin: var(--sp-4) 0;
  padding: var(--sp-2) var(--sp-1);
}

.hint {
  padding: var(--sp-6) var(--sp-4);
  text-align: center;
  font-size: var(--fs-sm);
  line-height: var(--lh-loose);
  color: var(--mt-text-muted);
}

.msg-row {
  display: flex;
  margin-bottom: var(--sp-4);
}

.msg-row.user {
  justify-content: flex-end;
}

.bubble-wrap {
  max-width: 76%;
}

.bubble {
  padding: var(--sp-2) var(--sp-3);
  border-radius: var(--radius);
  font-size: var(--fs-base);
  line-height: var(--lh-base);
  white-space: pre-wrap;
  word-break: break-word;
}

/* 用户气泡白字压在奶茶棕上，这里用加深一档的棕保证对比度达标 */
.msg-row.user .bubble {
  background: #8a6440;
  color: #fff;
  border-bottom-right-radius: 3px;
}

.msg-row.ai .bubble {
  background: var(--mt-surface-alt);
  color: var(--mt-text);
  border: 1px solid var(--mt-border-soft);
  border-bottom-left-radius: 3px;
}

.typing {
  color: var(--mt-text-muted);
}

.meta {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  margin-top: 5px;
  font-size: var(--fs-xs);
  color: var(--mt-text-faint);
}

.msg-row.user .meta {
  justify-content: flex-end;
}

.chat-input {
  display: flex;
  gap: var(--sp-2);
}
</style>

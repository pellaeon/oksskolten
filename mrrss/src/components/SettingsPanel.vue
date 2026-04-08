<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import { DEFAULT_FULL_TEXT_HOSTNAME_BLACKLIST_TEXT } from '../../../shared/full-text-fetch'
import { articleFonts } from '../../../src/data/articleFonts'
import { highlightThemeFamilies } from '../../../src/data/highlightThemes'
import { layouts } from '../../../src/data/layouts'
import { themes } from '../../../src/data/themes'
import {
  DEFAULT_MODELS,
  LLM_API_PROVIDERS,
  LLM_TASK_PROVIDERS,
  MODELS_BY_PROVIDER,
  TRANSLATE_SERVICE_PROVIDERS,
} from '../../../shared/models'
import {
  changeEmail,
  changePassword,
  fetchOpmlBlob,
  getAuthMethods,
  getFreshRssSettings,
  getHealth,
  getImageStorage,
  getOllamaModels,
  getOllamaStatus,
  getOpenAIStatus,
  getPreferences,
  getProfile,
  getProviderKeyStatus,
  getRetentionStats,
  importOpml,
  previewOpml,
  purgeRetention,
  saveFreshRssApiKey,
  saveProviderApiKey,
  syncFreshRss,
  testImageStorage,
  togglePasswordAuth,
  type AuthMethods,
  type FreshRssSettings,
  type ImageStorageResponse,
  type OpmlPreviewResponse,
  type PreferencesResponse,
  type ProfileResponse,
  type RetentionStats,
  updateFreshRssSettings,
  updateImageStorage,
  updatePreferences,
  updateProfile,
  verifyFreshRss,
  healthcheckImageStorage,
} from '@mrrss/lib/api'
import { setAuthToken } from '@mrrss/lib/auth'

const props = defineProps<{
  open: boolean
}>()

const emit = defineEmits<{
  close: []
}>()

type SettingsTab = 'general' | 'appearance' | 'ai' | 'integration' | 'plugins' | 'security' | 'data' | 'about'

const tabs: Array<{ key: SettingsTab; label: string; icon: string }> = [
  { key: 'general', label: 'General', icon: 'M4 7h16M4 12h16M4 17h16' },
  { key: 'appearance', label: 'Appearance', icon: 'M12 4a8 8 0 1 0 8 8h-8V4Z M12 4a8 8 0 0 1 8 8' },
  { key: 'ai', label: 'AI & Translation', icon: 'M12 3 4 8v8l8 5 8-5V8l-8-5Z' },
  { key: 'integration', label: 'Integration', icon: 'M8 12h8M12 8v8M4 12a8 8 0 0 0 8 8M20 12a8 8 0 0 1-8 8M4 12a8 8 0 0 1 8-8M20 12a8 8 0 0 0-8-8' },
  { key: 'plugins', label: 'Plugins', icon: 'M8 4h4v4H8zM12 8h4v4h-4zM8 12h4v4H8zM12 16h4v4h-4z' },
  { key: 'security', label: 'Security', icon: 'M12 3 5 6v6c0 5 3.2 7.7 7 9 3.8-1.3 7-4 7-9V6l-7-3Z' },
  { key: 'data', label: 'Data', icon: 'M4 7c0-2 3.6-3 8-3s8 1 8 3-3.6 3-8 3-8-1-8-3Zm0 5c0 2 3.6 3 8 3s8-1 8-3m-16 0v5c0 2 3.6 3 8 3s8-1 8-3v-5' },
  { key: 'about', label: 'About', icon: 'M12 17v-5M12 8h.01M4 12a8 8 0 1 0 16 0 8 8 0 0 0-16 0' },
]

const activeTab = ref<SettingsTab>('general')
const loading = ref(false)
const message = ref<{ type: 'success' | 'error'; text: string } | null>(null)
const health = ref<{ gitCommit?: string; gitTag?: string; buildDate?: string } | null>(null)
const authMethods = ref<AuthMethods | null>(null)
const providerStatuses = reactive<Record<string, boolean>>({})
const providerInputs = reactive<Record<string, string>>({})
const providerMessages = reactive<Record<string, string>>({})
const ollamaStatus = ref<{ ok: boolean; version?: string; model_count?: number; error?: string } | null>(null)
const ollamaModels = ref<Array<{ name: string; size: number; parameter_size: string }>>([])
const openAiStatus = ref<{ ok: boolean; model_count?: number; first_model?: string | null; error?: string } | null>(null)
const retentionStats = ref<RetentionStats | null>(null)
const previewData = ref<OpmlPreviewResponse | null>(null)
const previewFile = ref<File | null>(null)
const importing = ref(false)
const settingsBodyScrollbarVisible = ref(false)
let settingsBodyScrollbarHideTimer: ReturnType<typeof setTimeout> | null = null

const profile = reactive<ProfileResponse>({
  account_name: '',
  avatar_seed: null,
  language: 'en',
  email: '',
})

const prefs = reactive<Record<string, string>>({
  'appearance.color_theme': 'default',
  'reading.date_mode': 'relative',
  'reading.auto_mark_read': 'off',
  'reading.unread_indicator': 'on',
  'reading.internal_links': 'on',
  'reading.show_thumbnails': 'on',
  'reading.show_feed_activity': 'on',
  'reading.chat_position': 'fab',
  'reading.article_open_mode': 'overlay',
  'reading.category_unread_only': 'off',
  'reading.keyboard_navigation': 'on',
  'reading.keybindings': '',
  'reading.full_text_blacklist': DEFAULT_FULL_TEXT_HOSTNAME_BLACKLIST_TEXT,
  'appearance.mascot': 'off',
  'appearance.highlight_theme': highlightThemeFamilies[0]?.value ?? 'github',
  'appearance.font_family': articleFonts[0]?.value ?? 'system',
  'appearance.list_layout': layouts[0]?.name ?? 'list',
  'chat.provider': 'anthropic',
  'chat.model': DEFAULT_MODELS.anthropic,
  'summary.provider': 'anthropic',
  'summary.model': DEFAULT_MODELS.anthropic,
  'translate.provider': 'anthropic',
  'translate.model': 'claude-sonnet-4-6',
  'translate.target_lang': '',
  'openai.base_url': '',
  'ollama.base_url': '',
  'ollama.custom_headers': '',
  'custom_themes': '',
  'retention.enabled': 'off',
  'retention.read_days': '90',
  'retention.unread_days': '180',
})

const imageStorage = reactive<ImageStorageResponse>({
  'images.enabled': null,
  mode: 'local',
  url: '',
  headersConfigured: false,
  fieldName: 'image',
  respPath: '',
  healthcheckUrl: '',
  'images.storage_path': '',
  'images.max_size_mb': '10',
})
const imageHeadersDraft = ref('')
const clearImageHeaders = ref(false)

const freshRss = reactive<FreshRssSettings>({
  enabled: false,
  endpointUrl: '',
  configured: false,
  apiKeyConfigured: false,
  lastSyncAt: null,
  lastSyncError: null,
})
const freshRssApiKey = ref('')

const security = reactive({
  currentPassword: '',
  newPassword: '',
  confirmPassword: '',
  newEmail: '',
  emailPassword: '',
})

const providerOptions = [
  { value: 'anthropic', label: 'Anthropic' },
  { value: 'gemini', label: 'Gemini' },
  { value: 'openai', label: 'OpenAI' },
  { value: 'claude-code', label: 'Claude Code' },
  { value: 'ollama', label: 'Ollama' },
] as const

const translateOptions = [
  ...providerOptions,
  { value: 'google-translate', label: 'Google Translate' },
  { value: 'deepl', label: 'DeepL' },
] as const

const passwordEnabled = computed(() => authMethods.value?.password.enabled !== false)
const canDisablePassword = computed(() => {
  const passkeyCount = authMethods.value?.passkey?.count ?? 0
  const githubEnabled = authMethods.value?.github?.enabled === true
  return passkeyCount > 0 || githubEnabled
})

const groupedThemeOptions = computed(() => {
  const custom = safeParseCustomThemes(prefs['custom_themes'])
  return [...themes, ...custom]
})

const currentChatModels = computed(() => getModelList(prefs['chat.provider']))
const currentSummaryModels = computed(() => getModelList(prefs['summary.provider']))
const currentTranslateModels = computed(() => getModelList(prefs['translate.provider']))

watch(() => props.open, async (open) => {
  if (open) {
    await loadAll()
  }
})

onMounted(async () => {
  if (props.open) {
    await loadAll()
  }
})

onUnmounted(() => {
  if (settingsBodyScrollbarHideTimer != null) {
    clearTimeout(settingsBodyScrollbarHideTimer)
    settingsBodyScrollbarHideTimer = null
  }
})

function showMessage(type: 'success' | 'error', text: string) {
  message.value = { type, text }
  window.setTimeout(() => {
    if (message.value?.text === text) message.value = null
  }, 3500)
}

function showSettingsBodyScrollbar() {
  if (settingsBodyScrollbarHideTimer != null) {
    clearTimeout(settingsBodyScrollbarHideTimer)
    settingsBodyScrollbarHideTimer = null
  }
  settingsBodyScrollbarVisible.value = true
}

function scheduleHideSettingsBodyScrollbar() {
  if (settingsBodyScrollbarHideTimer != null) {
    clearTimeout(settingsBodyScrollbarHideTimer)
  }
  settingsBodyScrollbarHideTimer = setTimeout(() => {
    settingsBodyScrollbarVisible.value = false
    settingsBodyScrollbarHideTimer = null
  }, 1000)
}

function safeParseCustomThemes(raw: string) {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw) as Array<{ name: string; label: string }>
    return parsed.filter(theme => typeof theme.name === 'string' && typeof theme.label === 'string')
  } catch {
    return []
  }
}

function assignPrefs(next: PreferencesResponse) {
  for (const [key, value] of Object.entries(next)) {
    prefs[key] = value ?? (key === 'reading.full_text_blacklist' ? DEFAULT_FULL_TEXT_HOSTNAME_BLACKLIST_TEXT : '')
  }
}

async function loadAll() {
  loading.value = true

  try {
    const [
      profileData,
      prefsData,
      imageData,
      freshRssData,
      authData,
      healthData,
    ] = await Promise.all([
      getProfile(),
      getPreferences(),
      getImageStorage(),
      getFreshRssSettings(),
      getAuthMethods(),
      getHealth(),
    ])

    Object.assign(profile, profileData)
    assignPrefs(prefsData)
    Object.assign(imageStorage, imageData)
    imageHeadersDraft.value = ''
    clearImageHeaders.value = false
    Object.assign(freshRss, { ...freshRssData, endpointUrl: freshRssData.endpointUrl ?? '' })
    authMethods.value = authData
    health.value = healthData

    await Promise.all([
      loadProviderStatuses(),
      loadOllamaState(),
      refreshRetention(),
    ])
  } catch (error) {
    showMessage('error', error instanceof Error ? error.message : 'Failed to load settings')
  } finally {
    loading.value = false
  }
}

async function loadProviderStatuses() {
  const providers = [...LLM_API_PROVIDERS, ...TRANSLATE_SERVICE_PROVIDERS]
  await Promise.all(providers.map(async (provider) => {
    try {
      providerStatuses[provider] = (await getProviderKeyStatus(provider)).configured
    } catch {
      providerStatuses[provider] = false
    }
  }))
}

async function loadOllamaState() {
  try {
    const [status, models] = await Promise.all([
      getOllamaStatus(),
      getOllamaModels(),
    ])
    ollamaStatus.value = status
    ollamaModels.value = models.models
  } catch {
    ollamaStatus.value = { ok: false, error: 'Failed to query Ollama' }
    ollamaModels.value = []
  }
}

async function refreshRetention() {
  if (prefs['retention.enabled'] !== 'on') {
    retentionStats.value = null
    return
  }
  try {
    retentionStats.value = await getRetentionStats()
  } catch {
    retentionStats.value = null
  }
}

function close() {
  emit('close')
}

async function saveGeneral() {
  try {
    await updateProfile({
      account_name: profile.account_name,
      avatar_seed: profile.avatar_seed,
      language: profile.language || 'en',
    })

    const next = await updatePreferences({
      'reading.date_mode': prefs['reading.date_mode'],
      'reading.auto_mark_read': prefs['reading.auto_mark_read'],
      'reading.unread_indicator': prefs['reading.unread_indicator'],
      'reading.internal_links': prefs['reading.internal_links'],
      'reading.show_thumbnails': prefs['reading.show_thumbnails'],
      'reading.show_feed_activity': prefs['reading.show_feed_activity'],
      'reading.chat_position': prefs['reading.chat_position'],
      'reading.article_open_mode': prefs['reading.article_open_mode'],
      'reading.category_unread_only': prefs['reading.category_unread_only'],
      'reading.keyboard_navigation': prefs['reading.keyboard_navigation'],
      'reading.keybindings': prefs['reading.keybindings'],
      'reading.full_text_blacklist': prefs['reading.full_text_blacklist'] || DEFAULT_FULL_TEXT_HOSTNAME_BLACKLIST_TEXT,
    })
    assignPrefs(next)
    showMessage('success', 'General settings saved')
  } catch (error) {
    showMessage('error', error instanceof Error ? error.message : 'Save failed')
  }
}

async function saveAppearance() {
  try {
    const next = await updatePreferences({
      'appearance.color_theme': prefs['appearance.color_theme'],
      'appearance.highlight_theme': prefs['appearance.highlight_theme'],
      'appearance.font_family': prefs['appearance.font_family'],
      'appearance.list_layout': prefs['appearance.list_layout'],
      'appearance.mascot': prefs['appearance.mascot'],
      'custom_themes': prefs['custom_themes'],
    })
    assignPrefs(next)
    showMessage('success', 'Appearance settings saved')
  } catch (error) {
    showMessage('error', error instanceof Error ? error.message : 'Save failed')
  }
}

async function saveAiTaskSettings() {
  try {
    const next = await updatePreferences({
      'chat.provider': prefs['chat.provider'],
      'chat.model': prefs['chat.model'],
      'summary.provider': prefs['summary.provider'],
      'summary.model': prefs['summary.model'],
      'translate.provider': prefs['translate.provider'],
      'translate.model': prefs['translate.model'],
      'translate.target_lang': prefs['translate.target_lang'],
      'openai.base_url': prefs['openai.base_url'],
      'ollama.base_url': prefs['ollama.base_url'],
      'ollama.custom_headers': prefs['ollama.custom_headers'],
    })
    assignPrefs(next)
    showMessage('success', 'AI settings saved')
  } catch (error) {
    showMessage('error', error instanceof Error ? error.message : 'Save failed')
  }
}

async function saveProviderKey(provider: string) {
  try {
    await saveProviderApiKey(provider, providerInputs[provider] || '')
    providerInputs[provider] = ''
    providerStatuses[provider] = true
    providerMessages[provider] = 'Saved'
    await loadProviderStatuses()
  } catch (error) {
    providerMessages[provider] = error instanceof Error ? error.message : 'Save failed'
  }
}

async function deleteProviderKey(provider: string) {
  try {
    await saveProviderApiKey(provider, '')
    providerStatuses[provider] = false
    providerMessages[provider] = 'Deleted'
  } catch (error) {
    providerMessages[provider] = error instanceof Error ? error.message : 'Delete failed'
  }
}

async function testOpenAiConnection() {
  try {
    openAiStatus.value = await getOpenAIStatus()
  } catch (error) {
    openAiStatus.value = { ok: false, error: error instanceof Error ? error.message : 'Connection failed' }
  }
}

async function saveFreshRssSection() {
  try {
    const next = await updateFreshRssSettings({
      enabled: freshRss.enabled,
      endpointUrl: freshRss.endpointUrl || '',
    })
    Object.assign(freshRss, next)
    if (freshRssApiKey.value) {
      Object.assign(freshRss, await saveFreshRssApiKey(freshRssApiKey.value))
      freshRssApiKey.value = ''
    }
    showMessage('success', 'FreshRSS settings saved')
  } catch (error) {
    showMessage('error', error instanceof Error ? error.message : 'Save failed')
  }
}

async function verifyFreshRssConnection() {
  try {
    await verifyFreshRss()
    showMessage('success', 'FreshRSS connection succeeded')
  } catch (error) {
    showMessage('error', error instanceof Error ? error.message : 'Verification failed')
  }
}

async function syncFreshRssNow() {
  try {
    const result = await syncFreshRss()
    if (result.settings) {
      Object.assign(freshRss, result.settings as FreshRssSettings)
    }
    showMessage(
      'success',
      `Sync finished: ${result.createdFeeds ?? 0} feeds created, ${result.updatedFeeds ?? 0} updated`,
    )
  } catch (error) {
    showMessage('error', error instanceof Error ? error.message : 'Sync failed')
  }
}

async function saveImageStorageSection() {
  try {
    const next = await updateImageStorage({
      'images.enabled': imageStorage['images.enabled'] ? '1' : '',
      mode: imageStorage.mode,
      'images.storage_path': imageStorage['images.storage_path'] || '',
      'images.max_size_mb': imageStorage['images.max_size_mb'] || '',
      url: imageStorage.url || '',
      headers: clearImageHeaders.value ? '' : imageHeadersDraft.value,
      fieldName: imageStorage.fieldName || '',
      respPath: imageStorage.respPath || '',
      healthcheckUrl: imageStorage.healthcheckUrl || '',
    })
    Object.assign(imageStorage, next)
    imageHeadersDraft.value = ''
    clearImageHeaders.value = false
    showMessage('success', 'Image storage settings saved')
  } catch (error) {
    showMessage('error', error instanceof Error ? error.message : 'Save failed')
  }
}

async function runImageUploadTest() {
  try {
    const result = await testImageStorage()
    showMessage('success', `Upload succeeded: ${result.url}`)
  } catch (error) {
    showMessage('error', error instanceof Error ? error.message : 'Upload test failed')
  }
}

async function runImageHealthcheck() {
  try {
    await healthcheckImageStorage()
    showMessage('success', 'Healthcheck passed')
  } catch (error) {
    showMessage('error', error instanceof Error ? error.message : 'Healthcheck failed')
  }
}

async function saveSecuritySection() {
  try {
    if (security.newEmail && security.emailPassword) {
      const result = await changeEmail({
        newEmail: security.newEmail,
        currentPassword: security.emailPassword,
      })
      setAuthToken(result.token)
      profile.email = security.newEmail
      security.newEmail = ''
      security.emailPassword = ''
    }

    if (security.newPassword) {
      if (security.newPassword !== security.confirmPassword) {
        throw new Error('New passwords do not match')
      }
      const result = await changePassword({
        currentPassword: security.currentPassword || undefined,
        newPassword: security.newPassword,
      })
      setAuthToken(result.token)
      security.currentPassword = ''
      security.newPassword = ''
      security.confirmPassword = ''
    }

    showMessage('success', 'Security settings saved')
  } catch (error) {
    showMessage('error', error instanceof Error ? error.message : 'Save failed')
  }
}

async function togglePasswordEnabled(enabled: boolean) {
  try {
    await togglePasswordAuth(enabled)
    authMethods.value = await getAuthMethods()
    showMessage('success', `Password authentication ${enabled ? 'enabled' : 'disabled'}`)
  } catch (error) {
    showMessage('error', error instanceof Error ? error.message : 'Update failed')
  }
}

async function handleOpmlFile(event: Event) {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]
  if (!file) return

  try {
    previewFile.value = file
    previewData.value = await previewOpml(file)
    showMessage('success', `Preview loaded: ${previewData.value.totalCount} feeds`)
  } catch (error) {
    showMessage('error', error instanceof Error ? error.message : 'Preview failed')
  } finally {
    target.value = ''
  }
}

async function importPreviewOpml() {
  if (!previewFile.value) return
  importing.value = true
  try {
    const result = await importOpml(previewFile.value)
    previewFile.value = null
    previewData.value = null
    showMessage('success', `Imported ${result.imported} feeds (${result.skipped} skipped)`)
  } catch (error) {
    showMessage('error', error instanceof Error ? error.message : 'Import failed')
  } finally {
    importing.value = false
  }
}

async function exportOpml() {
  try {
    const blob = await fetchOpmlBlob()
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = 'oksskolten.opml'
    anchor.click()
    URL.revokeObjectURL(url)
  } catch (error) {
    showMessage('error', error instanceof Error ? error.message : 'Export failed')
  }
}

async function saveRetentionSettings() {
  try {
    const next = await updatePreferences({
      'retention.enabled': prefs['retention.enabled'],
      'retention.read_days': prefs['retention.read_days'],
      'retention.unread_days': prefs['retention.unread_days'],
    })
    assignPrefs(next)
    await refreshRetention()
    showMessage('success', 'Retention settings saved')
  } catch (error) {
    showMessage('error', error instanceof Error ? error.message : 'Save failed')
  }
}

async function purgeRetentionNow() {
  try {
    const result = await purgeRetention()
    await refreshRetention()
    showMessage('success', `Purged ${result.purged} articles`)
  } catch (error) {
    showMessage('error', error instanceof Error ? error.message : 'Purge failed')
  }
}

function getModelList(provider: string) {
  if (provider === 'claude-code') {
    return (MODELS_BY_PROVIDER.anthropic ?? []).flatMap(group => group.models.map(model => ({
      value: model.value,
      label: `${group.group} · ${model.label}`,
    })))
  }
  if (provider === 'ollama') {
    return ollamaModels.value.map(model => ({ value: model.name, label: model.name }))
  }
  return (MODELS_BY_PROVIDER[provider] ?? []).flatMap(group => group.models.map(model => ({
    value: model.value,
    label: `${group.group} · ${model.label}`,
  })))
}

watch(() => prefs['chat.provider'], (provider) => {
  if (provider === 'ollama') {
    if (!prefs['chat.model'] && ollamaModels.value[0]) prefs['chat.model'] = ollamaModels.value[0].name
    return
  }
  if (provider === 'claude-code') {
    prefs['chat.model'] = DEFAULT_MODELS['claude-code']
    return
  }
  prefs['chat.model'] = DEFAULT_MODELS[provider] || prefs['chat.model']
})

watch(() => prefs['summary.provider'], (provider) => {
  if (provider === 'ollama') {
    if (!prefs['summary.model'] && ollamaModels.value[0]) prefs['summary.model'] = ollamaModels.value[0].name
    return
  }
  if (provider === 'claude-code') {
    prefs['summary.model'] = DEFAULT_MODELS['claude-code']
    return
  }
  prefs['summary.model'] = DEFAULT_MODELS[provider] || prefs['summary.model']
})

watch(() => prefs['translate.provider'], (provider) => {
  if (provider === 'google-translate' || provider === 'deepl') {
    prefs['translate.model'] = ''
    return
  }
  if (provider === 'ollama') {
    if (!prefs['translate.model'] && ollamaModels.value[0]) prefs['translate.model'] = ollamaModels.value[0].name
    return
  }
  if (provider === 'claude-code') {
    prefs['translate.model'] = DEFAULT_MODELS['claude-code']
    return
  }
  prefs['translate.model'] = DEFAULT_MODELS[provider] || prefs['translate.model']
})
</script>

<template>
  <div v-if="open" class="settings-sheet__backdrop" @click.self="close">
    <section class="settings-sheet settings-sheet--wide">
      <header class="settings-sheet__header">
        <div>
          <p class="pane-header__eyebrow">Settings</p>
          <h2>
            <svg class="settings-sheet__title-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M10 3h4l.5 2.2a7.7 7.7 0 0 1 1.8.8l2-1.2 2.8 2.8-1.2 2a7.7 7.7 0 0 1 .8 1.8L23 12v4l-2.2.5a7.7 7.7 0 0 1-.8 1.8l1.2 2-2.8 2.8-2-1.2a7.7 7.7 0 0 1-1.8.8L14 23h-4l-.5-2.2a7.7 7.7 0 0 1-1.8-.8l-2 1.2-2.8-2.8 1.2-2a7.7 7.7 0 0 1-.8-1.8L1 16v-4l2.2-.5a7.7 7.7 0 0 1 .8-1.8l-1.2-2 2.8-2.8 2 1.2a7.7 7.7 0 0 1 1.8-.8L10 3Z M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z" fill="currentColor" />
            </svg>
            Oksskolten Options
          </h2>
        </div>
        <button class="settings-close" type="button" @click="close" aria-label="Close settings">×</button>
      </header>

      <div v-if="loading" class="pane-state">Loading settings…</div>
      <div v-else class="settings-layout">
        <nav class="settings-nav">
          <button
            v-for="tab in tabs"
            :key="tab.key"
            type="button"
            class="settings-nav__item"
            :class="{ 'is-active': activeTab === tab.key }"
            @click="activeTab = tab.key"
          >
            <svg class="settings-nav__icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path :d="tab.icon" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
            <span class="settings-nav__label">{{ tab.label }}</span>
          </button>
        </nav>

        <div
          class="settings-body"
          :class="{ 'is-scrollbar-visible': settingsBodyScrollbarVisible }"
          @mouseenter="showSettingsBodyScrollbar"
          @mousemove="showSettingsBodyScrollbar"
          @mouseleave="scheduleHideSettingsBodyScrollbar"
        >
          <p v-if="message" class="settings-message" :class="{ 'is-error': message.type === 'error' }">
            {{ message.text }}
          </p>

          <section v-if="activeTab === 'general'" class="settings-section">
            <h3>Profile</h3>
            <label class="settings-field">
              <span>Account name</span>
              <input v-model="profile.account_name" type="text" />
            </label>
            <label class="settings-field">
              <span>Avatar seed</span>
              <input v-model="profile.avatar_seed" type="text" placeholder="Optional avatar seed" />
            </label>
            <label class="settings-field">
              <span>Language</span>
              <select v-model="profile.language">
                <option value="en">English</option>
                <option value="ja">Japanese</option>
              </select>
            </label>

            <h3>Reading</h3>
            <div class="settings-grid">
              <label class="settings-field">
                <span>Date format</span>
                <select v-model="prefs['reading.date_mode']">
                  <option value="relative">Relative</option>
                  <option value="absolute">Absolute</option>
                </select>
              </label>
              <label class="settings-field">
                <span>Auto mark read</span>
                <select v-model="prefs['reading.auto_mark_read']">
                  <option value="on">On</option>
                  <option value="off">Off</option>
                </select>
              </label>
              <label class="settings-field">
                <span>Unread indicator</span>
                <select v-model="prefs['reading.unread_indicator']">
                  <option value="on">On</option>
                  <option value="off">Off</option>
                </select>
              </label>
              <label class="settings-field">
                <span>Internal links</span>
                <select v-model="prefs['reading.internal_links']">
                  <option value="on">On</option>
                  <option value="off">Off</option>
                </select>
              </label>
              <label class="settings-field">
                <span>Show thumbnails</span>
                <select v-model="prefs['reading.show_thumbnails']">
                  <option value="on">On</option>
                  <option value="off">Off</option>
                </select>
              </label>
              <label class="settings-field">
                <span>Show feed activity</span>
                <select v-model="prefs['reading.show_feed_activity']">
                  <option value="on">On</option>
                  <option value="off">Off</option>
                </select>
              </label>
              <label class="settings-field">
                <span>Chat position</span>
                <select v-model="prefs['reading.chat_position']">
                  <option value="fab">Floating button</option>
                  <option value="inline">Inline toolbar</option>
                </select>
              </label>
              <label class="settings-field">
                <span>Article open mode</span>
                <select v-model="prefs['reading.article_open_mode']">
                  <option value="overlay">Overlay</option>
                  <option value="page">Full Page</option>
                </select>
              </label>
              <label class="settings-field">
                <span>Category unread only</span>
                <select v-model="prefs['reading.category_unread_only']">
                  <option value="on">On</option>
                  <option value="off">Off</option>
                </select>
              </label>
              <label class="settings-field">
                <span>Keyboard navigation</span>
                <select v-model="prefs['reading.keyboard_navigation']">
                  <option value="on">On</option>
                  <option value="off">Off</option>
                </select>
              </label>
            </div>
            <label class="settings-field">
              <span>Keybindings JSON</span>
              <textarea v-model="prefs['reading.keybindings']" rows="5" placeholder='{"next":"j","prev":"k"}' />
            </label>
            <label class="settings-field">
              <span>Full text blacklist</span>
              <textarea v-model="prefs['reading.full_text_blacklist']" rows="7" />
            </label>
            <div class="settings-actions">
              <button class="auth-submit" type="button" @click="saveGeneral">Save General</button>
            </div>
          </section>

          <section v-else-if="activeTab === 'appearance'" class="settings-section">
            <h3>Appearance</h3>
            <div class="settings-grid">
              <label class="settings-field">
                <span>Theme</span>
                <select v-model="prefs['appearance.color_theme']">
                  <option v-for="theme in groupedThemeOptions" :key="theme.name" :value="theme.name">
                    {{ theme.label }}
                  </option>
                </select>
              </label>
              <label class="settings-field">
                <span>List layout</span>
                <select v-model="prefs['appearance.list_layout']">
                  <option v-for="layout in layouts" :key="layout.name" :value="layout.name">
                    {{ layout.label }}
                  </option>
                </select>
              </label>
              <label class="settings-field">
                <span>Highlight theme</span>
                <select v-model="prefs['appearance.highlight_theme']">
                  <option v-for="theme in highlightThemeFamilies" :key="theme.value" :value="theme.value">
                    {{ theme.label }}
                  </option>
                </select>
              </label>
              <label class="settings-field">
                <span>Article font</span>
                <select v-model="prefs['appearance.font_family']">
                  <option v-for="font in articleFonts" :key="font.value" :value="font.value">
                    {{ font.label }}
                  </option>
                </select>
              </label>
              <label class="settings-field">
                <span>Mascot</span>
                <select v-model="prefs['appearance.mascot']">
                  <option value="off">Off</option>
                  <option value="dream-puff">Dream Puff</option>
                  <option value="sleepy-giant">Sleepy Giant</option>
                </select>
              </label>
            </div>
            <label class="settings-field">
              <span>Custom themes JSON</span>
              <textarea v-model="prefs['custom_themes']" rows="9" placeholder='[{"name":"my-theme","label":"My Theme","indicatorStyle":"dot","highlight":"github","colors":{"light":{},"dark":{}}}]' />
            </label>
            <div class="settings-actions">
              <button class="auth-submit" type="button" @click="saveAppearance">Save Appearance</button>
            </div>
          </section>

          <section v-else-if="activeTab === 'ai'" class="settings-section">
            <h3>Provider API Keys</h3>
            <div class="settings-provider-list">
              <div v-for="provider in [...LLM_API_PROVIDERS, ...TRANSLATE_SERVICE_PROVIDERS]" :key="provider" class="settings-provider-card">
                <div class="settings-provider-card__header">
                  <strong>{{ provider }}</strong>
                  <span>{{ providerStatuses[provider] ? 'Configured' : 'Missing' }}</span>
                </div>
                <div class="settings-inline">
                  <input v-model="providerInputs[provider]" type="password" :placeholder="`Set ${provider} key`" />
                  <button class="sidebar-header__button" type="button" @click="saveProviderKey(provider)">Save</button>
                  <button v-if="providerStatuses[provider]" class="sidebar-header__button" type="button" @click="deleteProviderKey(provider)">Delete</button>
                </div>
                <p v-if="providerMessages[provider]" class="settings-help">{{ providerMessages[provider] }}</p>
              </div>
            </div>

            <h3>Task Routing</h3>
            <div class="settings-grid">
              <label class="settings-field">
                <span>Chat provider</span>
                <select v-model="prefs['chat.provider']">
                  <option v-for="provider in providerOptions" :key="provider.value" :value="provider.value">
                    {{ provider.label }}
                  </option>
                </select>
              </label>
              <label class="settings-field">
                <span>Chat model</span>
                <select v-model="prefs['chat.model']">
                  <option v-for="model in currentChatModels" :key="model.value" :value="model.value">
                    {{ model.label }}
                  </option>
                </select>
              </label>
              <label class="settings-field">
                <span>Summary provider</span>
                <select v-model="prefs['summary.provider']">
                  <option v-for="provider in providerOptions" :key="provider.value" :value="provider.value">
                    {{ provider.label }}
                  </option>
                </select>
              </label>
              <label class="settings-field">
                <span>Summary model</span>
                <select v-model="prefs['summary.model']">
                  <option v-for="model in currentSummaryModels" :key="model.value" :value="model.value">
                    {{ model.label }}
                  </option>
                </select>
              </label>
              <label class="settings-field">
                <span>Translate provider</span>
                <select v-model="prefs['translate.provider']">
                  <option v-for="provider in translateOptions" :key="provider.value" :value="provider.value">
                    {{ provider.label }}
                  </option>
                </select>
              </label>
              <label v-if="prefs['translate.provider'] !== 'google-translate' && prefs['translate.provider'] !== 'deepl'" class="settings-field">
                <span>Translate model</span>
                <select v-model="prefs['translate.model']">
                  <option v-for="model in currentTranslateModels" :key="model.value" :value="model.value">
                    {{ model.label }}
                  </option>
                </select>
              </label>
              <label class="settings-field">
                <span>Translate target language</span>
                <select v-model="prefs['translate.target_lang']">
                  <option value="">Auto</option>
                  <option value="en">English</option>
                  <option value="ja">Japanese</option>
                </select>
              </label>
              <label class="settings-field">
                <span>OpenAI API URL</span>
                <input v-model="prefs['openai.base_url']" type="text" placeholder="https://api.openai.com/v1" />
              </label>
              <label class="settings-field">
                <span>Ollama base URL</span>
                <input v-model="prefs['ollama.base_url']" type="text" placeholder="http://127.0.0.1:11434" />
              </label>
            </div>
            <label class="settings-field">
              <span>Ollama custom headers JSON</span>
              <textarea v-model="prefs['ollama.custom_headers']" rows="4" placeholder='{"Authorization":"Bearer ..."}' />
            </label>
            <div class="settings-inline">
              <button class="auth-submit" type="button" @click="saveAiTaskSettings">Save AI Settings</button>
              <button class="sidebar-header__button" type="button" @click="testOpenAiConnection">Test OpenAI URL</button>
            </div>
            <p v-if="openAiStatus" class="settings-help">
              {{ openAiStatus.ok ? `OpenAI connected (${openAiStatus.model_count} models)` : `OpenAI failed: ${openAiStatus.error}` }}
            </p>
            <p v-if="ollamaStatus" class="settings-help">
              {{ ollamaStatus.ok ? `Ollama ${ollamaStatus.version} · ${ollamaStatus.model_count} models` : `Ollama unavailable: ${ollamaStatus.error}` }}
            </p>
          </section>

          <section v-else-if="activeTab === 'integration'" class="settings-section">
            <h3>FreshRSS Sync</h3>
            <div class="settings-grid">
              <label class="settings-field">
                <span>Enabled</span>
                <select v-model="freshRss.enabled">
                  <option :value="true">On</option>
                  <option :value="false">Off</option>
                </select>
              </label>
              <label class="settings-field">
                <span>Fever endpoint URL</span>
                <input v-model="freshRss.endpointUrl" type="text" placeholder="http://127.0.0.1:9080/api/fever.php" />
              </label>
            </div>
            <label class="settings-field">
              <span>API key</span>
              <input v-model="freshRssApiKey" type="password" placeholder="md5(username:apiPassword)" />
            </label>
            <p class="settings-help">
              Status: {{ freshRss.configured ? 'Configured' : 'Not configured' }} · Last sync:
              {{ freshRss.lastSyncAt ? new Date(freshRss.lastSyncAt).toLocaleString() : 'Never' }}
            </p>
            <p v-if="freshRss.lastSyncError" class="settings-help settings-help--error">{{ freshRss.lastSyncError }}</p>
            <div class="settings-inline">
              <button class="auth-submit" type="button" @click="saveFreshRssSection">Save FreshRSS</button>
              <button class="sidebar-header__button" type="button" @click="verifyFreshRssConnection">Verify</button>
              <button class="sidebar-header__button" type="button" @click="syncFreshRssNow">Sync now</button>
            </div>
          </section>

          <section v-else-if="activeTab === 'plugins'" class="settings-section">
            <h3>Image Storage</h3>
            <div class="settings-grid">
              <label class="settings-field">
                <span>Enabled</span>
                <select v-model="imageStorage['images.enabled']">
                  <option value="">Off</option>
                  <option value="1">On</option>
                </select>
              </label>
              <label class="settings-field">
                <span>Mode</span>
                <select v-model="imageStorage.mode">
                  <option value="local">Local</option>
                  <option value="remote">Remote</option>
                </select>
              </label>
              <label class="settings-field">
                <span>Storage path</span>
                <input v-model="imageStorage['images.storage_path']" type="text" placeholder="data/articles/images" />
              </label>
              <label class="settings-field">
                <span>Max size MB</span>
                <input v-model="imageStorage['images.max_size_mb']" type="number" min="1" max="100" />
              </label>
              <label class="settings-field">
                <span>Upload URL</span>
                <input v-model="imageStorage.url" type="text" placeholder="https://upload.example.com" />
              </label>
              <label class="settings-field">
                <span>Field name</span>
                <input v-model="imageStorage.fieldName" type="text" placeholder="image" />
              </label>
              <label class="settings-field">
                <span>Response path</span>
                <input v-model="imageStorage.respPath" type="text" placeholder="data.url" />
              </label>
              <label class="settings-field">
                <span>Healthcheck URL</span>
                <input v-model="imageStorage.healthcheckUrl" type="text" placeholder="https://upload.example.com/health" />
              </label>
            </div>
            <label class="settings-field">
              <span>Upload headers JSON</span>
              <textarea v-model="imageHeadersDraft" rows="4" placeholder='{"Authorization":"Bearer ..."}' />
            </label>
            <label class="settings-checkbox">
              <input v-model="clearImageHeaders" type="checkbox" />
              <span>Clear stored headers on save</span>
            </label>
            <div class="settings-inline">
              <button class="auth-submit" type="button" @click="saveImageStorageSection">Save Image Storage</button>
              <button class="sidebar-header__button" type="button" @click="runImageUploadTest">Test Upload</button>
              <button class="sidebar-header__button" type="button" @click="runImageHealthcheck">Healthcheck</button>
            </div>
          </section>

          <section v-else-if="activeTab === 'security'" class="settings-section">
            <h3>Password Auth</h3>
            <div class="settings-inline">
              <button
                class="sidebar-header__button"
                type="button"
                :disabled="passwordEnabled && !canDisablePassword"
                @click="togglePasswordEnabled(!passwordEnabled)"
              >
                {{ passwordEnabled ? 'Disable password auth' : 'Enable password auth' }}
              </button>
              <span class="settings-help">Current mode: {{ passwordEnabled ? 'On' : 'Off' }}</span>
            </div>

            <h3>Account</h3>
            <p class="settings-help">Signed in as {{ profile.email || 'unknown' }}</p>
            <div class="settings-grid">
              <label class="settings-field">
                <span>New email</span>
                <input v-model="security.newEmail" type="email" />
              </label>
              <label class="settings-field">
                <span>Password for email change</span>
                <input v-model="security.emailPassword" type="password" />
              </label>
              <label class="settings-field">
                <span>Current password</span>
                <input v-model="security.currentPassword" type="password" />
              </label>
              <label class="settings-field">
                <span>New password</span>
                <input v-model="security.newPassword" type="password" />
              </label>
              <label class="settings-field">
                <span>Confirm password</span>
                <input v-model="security.confirmPassword" type="password" />
              </label>
            </div>
            <div class="settings-actions">
              <button class="auth-submit" type="button" @click="saveSecuritySection">Save Security</button>
            </div>
          </section>

          <section v-else-if="activeTab === 'data'" class="settings-section">
            <h3>Import / Export</h3>
            <div class="settings-inline">
              <label class="sidebar-header__button settings-file-button">
                <input type="file" accept=".opml,.xml" hidden @change="handleOpmlFile" />
                Preview OPML
              </label>
              <button class="sidebar-header__button" type="button" @click="exportOpml">Export OPML</button>
            </div>
            <div v-if="previewData" class="settings-card">
              <p><strong>Preview:</strong> {{ previewData.totalCount }} feeds, {{ previewData.duplicateCount }} duplicates</p>
              <button class="auth-submit" type="button" :disabled="importing" @click="importPreviewOpml">
                {{ importing ? 'Importing…' : 'Import All Previewed Feeds' }}
              </button>
            </div>

            <h3>Retention</h3>
            <div class="settings-grid">
              <label class="settings-field">
                <span>Retention enabled</span>
                <select v-model="prefs['retention.enabled']">
                  <option value="on">On</option>
                  <option value="off">Off</option>
                </select>
              </label>
              <label class="settings-field">
                <span>Read days</span>
                <input v-model="prefs['retention.read_days']" type="number" min="1" max="9999" />
              </label>
              <label class="settings-field">
                <span>Unread days</span>
                <input v-model="prefs['retention.unread_days']" type="number" min="1" max="9999" />
              </label>
            </div>
            <p v-if="retentionStats" class="settings-help">
              Eligible now: {{ retentionStats.readEligible }} read + {{ retentionStats.unreadEligible }} unread
            </p>
            <div class="settings-inline">
              <button class="auth-submit" type="button" @click="saveRetentionSettings">Save Retention</button>
              <button class="sidebar-header__button" type="button" @click="purgeRetentionNow">Purge Now</button>
            </div>
          </section>

          <section v-else-if="activeTab === 'about'" class="settings-section">
            <h3>About</h3>
            <div class="settings-card">
              <p><strong>Version:</strong> {{ __APP_VERSION__ }}</p>
              <p><strong>Commit:</strong> {{ health?.gitCommit || 'dev' }}</p>
              <p><strong>Tag:</strong> {{ health?.gitTag || 'dev' }}</p>
              <p><strong>Build date:</strong> {{ health?.buildDate || 'unknown' }}</p>
            </div>
          </section>
        </div>
      </div>
    </section>
  </div>
</template>

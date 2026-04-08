<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import type { ArticleDetail, ArticleListItem, Category, FeedWithCounts } from '../../../shared/types'
import {
  ApiRequestError,
  archiveArticleImages,
  clipArticleFromUrl,
  createCategory,
  createFeed,
  getArticleByUrl,
  getArticles,
  getCategories,
  getFeeds,
  getStats,
  markCategoryAllSeen,
  markFeedAllSeen,
  logout,
  recordRead,
  setBookmarked,
  setLiked,
  setSeen,
  summarizeArticle,
  translateArticle,
  type StatsResponse,
} from '@mrrss/lib/api'
import ArticleDetailPane from './ArticleDetailPane.vue'
import SettingsPanel from './SettingsPanel.vue'

type FilterMode = 'all' | 'unread' | 'liked' | 'bookmarked' | 'read' | 'gallery' | 'clips'
type Selection =
  | { kind: 'filter'; value: FilterMode }
  | { kind: 'feed'; value: number }
  | { kind: 'category'; value: number }
type ComposeMode = 'feed' | 'clip' | 'category'

const props = defineProps<{
  email: string
}>()

const emit = defineEmits<{
  logout: []
}>()

const selection = ref<Selection>({ kind: 'filter', value: 'all' })
const stats = ref<StatsResponse | null>(null)
const feeds = ref<FeedWithCounts[]>([])
const categories = ref<Category[]>([])
const clipFeedId = ref<number | null>(null)
const articles = ref<ArticleListItem[]>([])
const totalArticles = ref(0)
const articleLoading = ref(false)
const sidebarLoading = ref(true)
const detailLoading = ref(false)
const selectedArticleUrl = ref<string | null>(null)
const selectedArticle = ref<ArticleDetail | null>(null)
const sidebarError = ref('')
const articleError = ref('')
const readRecordedForId = ref<number | null>(null)
const settingsOpen = ref(false)
const summarizing = ref(false)
const translating = ref(false)
const archiving = ref(false)
const flashMessage = ref<{ type: 'success' | 'error'; text: string } | null>(null)
const feedSearchQuery = ref('')
const addMenuOpen = ref(false)
const activityBarCollapsed = ref(false)
const feedListExpanded = ref(true)
const composeOpen = ref(false)
const composeMode = ref<ComposeMode>('feed')
const composeLoading = ref(false)
const composeError = ref('')
const feedFormUrl = ref('')
const feedFormName = ref('')
const feedFormCategoryId = ref<number | ''>('')
const clipFormUrl = ref('')
const clipFormForce = ref(false)
const clipConflict = ref<{ feedName: string } | null>(null)
const categoryFormName = ref('')
const showOnlyUnreadInList = ref(false)
const articleFilterOpen = ref(false)
const articleSearchQuery = ref('')
const markingAllRead = ref(false)

const deferredUnreadAutoReadIds = new Set<number>()
const deferredUnreadManualReadIds = new Set<number>()

const globalFilters = computed(() => [
  { key: 'all' as const, label: 'All Articles', count: stats.value?.total_articles ?? 0 },
  { key: 'unread' as const, label: 'Unread', count: stats.value?.unread_articles ?? 0 },
  { key: 'liked' as const, label: 'Liked', count: stats.value?.liked_articles ?? 0 },
  { key: 'bookmarked' as const, label: 'Read Later', count: stats.value?.bookmarked_articles ?? 0 },
  { key: 'read' as const, label: 'Read', count: stats.value?.read_articles ?? 0 },
  { key: 'gallery' as const, label: 'Multimedia Gallery', count: 0 },
  {
    key: 'clips' as const,
    label: 'Clips',
    count: clipFeedId.value != null ? feeds.value.find(feed => feed.id === clipFeedId.value)?.article_count ?? 0 : 0,
  },
])

const groupedFeeds = computed(() => {
  const byCategory = new Map<number, FeedWithCounts[]>()
  const uncategorized: FeedWithCounts[] = []

  for (const feed of feeds.value) {
    if (feed.category_id == null) {
      uncategorized.push(feed)
      continue
    }

    const group = byCategory.get(feed.category_id) ?? []
    group.push(feed)
    byCategory.set(feed.category_id, group)
  }

  return {
    categories: categories.value
      .map(category => ({
        category,
        feeds: byCategory.get(category.id) ?? [],
      }))
      .filter(group => group.feeds.length > 0),
    uncategorized,
  }
})

const filteredGroupedFeeds = computed(() => {
  const query = feedSearchQuery.value.trim().toLowerCase()
  if (!query) return groupedFeeds.value.categories

  return groupedFeeds.value.categories
    .map(group => ({
      category: group.category,
      feeds: group.feeds.filter(feed =>
        feed.name.toLowerCase().includes(query) || feed.url.toLowerCase().includes(query),
      ),
    }))
    .filter(group => group.feeds.length > 0 || group.category.name.toLowerCase().includes(query))
})

const filteredUncategorizedFeeds = computed(() => {
  const query = feedSearchQuery.value.trim().toLowerCase()
  if (!query) return groupedFeeds.value.uncategorized

  return groupedFeeds.value.uncategorized.filter(feed =>
    feed.name.toLowerCase().includes(query) || feed.url.toLowerCase().includes(query),
  )
})

const currentLabel = computed(() => {
  if (selection.value.kind === 'filter') {
    return globalFilters.value.find(filter => filter.key === selection.value.value)?.label ?? 'All Articles'
  }
  if (selection.value.kind === 'feed') {
    return feeds.value.find(feed => feed.id === selection.value.value)?.name ?? 'Feed'
  }
  return categories.value.find(category => category.id === selection.value.value)?.name ?? 'Category'
})

const isUnreadMode = computed(() => selection.value.kind === 'filter' && selection.value.value === 'unread')
const categoriesSorted = computed(() => [...categories.value].sort((a, b) => a.name.localeCompare(b.name)))
const composeTitle = computed(() => {
  if (composeMode.value === 'feed') return 'Add Feed'
  if (composeMode.value === 'clip') return 'Clip Page'
  return 'Add Category'
})

const currentQuery = computed(() => {
  if (selection.value.kind === 'filter') {
    switch (selection.value.value) {
      case 'unread':
        return { unread: true, limit: 100 }
      case 'liked':
        return { liked: true, limit: 100 }
      case 'bookmarked':
        return { bookmarked: true, limit: 100 }
      case 'read':
        return { read: true, limit: 100 }
      case 'gallery':
        return { limit: 100 }
      case 'clips':
        return clipFeedId.value != null ? { feed_id: clipFeedId.value, limit: 100, no_floor: true } : { limit: 100 }
      default:
        return { limit: 100 }
    }
  }

  if (selection.value.kind === 'feed') {
    return { feed_id: selection.value.value, limit: 100, no_floor: true }
  }

  return { category_id: selection.value.value, limit: 100, no_floor: true }
})

function isMediaCandidate(article: ArticleListItem) {
  const haystack = `${article.title ?? ''}\n${article.excerpt ?? ''}\n${article.summary ?? ''}`
  return /<img\b|!\[[^\]]*\]\(|\.(png|jpe?g|gif|webp|svg)(\?|$)/i.test(haystack)
}

function articlePreviewImage(article: ArticleListItem) {
  const haystack = `${article.summary ?? ''}\n${article.excerpt ?? ''}`
  const htmlMatch = haystack.match(/<img[^>]+src=['"]([^'"]+)['"]/i)
  if (htmlMatch?.[1]) return htmlMatch[1]
  const markdownMatch = haystack.match(/!\[[^\]]*\]\((https?:\/\/[^)\s]+)\)/i)
  if (markdownMatch?.[1]) return markdownMatch[1]
  return ''
}

const displayedArticles = computed(() => {
  const query = articleSearchQuery.value.trim().toLowerCase()
  return articles.value.filter(article => {
    if (showOnlyUnreadInList.value && article.seen_at != null) return false
    if (selection.value.kind === 'filter' && selection.value.value === 'gallery' && !isMediaCandidate(article)) return false
    if (!query) return true
    const text = `${article.title ?? ''} ${article.excerpt ?? ''} ${article.summary ?? ''} ${article.feed_name ?? ''}`.toLowerCase()
    return text.includes(query)
  })
})

const isGalleryMode = computed(() => selection.value.kind === 'filter' && selection.value.value === 'gallery')

function showMessage(type: 'success' | 'error', text: string) {
  flashMessage.value = { type, text }
  window.setTimeout(() => {
    if (flashMessage.value?.text === text) flashMessage.value = null
  }, 2500)
}

function moveSelection(delta: 1 | -1) {
  if (displayedArticles.value.length === 0) return
  const index = displayedArticles.value.findIndex(article => article.url === selectedArticleUrl.value)
  const nextIndex = index === -1
    ? 0
    : Math.min(displayedArticles.value.length - 1, Math.max(0, index + delta))
  selectedArticleUrl.value = displayedArticles.value[nextIndex]?.url ?? selectedArticleUrl.value
}

function handleKeyDown(event: KeyboardEvent) {
  if (settingsOpen.value) {
    if (event.key === 'Escape') settingsOpen.value = false
    return
  }
  if (event.metaKey || event.ctrlKey || event.altKey) return

  const target = event.target as HTMLElement | null
  if (target && (
    target.tagName === 'INPUT'
    || target.tagName === 'TEXTAREA'
    || target.tagName === 'SELECT'
    || target.isContentEditable
  )) {
    return
  }

  if (event.key === 'j') {
    moveSelection(1)
    event.preventDefault()
    return
  }
  if (event.key === 'k') {
    moveSelection(-1)
    event.preventDefault()
    return
  }
  if (event.key === 'r') {
    void handleToggleRead()
    event.preventDefault()
    return
  }
  if (event.key === 'f') {
    void handleToggleLiked()
    event.preventDefault()
    return
  }
  if (event.key === 'l') {
    void handleToggleBookmarked()
    event.preventDefault()
    return
  }
  if (event.key === 'Escape') {
    if (composeOpen.value) {
      closeCompose()
      event.preventDefault()
      return
    }
  }
}

onMounted(async () => {
  activityBarCollapsed.value = localStorage.getItem('mrrss.activity-collapsed') === 'true'
  const storedFeedExpanded = localStorage.getItem('mrrss.feed-expanded')
  feedListExpanded.value = storedFeedExpanded == null ? true : storedFeedExpanded === 'true'
  await refreshSidebar()
  window.addEventListener('keydown', handleKeyDown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeyDown)
})

watch(currentQuery, async () => {
  await loadArticles()
}, { deep: true, immediate: true })

watch(selectedArticleUrl, async (url) => {
  if (!url) {
    selectedArticle.value = null
    return
  }
  await loadDetail(url)
})

watch(displayedArticles, (next) => {
  if (!selectedArticleUrl.value) return
  if (!next.some(article => article.url === selectedArticleUrl.value)) {
    selectedArticleUrl.value = next[0]?.url ?? null
  }
}, { deep: true })

async function refreshSidebar(silent = false) {
  if (!silent) {
    sidebarError.value = ''
    sidebarLoading.value = true
  }

  try {
    const [feedData, categoryData, statsData] = await Promise.all([
      getFeeds(),
      getCategories(),
      getStats(),
    ])

    feeds.value = feedData.feeds
    clipFeedId.value = feedData.clip_feed_id
    categories.value = categoryData.categories
    stats.value = {
      ...statsData,
      bookmarked_articles: feedData.bookmark_count,
      liked_articles: feedData.like_count,
    }
  } catch (err) {
    sidebarError.value = err instanceof Error ? err.message : 'Failed to load sidebar data.'
  } finally {
    if (!silent || sidebarLoading.value) sidebarLoading.value = false
  }
}

function openCompose(mode: ComposeMode) {
  addMenuOpen.value = false
  composeMode.value = mode
  composeOpen.value = true
  composeError.value = ''
  clipConflict.value = null
  clipFormForce.value = false
}

function closeCompose() {
  composeOpen.value = false
  composeError.value = ''
  clipConflict.value = null
  clipFormForce.value = false
}

async function handleCreateFeed() {
  if (!feedFormUrl.value.trim()) {
    composeError.value = 'Feed URL is required'
    return
  }
  composeLoading.value = true
  composeError.value = ''
  try {
    await createFeed({
      url: feedFormUrl.value.trim(),
      name: feedFormName.value.trim() || undefined,
      category_id: feedFormCategoryId.value === '' ? null : feedFormCategoryId.value,
    })
    await refreshSidebar(true)
    await loadArticles()
    feedFormUrl.value = ''
    feedFormName.value = ''
    feedFormCategoryId.value = ''
    closeCompose()
    showMessage('success', 'Feed added')
  } catch (error) {
    composeError.value = error instanceof Error ? error.message : 'Failed to add feed'
  } finally {
    composeLoading.value = false
  }
}

async function handleClipArticle() {
  if (!clipFormUrl.value.trim()) {
    composeError.value = 'Page URL is required'
    return
  }
  composeLoading.value = true
  composeError.value = ''
  clipConflict.value = null
  try {
    await clipArticleFromUrl(clipFormUrl.value.trim(), clipFormForce.value)
    await refreshSidebar(true)
    await loadArticles()
    clipFormUrl.value = ''
    clipFormForce.value = false
    closeCompose()
    showMessage('success', 'Page clipped')
  } catch (error) {
    if (error instanceof ApiRequestError && error.status === 409) {
      const data = error.data as { can_force?: boolean; article?: { feed_name?: string; feed_id?: number; url?: string } }
      if (data?.can_force && data.article) {
        clipConflict.value = { feedName: data.article.feed_name || 'another feed' }
      } else {
        composeError.value = 'This page is already in Clips.'
      }
    } else {
      composeError.value = error instanceof Error ? error.message : 'Failed to clip page'
    }
  } finally {
    composeLoading.value = false
  }
}

async function handleForceClip() {
  clipFormForce.value = true
  await handleClipArticle()
}

async function handleCreateCategory() {
  if (!categoryFormName.value.trim()) {
    composeError.value = 'Category name is required'
    return
  }
  composeLoading.value = true
  composeError.value = ''
  try {
    await createCategory(categoryFormName.value.trim())
    await refreshSidebar(true)
    categoryFormName.value = ''
    closeCompose()
    showMessage('success', 'Category created')
  } catch (error) {
    composeError.value = error instanceof Error ? error.message : 'Failed to create category'
  } finally {
    composeLoading.value = false
  }
}

async function loadArticles() {
  articleError.value = ''
  articleLoading.value = true

  try {
    const data = await getArticles(currentQuery.value)
    articles.value = data.articles.map(article => {
      if (!deferredUnreadManualReadIds.has(article.id)) return article
      const now = new Date().toISOString()
      return {
        ...article,
        seen_at: article.seen_at ?? now,
        read_at: article.read_at ?? now,
      }
    })
    totalArticles.value = data.total

    if (selectedArticleUrl.value && !data.articles.some(article => article.url === selectedArticleUrl.value)) {
      selectedArticleUrl.value = null
    }
  } catch (err) {
    articleError.value = err instanceof Error ? err.message : 'Failed to load articles.'
    articles.value = []
    totalArticles.value = 0
    selectedArticleUrl.value = null
  } finally {
    articleLoading.value = false
  }
}

async function loadDetail(url: string) {
  detailLoading.value = true
  try {
    const article = await getArticleByUrl(url)
    const deferredRead = deferredUnreadManualReadIds.has(article.id)
    selectedArticle.value = deferredRead
      ? {
          ...article,
          seen_at: article.seen_at ?? new Date().toISOString(),
          read_at: article.read_at ?? new Date().toISOString(),
        }
      : article
    syncArticleIntoList(selectedArticle.value)

    if (isUnreadMode.value && article.seen_at == null && article.read_at == null) {
      deferredUnreadAutoReadIds.add(article.id)
      return
    }

    if ((article.seen_at == null || article.read_at == null) && readRecordedForId.value !== article.id) {
      readRecordedForId.value = article.id
      const result = await recordRead(article.id)
      selectedArticle.value = {
        ...article,
        seen_at: result.seen_at ?? article.seen_at ?? new Date().toISOString(),
        read_at: result.read_at ?? article.read_at ?? new Date().toISOString(),
      }
      syncArticleIntoList(selectedArticle.value)
      void refreshSidebar(true)
      if (selection.value.kind === 'filter' && (selection.value.value === 'unread' || selection.value.value === 'read')) {
        void loadArticles()
      }
    }
  } catch {
    selectedArticle.value = null
  } finally {
    detailLoading.value = false
  }
}

function syncArticleIntoList(article: ArticleDetail | null) {
  if (!article) return
  articles.value = articles.value.map(item => item.id === article.id ? {
    ...item,
    seen_at: article.seen_at,
    read_at: article.read_at,
    liked_at: article.liked_at,
    bookmarked_at: article.bookmarked_at,
    summary: article.summary,
  } : item)
}

async function flushDeferredUnreadReads() {
  const ids = new Set<number>([
    ...deferredUnreadAutoReadIds,
    ...deferredUnreadManualReadIds,
  ])
  if (ids.size === 0) return

  await Promise.all(Array.from(ids).map(async (id) => {
    try {
      await recordRead(id)
    } catch {
      // keep mode changes resilient if one read update fails
    }
  }))

  deferredUnreadAutoReadIds.clear()
  deferredUnreadManualReadIds.clear()
  await refreshSidebar(true)
}

async function selectFilter(filter: FilterMode) {
  if (isUnreadMode.value && filter !== 'unread') {
    await flushDeferredUnreadReads()
  }
  selection.value = { kind: 'filter', value: filter }
}

async function selectFeed(feedId: number) {
  if (isUnreadMode.value) {
    await flushDeferredUnreadReads()
  }
  selection.value = { kind: 'feed', value: feedId }
}

async function selectCategory(categoryId: number) {
  if (isUnreadMode.value) {
    await flushDeferredUnreadReads()
  }
  selection.value = { kind: 'category', value: categoryId }
}

async function handleToggleRead() {
  if (!selectedArticle.value) return
  const article = selectedArticle.value
  const markUnread = Boolean(article.read_at || article.seen_at)

  if (isUnreadMode.value) {
    if (markUnread) {
      deferredUnreadManualReadIds.delete(article.id)
      deferredUnreadAutoReadIds.delete(article.id)
      selectedArticle.value = { ...article, seen_at: null, read_at: null }
    } else {
      deferredUnreadManualReadIds.add(article.id)
      deferredUnreadAutoReadIds.delete(article.id)
      const now = new Date().toISOString()
      selectedArticle.value = { ...article, seen_at: now, read_at: now }
    }

    syncArticleIntoList(selectedArticle.value)
    return
  }

  if (markUnread) {
    const result = await setSeen(article.id, false)
    selectedArticle.value = { ...article, seen_at: result.seen_at, read_at: result.read_at }
  } else {
    const result = await recordRead(article.id)
    selectedArticle.value = {
      ...article,
      seen_at: result.seen_at ?? new Date().toISOString(),
      read_at: result.read_at ?? new Date().toISOString(),
    }
  }

  syncArticleIntoList(selectedArticle.value)
  await refreshSidebar(true)
  await loadArticles()
}

async function handleToggleLiked() {
  if (!selectedArticle.value) return
  const article = selectedArticle.value
  const result = await setLiked(article.id, !article.liked_at)
  selectedArticle.value = { ...article, liked_at: result.liked_at }
  syncArticleIntoList(selectedArticle.value)
  await refreshSidebar(true)
  await loadArticles()
}

async function handleToggleBookmarked() {
  if (!selectedArticle.value) return
  const article = selectedArticle.value
  const result = await setBookmarked(article.id, !article.bookmarked_at)
  selectedArticle.value = { ...article, bookmarked_at: result.bookmarked_at }
  syncArticleIntoList(selectedArticle.value)
  await refreshSidebar()
  await loadArticles()
}

async function handleMarkAllAsRead() {
  if (markingAllRead.value) return
  markingAllRead.value = true
  try {
    if (selection.value.kind === 'feed') {
      await markFeedAllSeen(selection.value.value)
    } else if (selection.value.kind === 'category') {
      await markCategoryAllSeen(selection.value.value)
    } else {
      const targets = articles.value.filter(article => article.seen_at == null).map(article => article.id)
      await Promise.all(targets.map(id => recordRead(id)))
    }
    deferredUnreadAutoReadIds.clear()
    deferredUnreadManualReadIds.clear()
    await refreshSidebar(true)
    await loadArticles()
    showMessage('success', 'Marked as read')
  } catch (error) {
    showMessage('error', error instanceof Error ? error.message : 'Failed to mark as read')
  } finally {
    markingAllRead.value = false
  }
}

async function handleSummarize() {
  if (!selectedArticle.value || summarizing.value) return
  summarizing.value = true
  try {
    const result = await summarizeArticle(selectedArticle.value.id)
    selectedArticle.value = { ...selectedArticle.value, summary: result.text }
    syncArticleIntoList(selectedArticle.value)
    showMessage('success', 'Article summary updated')
  } catch (error) {
    showMessage('error', error instanceof Error ? error.message : 'Summarization failed')
  } finally {
    summarizing.value = false
  }
}

async function handleTranslate() {
  if (!selectedArticle.value || translating.value) return
  translating.value = true
  try {
    const result = await translateArticle(selectedArticle.value.id)
    selectedArticle.value = {
      ...selectedArticle.value,
      full_text_translated: result.text,
      translated_lang: 'configured',
    }
    showMessage('success', 'Article translation updated')
  } catch (error) {
    showMessage('error', error instanceof Error ? error.message : 'Translation failed')
  } finally {
    translating.value = false
  }
}

async function handleArchiveImages() {
  if (!selectedArticle.value || archiving.value) return
  archiving.value = true
  try {
    await archiveArticleImages(selectedArticle.value.id)
    selectedArticle.value = {
      ...selectedArticle.value,
      images_archived_at: new Date().toISOString(),
    }
    showMessage('success', 'Image archive job started')
  } catch (error) {
    showMessage('error', error instanceof Error ? error.message : 'Image archive failed')
  } finally {
    archiving.value = false
  }
}

async function handleLogout() {
  try {
    await logout()
  } catch {
    // local logout still proceeds
  }
  emit('logout')
}

function toggleFeedList() {
  feedListExpanded.value = !feedListExpanded.value
  localStorage.setItem('mrrss.feed-expanded', String(feedListExpanded.value))
}

function toggleActivityBar() {
  activityBarCollapsed.value = !activityBarCollapsed.value
  localStorage.setItem('mrrss.activity-collapsed', String(activityBarCollapsed.value))
}

function filterIconName(filter: FilterMode) {
  switch (filter) {
    case 'all': return 'grid'
    case 'unread': return 'inbox'
    case 'liked': return 'star'
    case 'bookmarked': return 'bookmark'
    case 'read': return 'clock'
    case 'gallery': return 'gallery'
    case 'clips': return 'clip'
  }
}

function faviconUrl(rawUrl: string) {
  try {
    const hostname = new URL(rawUrl).hostname
    return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(hostname)}&sz=32`
  } catch {
    return ''
  }
}
</script>

<template>
  <div
    class="reader-shell"
    :class="{
      'reader-shell--activity-collapsed': activityBarCollapsed,
      'reader-shell--feed-collapsed': !feedListExpanded,
    }"
  >
    <nav class="mode-rail" :class="{ 'is-collapsed': activityBarCollapsed }">
      <button
        v-if="activityBarCollapsed"
        class="mode-rail__edge-toggle"
        type="button"
        title="Expand Activity Bar"
        @click="toggleActivityBar"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M9 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="1.8" />
        </svg>
      </button>
      <template v-else>
      <div class="mode-rail__top">
        <div class="mode-rail__brand">N</div>
        <button
          v-for="filter in globalFilters"
          :key="filter.key"
          class="mode-rail__button"
          :class="{ 'is-active': selection.kind === 'filter' && selection.value === filter.key }"
          type="button"
          :title="filter.label"
          @click="selectFilter(filter.key)"
        >
          <svg v-if="filterIconName(filter.key) === 'grid'" viewBox="0 0 24 24" aria-hidden="true">
            <template v-if="selection.kind === 'filter' && selection.value === filter.key">
              <rect x="4" y="4" width="6" height="6" rx="1.2" />
              <rect x="14" y="4" width="6" height="6" rx="1.2" />
              <rect x="4" y="14" width="6" height="6" rx="1.2" />
              <rect x="14" y="14" width="6" height="6" rx="1.2" />
            </template>
            <template v-else>
              <path d="M5 7h14M5 12h14M5 17h14" fill="none" stroke="currentColor" stroke-width="1.8" />
              <circle cx="7" cy="7" r="1" fill="currentColor" />
              <circle cx="7" cy="12" r="1" fill="currentColor" />
              <circle cx="7" cy="17" r="1" fill="currentColor" />
            </template>
          </svg>
          <svg v-else-if="filterIconName(filter.key) === 'inbox'" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M4 5h16v12H4z" fill="none" stroke="currentColor" stroke-width="1.8" />
            <path d="M4 14h4l2 3h4l2-3h4" fill="none" stroke="currentColor" stroke-width="1.8" />
          </svg>
          <svg v-else-if="filterIconName(filter.key) === 'star'" viewBox="0 0 24 24" aria-hidden="true">
            <path
              d="m12 4 2.5 5.2 5.7.8-4.1 4 1 5.8L12 17l-5.1 2.8 1-5.8-4.1-4 5.7-.8z"
              :fill="selection.kind === 'filter' && selection.value === filter.key ? 'currentColor' : 'none'"
              stroke="currentColor"
              stroke-width="1.8"
            />
          </svg>
          <svg v-else-if="filterIconName(filter.key) === 'bookmark'" viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="1.8" />
            <path d="M12 7v5l-3 2" fill="none" stroke="currentColor" stroke-width="1.8" />
            <path d="M6.6 9.6A7.9 7.9 0 0 1 12 4" fill="none" stroke="currentColor" stroke-width="1.8" />
          </svg>
          <svg v-else-if="filterIconName(filter.key) === 'clock'" viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="1.8" />
            <path d="M12 8v5l3 2" fill="none" stroke="currentColor" stroke-width="1.8" />
            <circle cx="18.4" cy="7.2" r="1.2" fill="currentColor" />
          </svg>
          <svg v-else-if="filterIconName(filter.key) === 'gallery'" viewBox="0 0 24 24" aria-hidden="true">
            <rect x="4" y="5" width="16" height="14" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.8" />
            <path d="M8 14l2.5-2.5 2.5 2.5 3-3L20 14" fill="none" stroke="currentColor" stroke-width="1.8" />
            <circle cx="9" cy="9" r="1.4" fill="currentColor" />
          </svg>
          <svg v-else viewBox="0 0 24 24" aria-hidden="true">
            <rect x="5" y="6" width="12" height="12" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.8" />
            <path d="M17 10h2.5a1.5 1.5 0 0 1 0 3H17" fill="none" stroke="currentColor" stroke-width="1.8" />
          </svg>
          <span v-if="filter.key === 'all' && (stats?.unread_articles ?? 0) > 0" class="mode-rail__badge">
            {{ (stats?.unread_articles ?? 0) > 99 ? '99+' : (stats?.unread_articles ?? 0) }}
          </span>
        </button>
      </div>

      <div class="mode-rail__bottom">
        <div class="mode-rail__menu-anchor">
          <button class="mode-rail__button" type="button" title="Add" @click="addMenuOpen = !addMenuOpen">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 5v14M5 12h14" fill="none" stroke="currentColor" stroke-width="1.8" />
            </svg>
          </button>
          <div v-if="addMenuOpen" class="quick-add-menu">
            <button type="button" @click="openCompose('feed')">Add Feed</button>
            <button type="button" @click="openCompose('clip')">Clip Page</button>
            <button type="button" @click="openCompose('category')">Add Category</button>
          </div>
        </div>
        <button class="mode-rail__button" type="button" title="Settings" @click="settingsOpen = true">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 8.6A3.4 3.4 0 1 0 12 15.4 3.4 3.4 0 1 0 12 8.6z" fill="none" stroke="currentColor" stroke-width="1.8" />
            <path d="M4.5 13.2v-2.4l2-.6.5-1.2-1-1.9 1.7-1.7 1.9 1 .2-.1 1-.4.6-2h2.4l.6 2 1.2.5 1.9-1 1.7 1.7-1 1.9.5 1.2 2 .6v2.4l-2 .6-.5 1.2 1 1.9-1.7 1.7-1.9-1-1.2.5-.6 2h-2.4l-.6-2-1.2-.5-1.9 1-1.7-1.7 1-1.9-.5-1.2z" fill="none" stroke="currentColor" stroke-width="1.2" />
          </svg>
        </button>
        <button class="mode-rail__button" type="button" title="Log out" @click="handleLogout">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M10 6H6v12h4" fill="none" stroke="currentColor" stroke-width="1.8" />
            <path d="M13 8l4 4-4 4" fill="none" stroke="currentColor" stroke-width="1.8" />
            <path d="M9 12h8" fill="none" stroke="currentColor" stroke-width="1.8" />
          </svg>
        </button>
        <button
          class="mode-rail__button"
          type="button"
          :title="feedListExpanded ? 'Collapse Feed List' : 'Expand Feed List'"
          @click="toggleFeedList"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <rect x="4" y="5" width="16" height="14" rx="1.8" fill="none" stroke="currentColor" stroke-width="1.8" />
            <path d="M9 5v14" fill="none" stroke="currentColor" stroke-width="1.8" />
            <path
              v-if="feedListExpanded"
              d="M12.5 12h5"
              fill="none"
              stroke="currentColor"
              stroke-width="1.8"
            />
            <path
              v-else
              d="M12.5 12h5M15 9.5 12.5 12l2.5 2.5"
              fill="none"
              stroke="currentColor"
              stroke-width="1.8"
            />
          </svg>
        </button>
        <button class="mode-rail__button" type="button" title="Collapse Activity Bar" @click="toggleActivityBar">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M5 6v12M9 7h10M9 12h8M9 17h10" fill="none" stroke="currentColor" stroke-width="1.8" />
          </svg>
        </button>
      </div>
      </template>
    </nav>

    <aside v-if="feedListExpanded" class="feeds-pane">
      <header class="feeds-pane__header">
        <div class="pane-title">
          <h2>Feeds</h2>
        </div>
        <div class="pane-actions">
          <button class="pane-icon-button" type="button" title="Refresh" @click="refreshSidebar">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M20 6v5h-5" fill="none" stroke="currentColor" stroke-width="1.8" />
              <path d="M20 11a8 8 0 1 0 2 5.3" fill="none" stroke="currentColor" stroke-width="1.8" />
            </svg>
          </button>
          <button class="pane-icon-button" type="button" title="Close" @click="toggleFeedList">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M7 7l10 10M17 7L7 17" fill="none" stroke="currentColor" stroke-width="1.8" />
            </svg>
          </button>
        </div>
      </header>

      <div class="feeds-pane__search">
        <input v-model="feedSearchQuery" type="text" placeholder="Search feeds..." />
      </div>

      <section class="feeds-tree">
        <p v-if="sidebarLoading" class="pane-flat-state">Loading feeds…</p>
        <p v-else-if="sidebarError" class="pane-flat-state pane-flat-state--error">{{ sidebarError }}</p>
        <template v-else>
          <div
            v-for="group in filteredGroupedFeeds"
            :key="group.category.id"
            class="tree-group"
          >
            <button
              class="tree-category"
              :class="{ 'is-active': selection.kind === 'category' && selection.value === group.category.id }"
              type="button"
              @click="selectCategory(group.category.id)"
            >
              <span class="tree-label">{{ group.category.name }}</span>
              <strong>{{ group.feeds.reduce((total, feed) => total + feed.unread_count, 0) }}</strong>
            </button>
            <button
              v-for="feed in group.feeds"
              :key="feed.id"
              class="tree-feed"
              :class="{ 'is-active': selection.kind === 'feed' && selection.value === feed.id }"
              type="button"
              @click="selectFeed(feed.id)"
            >
              <span class="tree-feed__main">
                <img class="favicon" :src="faviconUrl(feed.url)" alt="" loading="lazy" />
                <span class="tree-label">{{ feed.name }}</span>
              </span>
              <strong>{{ feed.unread_count }}</strong>
            </button>
          </div>

          <div v-if="filteredUncategorizedFeeds.length > 0" class="tree-group">
            <p class="tree-group__label">Uncategorized</p>
            <button
              v-for="feed in filteredUncategorizedFeeds"
              :key="feed.id"
              class="tree-feed"
              :class="{ 'is-active': selection.kind === 'feed' && selection.value === feed.id }"
              type="button"
              @click="selectFeed(feed.id)"
            >
              <span class="tree-feed__main">
                <img class="favicon" :src="faviconUrl(feed.url)" alt="" loading="lazy" />
                <span class="tree-label">{{ feed.name }}</span>
              </span>
              <strong>{{ feed.unread_count }}</strong>
            </button>
          </div>
        </template>
      </section>
    </aside>

    <main class="articles-pane">
      <header class="articles-pane__header">
        <div class="pane-title">
          <h2>{{ currentLabel }}</h2>
        </div>
        <div class="pane-actions pane-actions--article-controls">
          <button
            class="pane-icon-button"
            type="button"
            :disabled="markingAllRead"
            title="Mark All as Read"
            aria-label="Mark All as Read"
            @click="handleMarkAllAsRead"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="1.8" />
              <path d="m8.6 12.2 2.2 2.2 4.8-4.8" fill="none" stroke="currentColor" stroke-width="1.8" />
            </svg>
          </button>
          <button
            class="pane-icon-button"
            type="button"
            title="Show only unread articles"
            aria-label="Show only unread articles"
            :class="{ 'is-active': showOnlyUnreadInList }"
            @click="showOnlyUnreadInList = !showOnlyUnreadInList"
          >
            <svg v-if="showOnlyUnreadInList" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M3 12s3.5-6 9-6 9 6 9 6-3.5 6-9 6-9-6-9-6z" fill="none" stroke="currentColor" stroke-width="1.8" />
              <circle cx="12" cy="12" r="2.8" fill="none" stroke="currentColor" stroke-width="1.8" />
            </svg>
            <svg v-else viewBox="0 0 24 24" aria-hidden="true">
              <path d="M3 12s3.5-6 9-6 9 6 9 6-3.5 6-9 6-9-6-9-6z" fill="none" stroke="currentColor" stroke-width="1.8" />
              <path d="M4 4l16 16" fill="none" stroke="currentColor" stroke-width="1.8" />
            </svg>
          </button>
          <button
            class="pane-icon-button"
            type="button"
            title="Filter"
            aria-label="Filter"
            :class="{ 'is-active': articleFilterOpen }"
            @click="articleFilterOpen = !articleFilterOpen"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M4 6h16M7 12h10M10 18h4" fill="none" stroke="currentColor" stroke-width="1.8" />
            </svg>
          </button>
          <button class="pane-icon-button" type="button" title="Refresh" @click="loadArticles">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M20 6v5h-5" fill="none" stroke="currentColor" stroke-width="1.8" />
              <path d="M20 11a8 8 0 1 0 2 5.3" fill="none" stroke="currentColor" stroke-width="1.8" />
            </svg>
          </button>
        </div>
      </header>
      <div v-if="articleFilterOpen" class="articles-pane__filter-row">
        <input v-model="articleSearchQuery" type="text" placeholder="Filter articles..." />
      </div>

      <p v-if="flashMessage" class="settings-message" :class="{ 'is-error': flashMessage.type === 'error' }">
        {{ flashMessage.text }}
      </p>

      <div class="articles-pane__list">
        <div v-if="articleError" class="pane-flat-state pane-flat-state--error">{{ articleError }}</div>
        <div v-else-if="articleLoading" class="pane-flat-state">Loading articles…</div>
        <div v-else-if="displayedArticles.length === 0" class="pane-flat-state">No articles found.</div>
        <div v-else-if="isGalleryMode" class="gallery-grid">
          <button
            v-for="article in displayedArticles"
            :key="article.id"
            class="gallery-card"
            :class="{ 'is-active': selectedArticleUrl === article.url }"
            type="button"
            @click="selectedArticleUrl = article.url"
          >
            <img
              class="gallery-card__image"
              :src="articlePreviewImage(article) || faviconUrl(article.url)"
              alt=""
              loading="lazy"
            />
            <div class="gallery-card__meta">
              <h3>{{ article.title }}</h3>
              <p>{{ article.feed_name }}</p>
            </div>
          </button>
        </div>
        <button
          v-else
          v-for="article in displayedArticles"
          :key="article.id"
          class="article-row"
          :class="{ 'is-active': selectedArticleUrl === article.url, 'is-unread': !article.seen_at }"
          type="button"
          @click="selectedArticleUrl = article.url"
        >
          <div class="article-row__meta">
            <span class="article-row__feed">
              <img class="favicon" :src="faviconUrl(article.url)" alt="" loading="lazy" />
              <span>{{ article.feed_name }}</span>
            </span>
            <span>{{ article.published_at ? new Date(article.published_at).toLocaleDateString() : 'No date' }}</span>
          </div>
          <h3>{{ article.title }}</h3>
          <p>{{ article.excerpt || article.summary || 'No preview available.' }}</p>
          <div class="article-row__chips">
            <span v-if="article.liked_at" class="status-chip" title="Liked" aria-label="Liked">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="m12 4 2.5 5.2 5.7.8-4.1 4 1 5.8L12 17l-5.1 2.8 1-5.8-4.1-4 5.7-.8z" fill="none" stroke="currentColor" stroke-width="1.8" />
              </svg>
            </span>
            <span v-if="article.bookmarked_at" class="status-chip" title="Read Later" aria-label="Read Later">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M7 4h10v16l-5-3-5 3z" fill="none" stroke="currentColor" stroke-width="1.8" />
              </svg>
            </span>
            <span v-if="article.read_at" class="status-chip" title="Read" aria-label="Read">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="1.8" />
                <path d="M12 8v5l3 2" fill="none" stroke="currentColor" stroke-width="1.8" />
              </svg>
            </span>
            <span v-if="!article.seen_at" class="status-chip" title="Unread" aria-label="Unread">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M4 5h16v12H4z" fill="none" stroke="currentColor" stroke-width="1.8" />
                <path d="M4 14h4l2 3h4l2-3h4" fill="none" stroke="currentColor" stroke-width="1.8" />
              </svg>
            </span>
          </div>
        </button>
      </div>
    </main>

    <ArticleDetailPane
      :article="selectedArticle"
      :loading="detailLoading"
      :summarizing="summarizing"
      :translating="translating"
      :archiving="archiving"
      @toggle-read="handleToggleRead"
      @toggle-liked="handleToggleLiked"
      @toggle-bookmarked="handleToggleBookmarked"
      @summarize="handleSummarize"
      @translate="handleTranslate"
      @archive-images="handleArchiveImages"
    />

    <SettingsPanel :open="settingsOpen" @close="settingsOpen = false" />

    <div v-if="composeOpen" class="compose-sheet__backdrop" @click.self="closeCompose">
      <section class="compose-sheet">
        <header class="compose-sheet__header">
          <h3>{{ composeTitle }}</h3>
          <button class="pane-icon-button" type="button" @click="closeCompose" aria-label="Close">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M7 7l10 10M17 7L7 17" fill="none" stroke="currentColor" stroke-width="1.8" />
            </svg>
          </button>
        </header>

        <form v-if="composeMode === 'feed'" class="compose-sheet__form" @submit.prevent="handleCreateFeed">
          <label class="compose-field">
            <span>URL</span>
            <input v-model="feedFormUrl" type="url" required placeholder="https://example.com" />
          </label>
          <label class="compose-field">
            <span>Name (optional)</span>
            <input v-model="feedFormName" type="text" placeholder="Feed name" />
          </label>
          <label class="compose-field">
            <span>Category</span>
            <select v-model="feedFormCategoryId">
              <option :value="''">Uncategorized</option>
              <option v-for="category in categoriesSorted" :key="category.id" :value="category.id">
                {{ category.name }}
              </option>
            </select>
          </label>
          <p v-if="composeError" class="compose-error">{{ composeError }}</p>
          <div class="compose-actions">
            <button class="sidebar-header__button" type="button" @click="closeCompose">Cancel</button>
            <button class="auth-submit" type="submit" :disabled="composeLoading">{{ composeLoading ? 'Adding…' : 'Add Feed' }}</button>
          </div>
        </form>

        <form v-else-if="composeMode === 'clip'" class="compose-sheet__form" @submit.prevent="handleClipArticle">
          <label class="compose-field">
            <span>Page URL</span>
            <input v-model="clipFormUrl" type="url" required placeholder="https://example.com/article" />
          </label>
          <div v-if="clipConflict" class="compose-info">
            <p>This page already exists in <strong>{{ clipConflict.feedName }}</strong>.</p>
            <p>You can move it into Clips.</p>
            <div class="compose-actions">
              <button class="sidebar-header__button" type="button" @click="clipConflict = null">Cancel</button>
              <button class="auth-submit" type="button" :disabled="composeLoading" @click="handleForceClip">
                {{ composeLoading ? 'Moving…' : 'Move to Clips' }}
              </button>
            </div>
          </div>
          <p v-if="composeError" class="compose-error">{{ composeError }}</p>
          <div v-if="!clipConflict" class="compose-actions">
            <button class="sidebar-header__button" type="button" @click="closeCompose">Cancel</button>
            <button class="auth-submit" type="submit" :disabled="composeLoading">{{ composeLoading ? 'Clipping…' : 'Clip Page' }}</button>
          </div>
        </form>

        <form v-else class="compose-sheet__form" @submit.prevent="handleCreateCategory">
          <label class="compose-field">
            <span>Category Name</span>
            <input v-model="categoryFormName" type="text" required placeholder="Technology" />
          </label>
          <p v-if="composeError" class="compose-error">{{ composeError }}</p>
          <div class="compose-actions">
            <button class="sidebar-header__button" type="button" @click="closeCompose">Cancel</button>
            <button class="auth-submit" type="submit" :disabled="composeLoading">{{ composeLoading ? 'Creating…' : 'Create Category' }}</button>
          </div>
        </form>
      </section>
    </div>
  </div>
</template>

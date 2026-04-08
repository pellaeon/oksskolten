<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import type { ArticleDetail, ArticleListItem, Category, FeedWithCounts } from '../../../shared/types'
import {
  getArticleByUrl,
  getArticles,
  getCategories,
  getFeeds,
  getStats,
  logout,
  recordRead,
  setBookmarked,
  setLiked,
  setSeen,
  type StatsResponse,
} from '@mrrss/lib/api'
import ArticleDetailPane from './ArticleDetailPane.vue'

type FilterMode = 'all' | 'unread' | 'liked' | 'bookmarked' | 'read' | 'clips'
type Selection =
  | { kind: 'filter'; value: FilterMode }
  | { kind: 'feed'; value: number }
  | { kind: 'category'; value: number }

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

const globalFilters = computed(() => [
  { key: 'all' as const, label: 'All Articles', count: stats.value?.total_articles ?? 0 },
  { key: 'unread' as const, label: 'Unread', count: stats.value?.unread_articles ?? 0 },
  { key: 'liked' as const, label: 'Liked', count: stats.value?.liked_articles ?? 0 },
  { key: 'bookmarked' as const, label: 'Read Later', count: stats.value?.bookmarked_articles ?? 0 },
  { key: 'read' as const, label: 'Read', count: stats.value?.read_articles ?? 0 },
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

const currentLabel = computed(() => {
  if (selection.value.kind === 'filter') {
    return globalFilters.value.find(filter => filter.key === selection.value.value)?.label ?? 'All Articles'
  }
  if (selection.value.kind === 'feed') {
    return feeds.value.find(feed => feed.id === selection.value.value)?.name ?? 'Feed'
  }
  return categories.value.find(category => category.id === selection.value.value)?.name ?? 'Category'
})

const currentCount = computed(() => totalArticles.value)

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

onMounted(async () => {
  await refreshSidebar()
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

async function refreshSidebar() {
  sidebarError.value = ''
  sidebarLoading.value = true

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
    sidebarLoading.value = false
  }
}

async function loadArticles() {
  articleError.value = ''
  articleLoading.value = true

  try {
    const data = await getArticles(currentQuery.value)
    articles.value = data.articles
    totalArticles.value = data.total

    if (!selectedArticleUrl.value || !data.articles.some(article => article.url === selectedArticleUrl.value)) {
      selectedArticleUrl.value = data.articles[0]?.url ?? null
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
    selectedArticle.value = article
    syncArticleIntoList(article)

    if ((article.seen_at == null || article.read_at == null) && readRecordedForId.value !== article.id) {
      readRecordedForId.value = article.id
      const result = await recordRead(article.id)
      selectedArticle.value = {
        ...article,
        seen_at: result.seen_at ?? article.seen_at ?? new Date().toISOString(),
        read_at: result.read_at ?? article.read_at ?? new Date().toISOString(),
      }
      syncArticleIntoList(selectedArticle.value)
      void refreshSidebar()
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

function selectFilter(filter: FilterMode) {
  selection.value = { kind: 'filter', value: filter }
}

function selectFeed(feedId: number) {
  selection.value = { kind: 'feed', value: feedId }
}

function selectCategory(categoryId: number) {
  selection.value = { kind: 'category', value: categoryId }
}

async function handleToggleRead() {
  if (!selectedArticle.value) return
  const article = selectedArticle.value
  const markUnread = Boolean(article.read_at || article.seen_at)

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
  await refreshSidebar()
  await loadArticles()
}

async function handleToggleLiked() {
  if (!selectedArticle.value) return
  const article = selectedArticle.value
  const result = await setLiked(article.id, !article.liked_at)
  selectedArticle.value = { ...article, liked_at: result.liked_at }
  syncArticleIntoList(selectedArticle.value)
  await refreshSidebar()
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

async function handleLogout() {
  try {
    await logout()
  } catch {
    // local logout still proceeds
  }
  emit('logout')
}
</script>

<template>
  <div class="reader-shell">
    <aside class="reader-sidebar">
      <div class="reader-sidebar__header">
        <div>
          <p class="reader-sidebar__eyebrow">Alternative Frontend</p>
          <h1>Oksskolten</h1>
        </div>
        <button class="sidebar-header__button" type="button" @click="settingsOpen = true">Settings</button>
      </div>

      <section class="sidebar-section">
        <h2>Filters</h2>
        <button
          v-for="filter in globalFilters"
          :key="filter.key"
          class="sidebar-filter"
          :class="{ 'is-active': selection.kind === 'filter' && selection.value === filter.key }"
          type="button"
          @click="selectFilter(filter.key)"
        >
          <span>{{ filter.label }}</span>
          <strong>{{ filter.count }}</strong>
        </button>
      </section>

      <section class="sidebar-section sidebar-section--tree">
        <div class="sidebar-section__heading">
          <h2>Feeds</h2>
          <span>{{ feeds.length }}</span>
        </div>

        <p v-if="sidebarLoading" class="sidebar-state">Loading feeds…</p>
        <p v-else-if="sidebarError" class="sidebar-state sidebar-state--error">{{ sidebarError }}</p>
        <template v-else>
          <div
            v-for="group in groupedFeeds.categories"
            :key="group.category.id"
            class="feed-group"
          >
            <button
              class="feed-group__category"
              :class="{ 'is-active': selection.kind === 'category' && selection.value === group.category.id }"
              type="button"
              @click="selectCategory(group.category.id)"
            >
              <span>{{ group.category.name }}</span>
              <strong>{{ group.feeds.reduce((total, feed) => total + feed.unread_count, 0) }}</strong>
            </button>
            <button
              v-for="feed in group.feeds"
              :key="feed.id"
              class="feed-row"
              :class="{ 'is-active': selection.kind === 'feed' && selection.value === feed.id }"
              type="button"
              @click="selectFeed(feed.id)"
            >
              <span>{{ feed.name }}</span>
              <strong>{{ feed.unread_count }}</strong>
            </button>
          </div>

          <div v-if="groupedFeeds.uncategorized.length > 0" class="feed-group">
            <p class="feed-group__label">Uncategorized</p>
            <button
              v-for="feed in groupedFeeds.uncategorized"
              :key="feed.id"
              class="feed-row"
              :class="{ 'is-active': selection.kind === 'feed' && selection.value === feed.id }"
              type="button"
              @click="selectFeed(feed.id)"
            >
              <span>{{ feed.name }}</span>
              <strong>{{ feed.unread_count }}</strong>
            </button>
          </div>
        </template>
      </section>

      <footer class="reader-sidebar__footer">
        <div>
          <p class="reader-sidebar__eyebrow">Signed in as</p>
          <strong>{{ email }}</strong>
        </div>
        <button class="sidebar-header__button" type="button" @click="handleLogout">Log out</button>
      </footer>
    </aside>

    <main class="reader-list-pane">
      <header class="pane-header">
        <div>
          <p class="pane-header__eyebrow">Current View</p>
          <h2>{{ currentLabel }}</h2>
        </div>
        <strong>{{ currentCount }}</strong>
      </header>

      <div v-if="articleError" class="pane-state pane-state--error">{{ articleError }}</div>
      <div v-else-if="articleLoading" class="pane-state">Loading articles…</div>
      <div v-else-if="articles.length === 0" class="pane-state">No articles in this view.</div>
      <button
        v-for="article in articles"
        :key="article.id"
        class="article-row"
        :class="{ 'is-active': selectedArticleUrl === article.url, 'is-unread': !article.seen_at }"
        type="button"
        @click="selectedArticleUrl = article.url"
      >
        <div class="article-row__meta">
          <span>{{ article.feed_name }}</span>
          <span>{{ article.published_at ? new Date(article.published_at).toLocaleDateString() : 'No date' }}</span>
        </div>
        <h3>{{ article.title }}</h3>
        <p>{{ article.excerpt || article.summary || 'No preview available.' }}</p>
        <div class="article-row__chips">
          <span v-if="article.liked_at">Liked</span>
          <span v-if="article.bookmarked_at">Read Later</span>
          <span v-if="article.read_at">Read</span>
          <span v-if="!article.seen_at">Unread</span>
        </div>
      </button>
    </main>

    <ArticleDetailPane
      :article="selectedArticle"
      :loading="detailLoading"
      @toggle-read="handleToggleRead"
      @toggle-liked="handleToggleLiked"
      @toggle-bookmarked="handleToggleBookmarked"
    />

    <div v-if="settingsOpen" class="settings-sheet__backdrop" @click.self="settingsOpen = false">
      <section class="settings-sheet">
        <header class="settings-sheet__header">
          <div>
            <p class="pane-header__eyebrow">Settings</p>
            <h2>Port in progress</h2>
          </div>
          <button class="sidebar-header__button" type="button" @click="settingsOpen = false">Close</button>
        </header>
        <p>
          This branch now has the MrRSS-style reader shell on top of the Oksskolten API.
          The next commits will port the full Oksskolten settings surface into this panel.
        </p>
      </section>
    </div>
  </div>
</template>

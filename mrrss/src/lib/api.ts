import type { ArticleDetail, ArticleListItem, Category, FeedWithCounts } from '../../../shared/types'
import { getAuthToken } from './auth'

export interface AuthMethods {
  setup_required: boolean
  password: { enabled: boolean }
  passkey?: { enabled: boolean; count: number }
  github?: { enabled: boolean }
}

export interface SessionUser {
  email: string
}

export interface ProfileResponse {
  account_name: string
  avatar_seed: string | null
  language: 'ja' | 'en' | null
  email?: string
}

export interface PreferencesResponse {
  [key: string]: string | null
}

export interface FeedResponse {
  feeds: FeedWithCounts[]
  bookmark_count: number
  like_count: number
  clip_feed_id: number | null
}

export interface StatsResponse {
  total_articles: number
  unread_articles: number
  read_articles: number
  bookmarked_articles: number
  liked_articles: number
}

export interface ArticlesResponse {
  articles: ArticleListItem[]
  total: number
  has_more: boolean
  total_all?: number
  total_without_floor?: number
}

export interface ArticleSearchQuery {
  q: string
  bookmarked?: boolean
  liked?: boolean
  unread?: boolean
  since?: string
  until?: string
  limit?: number
  offset?: number
}

export interface ArticleSearchResponse {
  articles: ArticleListItem[]
  has_more: boolean
  indexBuilding?: boolean
}

export interface ArticleQuery {
  feed_id?: number
  category_id?: number
  unread?: boolean
  bookmarked?: boolean
  liked?: boolean
  read?: boolean
  limit?: number
  offset?: number
  no_floor?: boolean
}

export interface ImageStorageResponse {
  'images.enabled': string | null
  mode: string
  url: string
  headersConfigured: boolean
  fieldName: string
  respPath: string
  healthcheckUrl: string
  'images.storage_path': string | null
  'images.max_size_mb': string | null
}

export interface FreshRssSettings {
  enabled: boolean
  endpointUrl: string | null
  configured: boolean
  apiKeyConfigured: boolean
  lastSyncAt: string | null
  lastSyncError: string | null
}

export interface ProviderKeyStatus {
  configured: boolean
}

export interface RetentionStats {
  readDays: number
  unreadDays: number
  readEligible: number
  unreadEligible: number
}

export interface OpmlPreviewFeed {
  name: string
  url: string
  rssUrl: string
  categoryName: string | null
  isDuplicate: boolean
}

export interface OpmlPreviewResponse {
  feeds: OpmlPreviewFeed[]
  totalCount: number
  duplicateCount: number
}

export interface CreateFeedBody {
  url: string
  name?: string
  category_id?: number | null
}

export class ApiRequestError extends Error {
  status: number
  data: unknown

  constructor(status: number, data: unknown, fallbackMessage: string) {
    const message = typeof data === 'object' && data && 'error' in data && typeof (data as { error?: unknown }).error === 'string'
      ? (data as { error: string }).error
      : fallbackMessage
    super(message)
    this.name = 'ApiRequestError'
    this.status = status
    this.data = data
  }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const token = getAuthToken()
  const headers = new Headers(init?.headers)

  if (token) {
    headers.set('Authorization', `Bearer ${token}`)
  }

  if (init?.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }

  const response = await fetch(url, {
    ...init,
    headers,
  })

  if (!response.ok) {
    let message = `${response.status} ${response.statusText}`

    try {
      const data = await response.json() as { error?: string }
      if (data.error) message = data.error
    } catch {
      // keep HTTP status text
    }

    throw new Error(message)
  }

  if (response.status === 204) {
    return undefined as T
  }

  return response.json() as Promise<T>
}

export function getAuthMethods() {
  return request<AuthMethods>('/api/auth/methods')
}

export function getSession() {
  return request<SessionUser>('/api/me')
}

export function login(email: string, password: string) {
  return request<{ ok: true; token: string }>('/api/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  })
}

export function setup(email: string, password: string) {
  return request<{ ok: true; token: string }>('/api/auth/setup', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  })
}

export function getProfile() {
  return request<ProfileResponse>('/api/settings/profile')
}

export function updateProfile(body: Partial<ProfileResponse>) {
  return request<ProfileResponse>('/api/settings/profile', {
    method: 'PATCH',
    body: JSON.stringify(body),
  })
}

export function getPreferences() {
  return request<PreferencesResponse>('/api/settings/preferences')
}

export function updatePreferences(body: Record<string, string>) {
  return request<PreferencesResponse>('/api/settings/preferences', {
    method: 'PATCH',
    body: JSON.stringify(body),
  })
}

export function logout() {
  return request<{ ok: true }>('/api/logout', { method: 'POST' })
}

export function getFeeds() {
  return request<FeedResponse>('/api/feeds')
}

export function getCategories() {
  return request<{ categories: Category[] }>('/api/categories')
}

export function createCategory(name: string) {
  return request<Category>('/api/categories', {
    method: 'POST',
    body: JSON.stringify({ name }),
  })
}

export function getStats() {
  return request<StatsResponse>('/api/stats')
}

export function getArticles(query: ArticleQuery) {
  const params = new URLSearchParams()

  if (query.feed_id != null) params.set('feed_id', String(query.feed_id))
  if (query.category_id != null) params.set('category_id', String(query.category_id))
  if (query.unread) params.set('unread', '1')
  if (query.bookmarked) params.set('bookmarked', '1')
  if (query.liked) params.set('liked', '1')
  if (query.read) params.set('read', '1')
  if (query.limit != null) params.set('limit', String(query.limit))
  if (query.offset != null) params.set('offset', String(query.offset))
  if (query.no_floor) params.set('no_floor', '1')

  return request<ArticlesResponse>(`/api/articles?${params.toString()}`)
}

export function getArticleByUrl(url: string) {
  return request<ArticleDetail>(`/api/articles/by-url?url=${encodeURIComponent(url)}`)
}

export async function searchArticles(query: ArticleSearchQuery, signal?: AbortSignal) {
  const token = getAuthToken()
  const params = new URLSearchParams()

  params.set('q', query.q)
  if (query.bookmarked) params.set('bookmarked', '1')
  if (query.liked) params.set('liked', '1')
  if (query.unread) params.set('unread', '1')
  if (query.since) params.set('since', query.since)
  if (query.until) params.set('until', query.until)
  if (query.limit != null) params.set('limit', String(query.limit))
  if (query.offset != null) params.set('offset', String(query.offset))

  const response = await fetch(`/api/articles/search?${params.toString()}`, {
    signal,
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  })

  if (response.status === 503) {
    return { articles: [], has_more: false, indexBuilding: true } as ArticleSearchResponse
  }

  if (!response.ok) {
    return { articles: [], has_more: false } as ArticleSearchResponse
  }

  const data = await response.json() as { articles?: ArticleListItem[]; has_more?: boolean }
  return {
    articles: data.articles ?? [],
    has_more: data.has_more ?? false,
  } as ArticleSearchResponse
}

export async function clipArticleFromUrl(url: string, force = false) {
  const token = getAuthToken()
  const response = await fetch('/api/articles/from-url', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ url, force }),
  })

  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new ApiRequestError(response.status, data, `${response.status} ${response.statusText}`)
  }

  return data as { article: ArticleDetail; created?: boolean; moved?: boolean }
}

export async function createFeed(body: CreateFeedBody) {
  const token = getAuthToken()
  const response = await fetch('/api/feeds', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  })

  const contentType = response.headers.get('content-type') || ''
  if (!contentType.includes('text/event-stream')) {
    const data = await response.json().catch(() => ({}))
    if (!response.ok) {
      throw new ApiRequestError(response.status, data, `${response.status} ${response.statusText}`)
    }
    throw new Error('Unexpected response when creating feed')
  }

  if (!response.body) throw new Error('Response body is empty')
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let createdFeed: FeedWithCounts | null = null

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue
      let payload: Record<string, unknown> | null = null
      try {
        payload = JSON.parse(line.slice(6)) as Record<string, unknown>
      } catch {
        continue
      }

      if (!payload) continue

      if (payload.type === 'error') {
        throw new Error(typeof payload.error === 'string' ? payload.error : 'Failed to create feed')
      }

      if (payload.type === 'done' && payload.feed && typeof payload.feed === 'object') {
        createdFeed = payload.feed as FeedWithCounts
      }
    }
  }

  if (!createdFeed) {
    throw new Error('Feed creation did not complete')
  }

  return createdFeed
}

export function recordRead(articleId: number) {
  return request<{ seen_at: string | null; read_at: string | null }>(`/api/articles/${articleId}/read`, {
    method: 'POST',
  })
}

export function setSeen(articleId: number, seen: boolean) {
  return request<{ seen_at: string | null; read_at: string | null }>(`/api/articles/${articleId}/seen`, {
    method: 'PATCH',
    body: JSON.stringify({ seen }),
  })
}

export function setBookmarked(articleId: number, bookmarked: boolean) {
  return request<{ bookmarked_at: string | null }>(`/api/articles/${articleId}/bookmark`, {
    method: 'PATCH',
    body: JSON.stringify({ bookmarked }),
  })
}

export function setLiked(articleId: number, liked: boolean) {
  return request<{ liked_at: string | null }>(`/api/articles/${articleId}/like`, {
    method: 'PATCH',
    body: JSON.stringify({ liked }),
  })
}

export function markFeedAllSeen(feedId: number) {
  return request<{ updated: number }>(`/api/feeds/${feedId}/mark-all-seen`, {
    method: 'POST',
  })
}

export function markCategoryAllSeen(categoryId: number) {
  return request<{ updated: number }>(`/api/categories/${categoryId}/mark-all-seen`, {
    method: 'POST',
  })
}

export function summarizeArticle(articleId: number) {
  return request<{ text: string }>(`/api/articles/${articleId}/summarize`, {
    method: 'POST',
    body: JSON.stringify({}),
  })
}

export function translateArticle(articleId: number) {
  return request<{ text: string }>(`/api/articles/${articleId}/translate`, {
    method: 'POST',
    body: JSON.stringify({}),
  })
}

export function archiveArticleImages(articleId: number) {
  return request<{ status: 'accepted' }>(`/api/articles/${articleId}/archive-images`, {
    method: 'POST',
  })
}

export function getImageStorage() {
  return request<ImageStorageResponse>('/api/settings/image-storage')
}

export function updateImageStorage(body: Record<string, string>) {
  return request<ImageStorageResponse>('/api/settings/image-storage', {
    method: 'PATCH',
    body: JSON.stringify(body),
  })
}

export function testImageStorage() {
  return request<{ success: true; url: string }>('/api/settings/image-storage/test', {
    method: 'POST',
  })
}

export function healthcheckImageStorage() {
  return request<{ success: true; status: number }>('/api/settings/image-storage/healthcheck', {
    method: 'POST',
  })
}

export function getFreshRssSettings() {
  return request<FreshRssSettings>('/api/settings/freshrss')
}

export function updateFreshRssSettings(body: { enabled?: boolean; endpointUrl?: string }) {
  return request<FreshRssSettings>('/api/settings/freshrss', {
    method: 'PATCH',
    body: JSON.stringify(body),
  })
}

export function saveFreshRssApiKey(apiKey: string) {
  return request<FreshRssSettings>('/api/settings/freshrss/api-key', {
    method: 'POST',
    body: JSON.stringify({ apiKey }),
  })
}

export function verifyFreshRss() {
  return request<{ ok: true }>('/api/settings/freshrss/verify', {
    method: 'POST',
  })
}

export function syncFreshRss() {
  return request<Record<string, unknown>>('/api/settings/freshrss/sync', {
    method: 'POST',
  })
}

export function getProviderKeyStatus(provider: string) {
  return request<ProviderKeyStatus>(`/api/settings/api-keys/${provider}`)
}

export function saveProviderApiKey(provider: string, apiKey: string) {
  return request<{ ok: true; configured: boolean }>(`/api/settings/api-keys/${provider}`, {
    method: 'POST',
    body: JSON.stringify({ apiKey }),
  })
}

export function getOllamaModels() {
  return request<{ models: Array<{ name: string; size: number; parameter_size: string }> }>('/api/settings/ollama/models')
}

export function getOllamaStatus() {
  return request<{ ok: boolean; version?: string; model_count?: number; error?: string }>('/api/settings/ollama/status')
}

export function getOpenAIStatus() {
  return request<{ ok: boolean; model_count?: number; first_model?: string | null; error?: string }>('/api/settings/openai/status')
}

export function changePassword(body: { currentPassword?: string; newPassword: string }) {
  return request<{ ok: true; token: string }>('/api/auth/password/change', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export function changeEmail(body: { newEmail: string; currentPassword: string }) {
  return request<{ ok: true; token: string }>('/api/auth/email/change', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export function togglePasswordAuth(enabled: boolean) {
  return request<{ ok: true }>('/api/auth/password/toggle', {
    method: 'POST',
    body: JSON.stringify({ enabled }),
  })
}

export function getRetentionStats() {
  return request<RetentionStats>('/api/settings/retention/stats')
}

export function purgeRetention() {
  return request<{ purged: number }>('/api/settings/retention/purge', {
    method: 'POST',
  })
}

export async function previewOpml(file: File) {
  const token = getAuthToken()
  const headers = token ? { Authorization: `Bearer ${token}` } : undefined
  const form = new FormData()
  form.append('file', file)
  const response = await fetch('/api/opml/preview', { method: 'POST', headers, body: form })
  if (!response.ok) throw new Error(`Preview failed: ${response.status}`)
  return response.json() as Promise<OpmlPreviewResponse>
}

export async function importOpml(file: File, selectedUrls?: string[]) {
  const token = getAuthToken()
  const headers = token ? { Authorization: `Bearer ${token}` } : undefined
  const form = new FormData()
  form.append('file', file)
  if (selectedUrls) {
    form.append('selectedUrls', JSON.stringify(selectedUrls))
  }
  const response = await fetch('/api/opml', { method: 'POST', headers, body: form })
  if (!response.ok) throw new Error(`Import failed: ${response.status}`)
  return response.json() as Promise<{ imported: number; skipped: number; errors: string[] }>
}

export async function fetchOpmlBlob() {
  const token = getAuthToken()
  const headers = token ? { Authorization: `Bearer ${token}` } : undefined
  const response = await fetch('/api/opml', { headers })
  if (!response.ok) throw new Error(`Export failed: ${response.status}`)
  return response.blob()
}

export function getHealth() {
  return request<{ gitCommit?: string; gitTag?: string; buildDate?: string; ok: boolean; searchReady: boolean }>('/api/health')
}

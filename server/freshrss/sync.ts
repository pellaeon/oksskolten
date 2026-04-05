import {
  createCategory,
  createFeed,
  getCategories,
  getFeedByUrl,
  getSetting,
  updateCategory,
  updateFeed,
  upsertSetting,
} from '../db.js'
import {
  getFeedByRssUrl,
  getFreshRssFeedMappingByLocalFeedId,
  getFreshRssFeedMappingByRemoteId,
  getFreshRssGroupMappingByLocalCategoryId,
  getFreshRssGroupMappingByRemoteId,
  getFreshRssItemMappingByLocalArticleId,
  getFreshRssLocalArticleState,
  upsertFreshRssFeedMapping,
  upsertFreshRssGroupMapping,
  upsertFreshRssItemMapping,
} from '../db/freshrss.js'
import { logger } from '../logger.js'
import { FreshRssClient } from './client.js'

const log = logger.child('freshrss')

const SETTING_KEYS = {
  enabled: 'integration.freshrss_enabled',
  endpointUrl: 'integration.freshrss_endpoint_url',
  apiKey: 'integration.freshrss_api_key',
  lastSyncAt: 'integration.freshrss_last_sync_at',
  lastSyncError: 'integration.freshrss_last_sync_error',
} as const

export interface FreshRssSettingsState {
  enabled: boolean
  endpointUrl: string | null
  configured: boolean
  apiKeyConfigured: boolean
  lastSyncAt: string | null
  lastSyncError: string | null
}

export interface FreshRssSyncResult {
  createdCategories: number
  updatedCategories: number
  createdFeeds: number
  updatedFeeds: number
  skippedFeeds: number
}

function getRawSettings() {
  return {
    enabled: getSetting(SETTING_KEYS.enabled) === 'on',
    endpointUrl: getSetting(SETTING_KEYS.endpointUrl) ?? null,
    apiKey: getSetting(SETTING_KEYS.apiKey) ?? null,
    lastSyncAt: getSetting(SETTING_KEYS.lastSyncAt) ?? null,
    lastSyncError: getSetting(SETTING_KEYS.lastSyncError) ?? null,
  }
}

export function getFreshRssSettingsState(): FreshRssSettingsState {
  const settings = getRawSettings()
  return {
    enabled: settings.enabled,
    endpointUrl: settings.endpointUrl,
    configured: !!settings.endpointUrl && !!settings.apiKey,
    apiKeyConfigured: !!settings.apiKey,
    lastSyncAt: settings.lastSyncAt,
    lastSyncError: settings.lastSyncError,
  }
}

function requireFreshRssClient(): FreshRssClient {
  const settings = getRawSettings()
  if (!settings.endpointUrl || !settings.apiKey) throw new Error('FreshRSS sync is not configured')
  return new FreshRssClient({ endpointUrl: settings.endpointUrl, apiKey: settings.apiKey })
}

function findCategoryIdByName(name: string): number | undefined {
  const normalized = name.trim().toLowerCase()
  return getCategories().find(category => category.name.trim().toLowerCase() === normalized)?.id
}

function setSyncSuccess(): void {
  upsertSetting(SETTING_KEYS.lastSyncAt, new Date().toISOString())
  upsertSetting(SETTING_KEYS.lastSyncError, '')
}

function setSyncError(message: string): void {
  upsertSetting(SETTING_KEYS.lastSyncError, message)
}

export async function verifyFreshRssConnection(): Promise<void> {
  const client = requireFreshRssClient()
  await client.verify()
}

export async function syncFreshRssFeeds(): Promise<FreshRssSyncResult> {
  const client = requireFreshRssClient()
  const { feeds, groups, feedsGroups } = await client.getFeedsAndGroups()

  const feedToGroupId = new Map<number, number>()
  for (const mapping of feedsGroups) {
    const feedIds = mapping.feed_ids.split(',').map(value => Number(value)).filter(Number.isFinite)
    for (const feedId of feedIds) {
      feedToGroupId.set(feedId, mapping.group_id)
    }
  }

  const result: FreshRssSyncResult = {
    createdCategories: 0,
    updatedCategories: 0,
    createdFeeds: 0,
    updatedFeeds: 0,
    skippedFeeds: 0,
  }

  const groupToCategoryId = new Map<number, number>()

  for (const group of groups) {
    const existingMapping = getFreshRssGroupMappingByRemoteId(group.id)
    if (existingMapping) {
      const category = getCategories().find(item => item.id === existingMapping.local_category_id)
      if (category && category.name !== group.title) {
        updateCategory(category.id, { name: group.title })
        result.updatedCategories++
      }
      if (category) {
        groupToCategoryId.set(group.id, category.id)
        continue
      }
    }

    const matchedCategoryId = findCategoryIdByName(group.title)
    const localCategoryId = matchedCategoryId ?? createCategory(group.title).id
    if (matchedCategoryId == null) {
      result.createdCategories++
    }
    upsertFreshRssGroupMapping(group.id, localCategoryId)
    groupToCategoryId.set(group.id, localCategoryId)
  }

  for (const feed of feeds) {
    const freshrssGroupId = feedToGroupId.get(feed.id) ?? null
    const categoryId = freshrssGroupId != null ? groupToCategoryId.get(freshrssGroupId) ?? null : null
    const siteUrl = feed.site_url || feed.url

    const mapping = getFreshRssFeedMappingByRemoteId(feed.id)
    if (mapping) {
      updateFeed(mapping.local_feed_id, {
        name: feed.title,
        url: siteUrl,
        rss_url: feed.url,
        category_id: categoryId,
        rss_bridge_url: null,
      })
      upsertFreshRssFeedMapping(feed.id, mapping.local_feed_id, freshrssGroupId)
      result.updatedFeeds++
      continue
    }

    const existingByRssUrl = getFeedByRssUrl(feed.url)
    const existingBySiteUrl = getFeedByUrl(siteUrl)
    const existingByFeedUrl = getFeedByUrl(feed.url)
    const existingFeedId = existingByRssUrl?.id ?? existingBySiteUrl?.id ?? existingByFeedUrl?.id

    if (existingFeedId != null) {
      updateFeed(existingFeedId, {
        name: feed.title,
        url: siteUrl,
        rss_url: feed.url,
        category_id: categoryId,
        rss_bridge_url: null,
      })
      upsertFreshRssFeedMapping(feed.id, existingFeedId, freshrssGroupId)
      result.updatedFeeds++
      continue
    }

    const localFeed = createFeed({
      name: feed.title,
      url: siteUrl,
      rss_url: feed.url,
      category_id: categoryId,
      type: 'rss',
    })
    upsertFreshRssFeedMapping(feed.id, localFeed.id, freshrssGroupId)
    result.createdFeeds++
  }

  setSyncSuccess()
  return result
}

export async function syncFreshRssFeedsIfEnabled(): Promise<FreshRssSyncResult | null> {
  const state = getFreshRssSettingsState()
  if (!state.enabled || !state.configured) return null
  try {
    return await syncFreshRssFeeds()
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    setSyncError(message)
    throw error
  }
}

async function resolveFreshRssItemId(localArticleId: number): Promise<number | null> {
  const existingMapping = getFreshRssItemMappingByLocalArticleId(localArticleId)
  if (existingMapping) return existingMapping.freshrss_item_id

  const article = getFreshRssLocalArticleState(localArticleId)
  if (!article) return null

  const feedMapping = getFreshRssFeedMappingByLocalFeedId(article.feed_id)
  if (!feedMapping) return null

  const client = requireFreshRssClient()
  const freshrssItemId = await client.findItemIdByFeedAndUrl(feedMapping.freshrss_feed_id, article.url)
  if (!freshrssItemId) return null

  upsertFreshRssItemMapping(freshrssItemId, localArticleId, feedMapping.freshrss_feed_id)
  return freshrssItemId
}

export async function syncFreshRssReadStateByLocalArticleId(localArticleId: number, read: boolean): Promise<void> {
  const state = getFreshRssSettingsState()
  if (!state.enabled || !state.configured) return

  const itemId = await resolveFreshRssItemId(localArticleId)
  if (!itemId) return

  const client = requireFreshRssClient()
  await client.markItemRead(itemId, read)
}

export async function syncFreshRssSavedStateByLocalArticleId(localArticleId: number): Promise<void> {
  const state = getFreshRssSettingsState()
  if (!state.enabled || !state.configured) return

  const article = getFreshRssLocalArticleState(localArticleId)
  if (!article) return

  const itemId = await resolveFreshRssItemId(localArticleId)
  if (!itemId) return

  const shouldBeSaved = article.bookmarked_at != null || article.liked_at != null
  const client = requireFreshRssClient()
  await client.markItemSaved(itemId, shouldBeSaved)
}

export async function syncFreshRssFeedReadStateByLocalFeedId(localFeedId: number): Promise<void> {
  const state = getFreshRssSettingsState()
  if (!state.enabled || !state.configured) return

  const mapping = getFreshRssFeedMappingByLocalFeedId(localFeedId)
  if (!mapping) return

  const client = requireFreshRssClient()
  await client.markFeedRead(mapping.freshrss_feed_id)
}

export async function syncFreshRssGroupReadStateByLocalCategoryId(localCategoryId: number): Promise<void> {
  const state = getFreshRssSettingsState()
  if (!state.enabled || !state.configured) return

  const mapping = getFreshRssGroupMappingByLocalCategoryId(localCategoryId)
  if (!mapping) return

  const client = requireFreshRssClient()
  await client.markGroupRead(mapping.freshrss_group_id)
}

export function setFreshRssEnabled(enabled: boolean): void {
  upsertSetting(SETTING_KEYS.enabled, enabled ? 'on' : 'off')
}

export function setFreshRssEndpointUrl(endpointUrl: string): void {
  upsertSetting(SETTING_KEYS.endpointUrl, endpointUrl)
}

export function setFreshRssApiKey(apiKey: string): void {
  upsertSetting(SETTING_KEYS.apiKey, apiKey)
}

export function clearFreshRssApiKey(): void {
  upsertSetting(SETTING_KEYS.apiKey, '')
}

export function logFreshRssSyncError(scope: string, error: unknown): void {
  log.error({ err: error }, `FreshRSS ${scope} failed`)
}

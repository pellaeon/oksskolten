import { getDb, getNamed } from './connection.js'

export interface FreshRssGroupMapping {
  freshrss_group_id: number
  local_category_id: number
}

export interface FreshRssFeedMapping {
  freshrss_feed_id: number
  local_feed_id: number
  freshrss_group_id: number | null
}

export interface FreshRssItemMapping {
  freshrss_item_id: number
  local_article_id: number
  freshrss_feed_id: number
}

export interface FreshRssLocalArticleState {
  id: number
  feed_id: number
  url: string
  title: string
  seen_at: string | null
  read_at: string | null
  bookmarked_at: string | null
  liked_at: string | null
}

export function getFreshRssGroupMappingByRemoteId(freshrssGroupId: number): FreshRssGroupMapping | undefined {
  return getNamed<FreshRssGroupMapping | undefined>(
    'SELECT freshrss_group_id, local_category_id FROM freshrss_group_mappings WHERE freshrss_group_id = @freshrss_group_id',
    { freshrss_group_id: freshrssGroupId },
  )
}

export function getFreshRssGroupMappingByLocalCategoryId(localCategoryId: number): FreshRssGroupMapping | undefined {
  return getNamed<FreshRssGroupMapping | undefined>(
    'SELECT freshrss_group_id, local_category_id FROM freshrss_group_mappings WHERE local_category_id = @local_category_id',
    { local_category_id: localCategoryId },
  )
}

export function upsertFreshRssGroupMapping(freshrssGroupId: number, localCategoryId: number): void {
  getDb().transaction(() => {
    getDb().prepare(
      'DELETE FROM freshrss_group_mappings WHERE freshrss_group_id = ? OR local_category_id = ?',
    ).run(freshrssGroupId, localCategoryId)
    getDb().prepare(`
      INSERT INTO freshrss_group_mappings (freshrss_group_id, local_category_id, updated_at)
      VALUES (?, ?, datetime('now'))
    `).run(freshrssGroupId, localCategoryId)
  })()
}

export function getFreshRssFeedMappingByRemoteId(freshrssFeedId: number): FreshRssFeedMapping | undefined {
  return getNamed<FreshRssFeedMapping | undefined>(
    'SELECT freshrss_feed_id, local_feed_id, freshrss_group_id FROM freshrss_feed_mappings WHERE freshrss_feed_id = @freshrss_feed_id',
    { freshrss_feed_id: freshrssFeedId },
  )
}

export function getFreshRssFeedMappingByLocalFeedId(localFeedId: number): FreshRssFeedMapping | undefined {
  return getNamed<FreshRssFeedMapping | undefined>(
    'SELECT freshrss_feed_id, local_feed_id, freshrss_group_id FROM freshrss_feed_mappings WHERE local_feed_id = @local_feed_id',
    { local_feed_id: localFeedId },
  )
}

export function upsertFreshRssFeedMapping(freshrssFeedId: number, localFeedId: number, freshrssGroupId: number | null): void {
  getDb().transaction(() => {
    getDb().prepare(
      'DELETE FROM freshrss_feed_mappings WHERE freshrss_feed_id = ? OR local_feed_id = ?',
    ).run(freshrssFeedId, localFeedId)
    getDb().prepare(`
      INSERT INTO freshrss_feed_mappings (freshrss_feed_id, local_feed_id, freshrss_group_id, updated_at)
      VALUES (?, ?, ?, datetime('now'))
    `).run(freshrssFeedId, localFeedId, freshrssGroupId)
  })()
}

export function getFreshRssItemMappingByLocalArticleId(localArticleId: number): FreshRssItemMapping | undefined {
  return getNamed<FreshRssItemMapping | undefined>(
    'SELECT freshrss_item_id, local_article_id, freshrss_feed_id FROM freshrss_item_mappings WHERE local_article_id = @local_article_id',
    { local_article_id: localArticleId },
  )
}

export function upsertFreshRssItemMapping(freshrssItemId: number, localArticleId: number, freshrssFeedId: number): void {
  getDb().transaction(() => {
    getDb().prepare(
      'DELETE FROM freshrss_item_mappings WHERE freshrss_item_id = ? OR local_article_id = ?',
    ).run(freshrssItemId, localArticleId)
    getDb().prepare(`
      INSERT INTO freshrss_item_mappings (freshrss_item_id, local_article_id, freshrss_feed_id, updated_at)
      VALUES (?, ?, ?, datetime('now'))
    `).run(freshrssItemId, localArticleId, freshrssFeedId)
  })()
}

export function getFreshRssLocalArticleState(localArticleId: number): FreshRssLocalArticleState | undefined {
  return getNamed<FreshRssLocalArticleState | undefined>(`
    SELECT id, feed_id, url, title, seen_at, read_at, bookmarked_at, liked_at
    FROM articles
    WHERE id = @id
  `, { id: localArticleId })
}

export function findLocalArticleIdByFeedAndUrl(localFeedId: number, url: string): number | undefined {
  const row = getNamed<{ id: number } | undefined>(
    'SELECT id FROM articles WHERE feed_id = @feed_id AND url = @url',
    { feed_id: localFeedId, url },
  )
  return row?.id
}

export function getFeedByRssUrl(rssUrl: string): { id: number } | undefined {
  return getNamed<{ id: number } | undefined>(
    'SELECT id FROM feeds WHERE rss_url = @rss_url',
    { rss_url: rssUrl },
  )
}

export function listFreshRssMappedFeedIds(): number[] {
  return (getDb().prepare('SELECT local_feed_id FROM freshrss_feed_mappings').all() as { local_feed_id: number }[])
    .map(row => row.local_feed_id)
}

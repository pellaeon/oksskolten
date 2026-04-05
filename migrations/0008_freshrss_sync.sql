CREATE TABLE IF NOT EXISTS freshrss_group_mappings (
  freshrss_group_id INTEGER PRIMARY KEY,
  local_category_id INTEGER NOT NULL UNIQUE REFERENCES categories(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS freshrss_feed_mappings (
  freshrss_feed_id INTEGER PRIMARY KEY,
  local_feed_id INTEGER NOT NULL UNIQUE REFERENCES feeds(id) ON DELETE CASCADE,
  freshrss_group_id INTEGER REFERENCES freshrss_group_mappings(freshrss_group_id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_freshrss_feed_mappings_group_id
  ON freshrss_feed_mappings(freshrss_group_id);

CREATE TABLE IF NOT EXISTS freshrss_item_mappings (
  freshrss_item_id INTEGER PRIMARY KEY,
  local_article_id INTEGER NOT NULL UNIQUE REFERENCES articles(id) ON DELETE CASCADE,
  freshrss_feed_id INTEGER NOT NULL REFERENCES freshrss_feed_mappings(freshrss_feed_id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_freshrss_item_mappings_feed_id
  ON freshrss_item_mappings(freshrss_feed_id);

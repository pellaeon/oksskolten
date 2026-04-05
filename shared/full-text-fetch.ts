export const FULL_TEXT_BLACKLIST_SETTING_KEY = 'reading.full_text_blacklist'

export const DEFAULT_FULL_TEXT_HOSTNAME_BLACKLIST = [
  'facebook.com',
  'instagram.com',
  'linkedin.com',
  'tiktok.com',
  'twitter.com',
  'x.com',
] as const

export function formatFullTextHostnameBlacklist(entries: readonly string[]): string {
  return entries.join('\n')
}

export const DEFAULT_FULL_TEXT_HOSTNAME_BLACKLIST_TEXT =
  formatFullTextHostnameBlacklist(DEFAULT_FULL_TEXT_HOSTNAME_BLACKLIST)

function normalizeHostnameEntry(raw: string): string | null {
  const trimmed = raw.trim().toLowerCase()
  if (!trimmed) return null

  const withoutWildcard = trimmed.replace(/^\*\./, '')

  try {
    return new URL(withoutWildcard).hostname.replace(/\.$/, '') || null
  } catch {
    try {
      return new URL(`https://${withoutWildcard}`).hostname.replace(/\.$/, '') || null
    } catch {
      return withoutWildcard
        .replace(/^https?:\/\//, '')
        .replace(/\/.*$/, '')
        .replace(/\.$/, '') || null
    }
  }
}

export function parseFullTextHostnameBlacklist(raw: string | null | undefined): string[] {
  if (raw == null) {
    return [...DEFAULT_FULL_TEXT_HOSTNAME_BLACKLIST]
  }

  const entries = raw
    .split(/[\s,]+/)
    .map(normalizeHostnameEntry)
    .filter((entry): entry is string => !!entry)

  return [...new Set(entries)]
}

export function isHostnameBlacklisted(hostname: string, blacklist: readonly string[]): boolean {
  const normalizedHostname = normalizeHostnameEntry(hostname)
  if (!normalizedHostname) return false
  return blacklist.some(entry => normalizedHostname === entry || normalizedHostname.endsWith(`.${entry}`))
}

export function isUrlHostnameBlacklisted(url: string, blacklist: readonly string[]): boolean {
  try {
    return isHostnameBlacklisted(new URL(url).hostname, blacklist)
  } catch {
    return false
  }
}

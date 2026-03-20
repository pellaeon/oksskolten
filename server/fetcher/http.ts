import { safeFetch } from './ssrf.js'
import { fetchViaFlareSolverr } from './flaresolverr.js'

export const USER_AGENT = 'Mozilla/5.0 (compatible; RSSReader/1.0)'
export const DEFAULT_TIMEOUT = 15_000
export const DISCOVERY_TIMEOUT = 10_000
export const PROBE_TIMEOUT = 5_000

export interface FetchHtmlResult {
  html: string
  contentType: string
  usedFlareSolverr: boolean
}

/**
 * Content-Type ヘッダーから charset を抽出する。
 * 例: "text/html; charset=Shift_JIS" → "shift_jis"
 */
function charsetFromContentType(ct: string): string | null {
  const m = ct.match(/charset\s*=\s*"?([^"\s;]+)/i)
  return m ? m[1].toLowerCase() : null
}

/**
 * バイト列の先頭部分からエンコーディング宣言を検出する。
 * HTML: <meta charset="..."> / <meta http-equiv="Content-Type" content="...; charset=...">
 * XML:  <?xml version="1.0" encoding="..."?>
 * BOM やバイナリヘッダーに影響されないよう、ASCII 互換部分のみを走査する。
 */
function charsetFromBytes(buf: Uint8Array): string | null {
  // 先頭 2048 バイトを ASCII として読み取る（マルチバイト文字は化けるが、
  // charset 宣言自体は ASCII 範囲なので問題ない）
  const head = new TextDecoder('ascii', { fatal: false }).decode(buf.slice(0, 2048))
  // XML: <?xml version="1.0" encoding="Shift_JIS"?>
  const mx = head.match(/<\?xml\s[^?]*encoding\s*=\s*["']([^"']+)/i)
  if (mx) return mx[1].toLowerCase()
  // HTML: <meta charset="Shift_JIS">
  const m1 = head.match(/<meta\s[^>]*charset\s*=\s*"?([^"\s;>]+)/i)
  if (m1) return m1[1].toLowerCase()
  // HTML: <meta http-equiv="Content-Type" content="text/html; charset=EUC-JP">
  const m2 = head.match(/<meta\s[^>]*http-equiv\s*=\s*"?Content-Type"?[^>]*content\s*=\s*"[^"]*charset=([^"\s;]+)/i)
  if (m2) return m2[1].toLowerCase()
  return null
}

/**
 * レスポンスボディをエンコーディングを検出してデコードする。
 * 優先順: Content-Type charset → HTML meta charset → UTF-8 フォールバック
 */
export async function decodeResponse(res: Response): Promise<string> {
  const ct = res.headers.get('content-type') || ''
  const headerCharset = charsetFromContentType(ct)

  // Content-Type に charset が明示されていて UTF-8 なら、res.text() で高速処理
  if (headerCharset && /^utf-?8$/i.test(headerCharset)) {
    return res.text()
  }

  // charset が不明 or 非 UTF-8 → バイナリで受け取って検出
  const buf = new Uint8Array(await res.arrayBuffer())
  const charset = headerCharset || charsetFromBytes(buf) || 'utf-8'

  try {
    return new TextDecoder(charset, { fatal: false }).decode(buf)
  } catch {
    // 未知の charset ラベルの場合は UTF-8 フォールバック
    return new TextDecoder('utf-8', { fatal: false }).decode(buf)
  }
}

/**
 * Fetch HTML from an external URL with safeFetch (SSRF-protected) + FlareSolverr fallback.
 * For internal URLs (e.g. RSS Bridge), use plain fetch() directly instead.
 */
export async function fetchHtml(url: string, opts?: {
  timeout?: number
  useFlareSolverr?: boolean
}): Promise<FetchHtmlResult> {
  const timeout = opts?.timeout ?? DEFAULT_TIMEOUT

  // Go straight to FlareSolverr if requested
  if (opts?.useFlareSolverr) {
    const flare = await fetchViaFlareSolverr(url)
    if (!flare) throw new Error('FlareSolverr failed')
    return { html: flare.body, contentType: flare.contentType, usedFlareSolverr: true }
  }

  let res: Response
  try {
    res = await safeFetch(url, {
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(timeout),
    })
  } catch {
    // Network-level failure (ECONNRESET, DNS, timeout, etc.) — try FlareSolverr
    const flare = await fetchViaFlareSolverr(url)
    if (!flare) throw new Error('Fetch failed and FlareSolverr unavailable')
    return { html: flare.body, contentType: flare.contentType, usedFlareSolverr: true }
  }

  if (!res.ok) {
    const flare = await fetchViaFlareSolverr(url)
    if (!flare) throw new Error(`HTTP ${res.status}`)
    return { html: flare.body, contentType: flare.contentType, usedFlareSolverr: true }
  }

  return {
    html: await decodeResponse(res),
    contentType: res.headers.get('content-type') || '',
    usedFlareSolverr: false,
  }
}

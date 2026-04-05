export const KEY_BINDING_ACTIONS = [
  'next',
  'nextUnread',
  'prev',
  'skipNext',
  'skipPrev',
  'first',
  'last',
  'markRead',
  'bookmark',
  'openExternal',
  'toggleMedia',
] as const

export type KeyBindingAction = typeof KEY_BINDING_ACTIONS[number]

export type KeyBindings = Record<KeyBindingAction, string>

const NAMED_KEY_TOKENS = new Set(['space', 'home', 'end'])
const PRINTABLE_RE = /^[!-~]$/

export const DEFAULT_KEY_BINDINGS: KeyBindings = {
  next: 'j',
  nextUnread: 'h',
  prev: 'k',
  skipNext: 'n',
  skipPrev: 'p',
  first: 'home',
  last: 'end',
  markRead: 'r',
  bookmark: 'f',
  openExternal: 'space',
  toggleMedia: 'v',
}

export function normalizeKeyBindingToken(raw: string): string {
  const trimmed = raw.trim().toLowerCase()
  if (trimmed === ' ') return 'space'
  if (trimmed === 'spacebar') return 'space'
  return trimmed
}

export function isValidKeyBindingToken(raw: string): boolean {
  const token = normalizeKeyBindingToken(raw)
  return NAMED_KEY_TOKENS.has(token) || PRINTABLE_RE.test(token)
}

export function isValidKeyBindings(value: unknown): value is KeyBindings {
  if (typeof value !== 'object' || value === null) return false
  const obj = value as Record<string, unknown>
  const keys = Object.keys(obj)
  if (keys.length !== KEY_BINDING_ACTIONS.length) return false
  if (!KEY_BINDING_ACTIONS.every(key => keys.includes(key))) return false

  const tokens = KEY_BINDING_ACTIONS.map(key => obj[key])
  if (!tokens.every(token => typeof token === 'string' && isValidKeyBindingToken(token))) {
    return false
  }

  const normalized = tokens.map(token => normalizeKeyBindingToken(token as string))
  return new Set(normalized).size === normalized.length
}

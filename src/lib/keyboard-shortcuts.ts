import {
  isValidKeyBindingToken,
  normalizeKeyBindingToken,
} from '../../shared/keyboard-shortcuts'

export function eventToKeyBindingToken(key: string): string | null {
  if (key === ' ') return 'space'

  const normalized = normalizeKeyBindingToken(key)
  return isValidKeyBindingToken(normalized) ? normalized : null
}

export function formatKeyBindingToken(token: string): string {
  const normalized = normalizeKeyBindingToken(token)
  switch (normalized) {
    case 'space':
      return 'Space'
    case 'home':
      return 'Home'
    case 'end':
      return 'End'
    default:
      return normalized.length === 1 ? normalized.toUpperCase() : normalized
  }
}

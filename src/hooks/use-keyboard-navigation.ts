import { useEffect, useRef } from 'react'
import {
  DEFAULT_KEY_BINDINGS,
  type KeyBindings,
} from '../../shared/keyboard-shortcuts'
import { eventToKeyBindingToken } from '../lib/keyboard-shortcuts'

/** Number of items from the end at which onNearEnd fires */
const NEAR_END_THRESHOLD = 5

interface UseKeyboardNavigationOptions {
  items: string[]
  focusedItemId: string | null
  onFocusChange: (id: string, mode?: 'activate' | 'skip') => void
  onEnter?: (id: string) => void
  onEscape?: () => void
  onMarkReadToggle?: (id: string) => void
  onBookmarkToggle?: (id: string) => void
  onOpenExternal?: (id: string) => void
  onToggleMedia?: () => void
  onNearEnd?: () => void
  isItemUnread?: (id: string) => boolean
  enabled: boolean
  keyBindings?: KeyBindings
}

export function useKeyboardNavigation(options: UseKeyboardNavigationOptions) {
  // Keep latest options in a ref so the event listener always sees current values
  // without needing to re-attach on every render.
  const optionsRef = useRef(options)
  optionsRef.current = options

  useEffect(() => {
    if (!options.enabled) return

    function handleKeyDown(e: KeyboardEvent) {
      const { items, focusedItemId, onFocusChange, onEnter, onEscape, onMarkReadToggle, onBookmarkToggle, onOpenExternal, onToggleMedia, onNearEnd, isItemUnread, keyBindings } = optionsRef.current
      const bindings = keyBindings ?? DEFAULT_KEY_BINDINGS

      const target = e.target as HTMLElement
      const isInput =
        ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) ||
        target.isContentEditable ||
        (typeof target.getAttribute === 'function' && target.getAttribute('contenteditable') === 'true')

      if (isInput) return

      // Check for open dialogs/modals (skip article overlay which allows j/k)
      const openDialog = document.querySelector('[role="dialog"][data-state="open"]:not([data-keyboard-nav-passthrough])')
      if (openDialog) return

      const token = eventToKeyBindingToken(e.key)

      const focusItem = (index: number, mode: 'activate' | 'skip' = 'activate') => {
        if (index < 0 || index >= items.length) return
        const id = items[index]
        if (mode === 'skip') onFocusChange(id, mode)
        else onFocusChange(id)
        if (mode === 'activate' && items.length - index <= NEAR_END_THRESHOLD && onNearEnd) {
          onNearEnd()
        }
      }

      const currentIndex = focusedItemId === null ? -1 : items.indexOf(focusedItemId)

      if (token === bindings.next || token === bindings.prev) {
        if (items.length === 0) return
        e.preventDefault()

        if (currentIndex === -1) {
          focusItem(0)
          return
        }

        if (token === bindings.next) {
          focusItem(currentIndex + 1)
        } else {
          focusItem(currentIndex - 1)
        }
        return
      }

      if (token === bindings.nextUnread) {
        if (items.length === 0 || !isItemUnread) return
        e.preventDefault()
        const startIndex = currentIndex >= 0 ? currentIndex + 1 : 0
        const nextUnreadIndex = items.findIndex((id, index) => index >= startIndex && isItemUnread(id))
        if (nextUnreadIndex >= 0) {
          focusItem(nextUnreadIndex)
        }
        return
      }

      if (token === bindings.skipNext) {
        if (items.length === 0) return
        e.preventDefault()
        focusItem(currentIndex === -1 ? 0 : currentIndex + 1, 'skip')
        return
      }

      if (token === bindings.skipPrev) {
        if (items.length === 0) return
        e.preventDefault()
        focusItem(currentIndex === -1 ? 0 : currentIndex - 1, 'skip')
        return
      }

      if (token === bindings.first) {
        if (items.length === 0) return
        e.preventDefault()
        focusItem(0)
        return
      }

      if (token === bindings.last) {
        if (items.length === 0) return
        e.preventDefault()
        focusItem(items.length - 1)
        return
      }

      if (e.key === 'Enter' && focusedItemId && onEnter) {
        e.preventDefault()
        onEnter(focusedItemId)
        return
      }

      if (e.key === 'Escape' && onEscape) {
        // If a passthrough dialog (e.g. article overlay) is open, let it handle Escape
        if (document.querySelector('[data-keyboard-nav-passthrough][data-state="open"]')) return
        onEscape()
        return
      }

      if (token === bindings.markRead && focusedItemId && onMarkReadToggle) {
        e.preventDefault()
        onMarkReadToggle(focusedItemId)
        return
      }

      if (token === bindings.bookmark && focusedItemId && onBookmarkToggle) {
        e.preventDefault()
        onBookmarkToggle(focusedItemId)
        return
      }

      if (token === bindings.openExternal && focusedItemId && onOpenExternal) {
        e.preventDefault()
        onOpenExternal(focusedItemId)
        return
      }

      if (token === bindings.toggleMedia && onToggleMedia) {
        e.preventDefault()
        onToggleMedia()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [options.enabled])
}

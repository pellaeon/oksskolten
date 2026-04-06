import { useState, useEffect } from 'react'
import {
  coerceKeyBindings,
  DEFAULT_KEY_BINDINGS,
  type KeyBindings,
} from '../../shared/keyboard-shortcuts'

const STORAGE_KEY = 'keybindings'

function getStored(): KeyBindings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_KEY_BINDINGS
    return coerceKeyBindings(JSON.parse(raw))
  } catch {
    return DEFAULT_KEY_BINDINGS
  }
}

export function useKeybindingsSetting() {
  const [keybindings, setKeybindingsState] = useState<KeyBindings>(getStored)

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(keybindings))
  }, [keybindings])

  return { keybindings, setKeybindings: setKeybindingsState }
}

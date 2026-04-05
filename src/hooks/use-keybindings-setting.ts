import { useState, useEffect } from 'react'
import {
  DEFAULT_KEY_BINDINGS,
  isValidKeyBindings,
  type KeyBindings,
} from '../../shared/keyboard-shortcuts'

const STORAGE_KEY = 'keybindings'

function getStored(): KeyBindings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_KEY_BINDINGS
    const parsed = JSON.parse(raw)
    return isValidKeyBindings(parsed) ? parsed : DEFAULT_KEY_BINDINGS
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

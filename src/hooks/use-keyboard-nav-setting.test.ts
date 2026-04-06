import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useKeyboardNavSetting } from './use-keyboard-nav-setting'

describe('useKeyboardNavSetting', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('defaults to on when localStorage is empty', () => {
    const { result } = renderHook(() => useKeyboardNavSetting())

    expect(result.current.keyboardNavigation).toBe('on')
  })

  it('persists changes to localStorage', () => {
    const { result } = renderHook(() => useKeyboardNavSetting())

    act(() => {
      result.current.setKeyboardNavigation('off')
    })

    expect(result.current.keyboardNavigation).toBe('off')
    expect(localStorage.getItem('keyboard-navigation')).toBe('off')
  })
})

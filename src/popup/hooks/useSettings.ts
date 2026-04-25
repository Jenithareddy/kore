// src/popup/hooks/useSettings.ts
// React hook to read/write settings from IndexedDB via Dexie

import { useState, useEffect, useCallback } from 'react'
import { getSetting, setSetting } from '../../db'

export function useSettings<T>(key: string, defaultValue: T): {
  value: T
  setValue: (v: T) => Promise<void>
  loading: boolean
} {
  const [value, setValueState] = useState<T>(defaultValue)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    getSetting<T>(key).then(v => {
      if (!cancelled) {
        setValueState(v ?? defaultValue)
        setLoading(false)
      }
    })
    return () => { cancelled = true }
  }, [key, defaultValue])

  const setValue = useCallback(async (v: T) => {
    await setSetting(key, v)
    setValueState(v)
  }, [key])

  return { value, setValue, loading }
}

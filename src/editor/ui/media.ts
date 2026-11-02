import { useSyncExternalStore } from 'react'

/** Узкий или сенсорный экран: просмотр переходит на шторки и жесты. */
export const COMPACT_QUERY = '(max-width: 640px), (pointer: coarse)'

export function useMedia(query: string): boolean {
  return useSyncExternalStore(
    (notify) => {
      const list = window.matchMedia(query)
      list.addEventListener('change', notify)
      return () => list.removeEventListener('change', notify)
    },
    () => window.matchMedia(query).matches,
    () => false,
  )
}

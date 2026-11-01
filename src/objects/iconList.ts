import { fas } from '@fortawesome/free-solid-svg-icons'
import type { IconDefinition } from '@fortawesome/fontawesome-svg-core'

export type IconChoice = { name: string; icon: IconDefinition }

function isIcon(value: unknown): value is IconDefinition {
  return !!value && typeof value === 'object' && 'iconName' in value && 'icon' in value
}

const byName = new Map<string, IconDefinition>()
for (const value of Object.values(fas)) {
  if (!isIcon(value) || byName.has(value.iconName)) continue
  byName.set(value.iconName, value)
}

export const ICON_CHOICES: IconChoice[] = [...byName.entries()]
  .map(([name, icon]) => ({ name, icon }))
  .sort((a, b) => a.name.localeCompare(b.name))

export function findIcon(name: string | undefined): IconDefinition | null {
  if (!name) return null
  return byName.get(name) ?? null
}

export function searchIcons(query: string, limit = 72): IconChoice[] {
  const needle = query.trim().toLowerCase().replace(/\s+/g, '-')
  if (!needle) return ICON_CHOICES.slice(0, limit)
  const found: IconChoice[] = []
  for (const choice of ICON_CHOICES) {
    if (!choice.name.includes(needle)) continue
    found.push(choice)
    if (found.length >= limit) break
  }
  return found
}

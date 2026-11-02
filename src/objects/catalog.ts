import { CHAIR_LENGTH, CHAIR_WIDTH } from '../constants'
import { theme } from '../theme'
import type { ObjectKind, PlanObject, StairDirection } from '../types'

export type ObjectSpec = {
  kind: ObjectKind
  name: string
  length: number
  width: number
  step?: number
  direction?: StairDirection
}

export const OBJECT_ORDER: ObjectKind[] = [
  'stair',
  'table',
  'cooler',
  'microwave',
  'printer',
  'wardrobe',
  'toilet',
  'sink',
  'shower',
  'fridge',
  'bed',
  'sofa',
  'interest',
]

export const OBJECTS: Record<ObjectKind, ObjectSpec> = {
  stair: { kind: 'stair', name: 'Лестница', length: 300, width: 120, step: 30, direction: 'up' },
  table: { kind: 'table', name: 'Стол', length: 150, width: 100 },
  cooler: { kind: 'cooler', name: 'Кулер', length: 40, width: 40 },
  microwave: { kind: 'microwave', name: 'Микроволновка', length: 50, width: 35 },
  printer: { kind: 'printer', name: 'Принтер', length: 50, width: 40 },
  wardrobe: { kind: 'wardrobe', name: 'Шкаф', length: 100, width: 60 },
  toilet: { kind: 'toilet', name: 'Унитаз', length: 40, width: 70 },
  sink: { kind: 'sink', name: 'Раковина', length: 50, width: 40 },
  shower: { kind: 'shower', name: 'Душевая', length: 90, width: 90 },
  fridge: { kind: 'fridge', name: 'Холодильник', length: 60, width: 70 },
  bed: { kind: 'bed', name: 'Кровать', length: 200, width: 90 },
  sofa: { kind: 'sofa', name: 'Диван', length: 180, width: 80 },
  interest: { kind: 'interest', name: 'Прочее', length: 120, width: 80 },
}

/** Знак типа. На плане лестница его не рисует: там ступени и стрелка. */
export const TYPE_SYMBOL: Record<ObjectKind, string> = {
  stair: 'stairs',
  table: 'computer',
  cooler: 'droplet',
  microwave: 'utensils',
  printer: 'print',
  wardrobe: 'box-archive',
  toilet: 'toilet',
  sink: 'sink',
  shower: 'shower',
  fridge: 'snowflake',
  bed: 'bed',
  sofa: 'couch',
  interest: 'star',
}

export function typeSymbol(kind: ObjectKind): string {
  return TYPE_SYMBOL[kind]
}

export type Category = keyof typeof theme.category

export const OBJECT_CATEGORY: Record<ObjectKind, Category> = {
  stair: 'navigation',
  table: 'furniture',
  cooler: 'kitchen',
  microwave: 'kitchen',
  printer: 'tech',
  wardrobe: 'furniture',
  toilet: 'sanitary',
  sink: 'sanitary',
  shower: 'sanitary',
  fridge: 'kitchen',
  bed: 'furniture',
  sofa: 'furniture',
  interest: 'other',
}

export const CATEGORY_ORDER: Category[] = ['navigation', 'sanitary', 'kitchen', 'tech', 'furniture', 'other']

export const CATEGORY_NAME: Record<Category, string> = {
  navigation: 'Навигация',
  sanitary: 'Санузел',
  kitchen: 'Кухня и вода',
  tech: 'Техника',
  furniture: 'Мебель',
  other: 'Прочее',
}

/** Кто первым занимает место при раскладке маркеров: меньше — раньше. */
export const CATEGORY_PRIORITY: Record<Category, number> = {
  other: 0,
  sanitary: 1,
  kitchen: 2,
  tech: 3,
  navigation: 4,
  furniture: 5,
}

export function categoryOf(kind: ObjectKind): Category {
  return OBJECT_CATEGORY[kind]
}

export function kindColor(kind: ObjectKind): string {
  return theme.category[OBJECT_CATEGORY[kind]]
}

/** Знак предмета: своя иконка, если её нашли, иначе знак типа. */
export function objectSymbol(object: Pick<PlanObject, 'kind' | 'symbol'>): string {
  return object.symbol ?? TYPE_SYMBOL[object.kind]
}

export const CHAIR_NAME = 'Кресло'

export function objectName(kind: ObjectKind): string {
  return OBJECTS[kind].name
}

export function objectFill(object: Pick<PlanObject, 'kind' | 'color'>): string {
  return object.color ?? kindColor(object.kind)
}

export function stairStepOf(object: PlanObject): number {
  const fallback = OBJECTS.stair.step ?? object.length
  const step = object.step ?? fallback
  return Math.min(Math.max(step, 1), Math.max(object.length, 1))
}

export function stairDirectionOf(object: PlanObject): StairDirection {
  return object.direction ?? 'up'
}

export function chairsOf(object: PlanObject) {
  return object.chairs ?? []
}

export const DEFAULT_CHAIR = { length: CHAIR_LENGTH, width: CHAIR_WIDTH }

/** Как поле редактируется, и в каком режиме оно вообще есть на экране. */
export type FieldControl = 'readonly' | 'text' | 'tags' | 'color' | 'meters' | 'direction' | 'chairs' | 'icon' | 'copy' | 'remove'

export type ObjectField = {
  id: string
  control: FieldControl
  edit: boolean
  view: boolean
  kinds?: ObjectKind[]
  except?: ObjectKind[]
}

export const OBJECT_FIELDS: ObjectField[] = [
  { id: 'typeName', control: 'readonly', edit: true, view: true },
  { id: 'note', control: 'text', edit: true, view: true },
  { id: 'tags', control: 'tags', edit: true, view: true },
  { id: 'symbol', control: 'icon', edit: true, view: false, except: ['stair'] },
  { id: 'color', control: 'color', edit: true, view: false, except: ['stair'] },
  { id: 'length', control: 'meters', edit: true, view: false },
  { id: 'width', control: 'meters', edit: true, view: false },
  { id: 'step', control: 'meters', edit: true, view: false, kinds: ['stair'] },
  { id: 'direction', control: 'direction', edit: true, view: false, kinds: ['stair'] },
  { id: 'chairs', control: 'chairs', edit: true, view: false, kinds: ['table'] },
  { id: 'copy', control: 'copy', edit: true, view: false },
  { id: 'remove', control: 'remove', edit: true, view: false },
]

export const CHAIR_FIELDS: ObjectField[] = [
  { id: 'typeName', control: 'readonly', edit: true, view: false },
  { id: 'remove', control: 'remove', edit: true, view: false },
]

export function visibleFields(fields: ObjectField[], editing: boolean, kind?: ObjectKind): ObjectField[] {
  return fields.filter((field) => {
    if (editing ? !field.edit : !field.view) return false
    if (field.kinds && kind && !field.kinds.includes(kind)) return false
    if (field.kinds && !kind) return false
    if (field.except && kind && field.except.includes(kind)) return false
    return true
  })
}

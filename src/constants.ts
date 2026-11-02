/** Единиц холста в одном метре подписи. Толщина и проёмы остаются в единицах холста. */
export const UNITS_PER_METER = 100
export const DEFAULT_THICKNESS = 12
export const MIN_THICKNESS = 0
export const MAX_THICKNESS = 48
export const MIN_SPAN = 0.01
export const GRID_STEP = 20
export const SNAP_PX = 12
export const GHOST_BREAK_PX = 28
export const DRAG_THRESHOLD_PX = 5
export const DEFAULT_OPENING_WIDTH = 36
export const WHEEL_MS = 400
/** Пауза, после которой ряд ширины проёма снова начинается с сантиметра. */
export const OPENING_SERIES_MS = 500
/** События тачпада ближе этого интервала — один жест, а не пачка шагов. */
export const WHEEL_BURST_MS = 40
export const OPENING_STEP_MAX = 32
/** Сдвиг копии предмета: 20 см, 20 единиц холста. */
export const COPY_OFFSET = 20
export const HISTORY_LIMIT = 200
export const MIN_ZOOM = 0.05
export const MAX_ZOOM = 12
export const ZOOM_FACTOR = 1.08
export const ALIGN_DEG = 2
/** Нижняя граница длины, ширины и шага: один сантиметр, одна единица холста. */
export const MIN_OBJECT_SPAN = 1
/** Зазор между кромкой стола и креслом, в единицах холста. Не доля размера кресла. */
export const CHAIR_GAP = 8
export const CHAIR_LENGTH = 45
export const CHAIR_WIDTH = 40

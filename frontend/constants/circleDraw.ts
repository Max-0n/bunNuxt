/**
 * Пороги погрешности относительно радиуса эталонного круга (доли R).
 * Чем больше значение — тем мягче оценка по этой метрике.
 */
export const CIRCLE_DRAW_TOLERANCE = {
  /** Средняя ошибка расстояния точек до окружности: при meanErr/R = radialMeanErrorRatio балл по радиусу → 0 */
  radialMeanErrorRatio: 0.14,
  /** Зазор между первой и последней точкой: при gap/R = closureGapRatio балл замыкания → 0 */
  closureGapRatio: 0.35,
  /** Целевое число полных оборотов по сумме углов (для круга — ровно один) */
  sweepTargetTurns: 1,
  /**
   * При отклонении |факт − sweepTargetTurns| ≥ этого значения вклад sweep → 0.
   * Между 0 и этим — линейно от 100 к 0 (пик при ровно одном обороте).
   */
  sweepTurnDeviationFull: 0.45,
} as const

/** Толщина линии эталонного круга (px в логических координатах Phaser) */
export const CIRCLE_LINE_WIDTH_IDEAL = 6

/** Толщина линии рисунка пользователя (px) */
export const CIRCLE_LINE_WIDTH_USER = 10

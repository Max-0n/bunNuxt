import { CIRCLE_DRAW_TOLERANCE } from '~/constants/circleDraw'

export type CircleScoreResult = {
  score: number
  details: {
    radial: number
    sweep: number
    closure: number
    meanRadialErrorPx: number
    windingTurns: number
    closureGapPx: number
  }
}

type Point = { x: number; y: number }

/** Минимум точек в штрихе, ниже которого оценку не считаем */
const MIN_POINTS = 14

function clamp(v: number, lo: number, hi: number): number {
  // Сначала ограничиваем v сверху через hi, затем снизу через lo — итог в [lo, hi]
  return Math.max(lo, Math.min(hi, v))
}

function angleDelta(cx: number, cy: number, p: Point, q: Point): number {
  // Угол луча от центра к точке p (радианы, от -π до π)
  const a = Math.atan2(p.y - cy, p.x - cx)
  // Угол луча от центра к точке q
  const b = Math.atan2(q.y - cy, q.x - cx)
  // Сырая разница углов (ещё может быть вне (-π, π])
  let d = b - a
  // Пока разница больше π — вычитаем полный оборот (выбираем кратчайший дуговой ход)
  while (d > Math.PI) d -= 2 * Math.PI
  // Пока разница меньше -π — прибавляем полный оборот
  while (d < -Math.PI) d += 2 * Math.PI
  // Знаковое приращение угла между соседними точками относительно центра
  return d
}

/**
 * Сравнивает обводку с эталонной окружностью (центр cx,cy, радиус R).
 * Учитывает среднее отклонение по радиусу, полноту оборота и замыкание контура.
 */
export function evaluateCircleStroke(points: Point[], cx: number, cy: number, R: number): CircleScoreResult | null {
  // Недостаточно точек для устойчивой оценки или вырожденный радиус — результата нет
  if (points.length < MIN_POINTS || R < 1) {
    // Сигнал вызывающему коду: показать подсказку или не обновлять оценку
    return null
  }

  // Накопитель суммы |расстояние до центра − R| по всем точкам
  let sumErr = 0
  // Перебираем каждую отсчитанную точку штриха
  for (const p of points) {
    // Расстояние от точки до центра эталонной окружности
    const d = Math.hypot(p.x - cx, p.y - cy)
    // Добавляем модуль отклонения от идеального кольца радиуса R
    sumErr += Math.abs(d - R)
  }
  // Среднее абсолютное отклонение по радиусу (пиксели)
  const meanErr = sumErr / points.length
  // Балл 0–100: чем меньше meanErr относительно порога radialMeanErrorRatio·R, тем выше; clamp обрезает хвосты
  const radial = clamp(100 * (1 - meanErr / (CIRCLE_DRAW_TOLERANCE.radialMeanErrorRatio * R)), 0, 100)

  // Сумма знаковых угловых приращений вдоль линии (набегает «поворот» вокруг центра)
  let winding = 0
  // Идём по соседним точкам в порядке рисования
  for (let i = 0; i < points.length - 1; i++) {
    // Добавляем кратчайший поворот от направления на pᵢ к направлению на pᵢ₊₁
    winding += angleDelta(cx, cy, points[i]!, points[i + 1]!)
  }
  // Сколько полных оборотов (2π радиан = один круг) даёт сумма углов по модулю
  const turns = Math.abs(winding) / (2 * Math.PI)
  // Идеал — ровно sweepTargetTurns оборота(ов); отклонение в любую сторону снижает балл
  const sweepDeviation = Math.abs(turns - CIRCLE_DRAW_TOLERANCE.sweepTargetTurns)
  const sweep = clamp(100 * (1 - sweepDeviation / CIRCLE_DRAW_TOLERANCE.sweepTurnDeviationFull), 0, 100)

  // Первая точка штриха (нажатие)
  const p0 = points[0]!
  // Последняя точка (отпускание)
  const pLast = points[points.length - 1]!
  // Евклидово расстояние между началом и концом — насколько контур «замкнут»
  const gap = Math.hypot(pLast.x - p0.x, pLast.y - p0.y)
  // Чем меньше gap относительно порога closureGapRatio·R, тем выше балл замыкания
  const closure = clamp(100 * (1 - gap / (CIRCLE_DRAW_TOLERANCE.closureGapRatio * R)), 0, 100)

  // Взвешенная сумма трёх метрик (радиус / оборот / замыкание), округление до целого
  const score = Math.round(0.52 * radial + 0.28 * sweep + 0.2 * closure)

  return {
    // Итоговая оценка 0–100 для UI
    score,
    details: {
      // Округлённый вклад «близости к кольцу эталона»
      radial: Math.round(radial),
      // Округлённый вклад «близости к одному полному обороту»
      sweep: Math.round(sweep),
      // Округлённый вклад «близости начала и конца»
      closure: Math.round(closure),
      // Сырое среднее отклонение по радиусу (для отладки и подсказок)
      meanRadialErrorPx: meanErr,
      // Сколько полных оборотов по сумме углов (может быть дробным)
      windingTurns: turns,
      // Сырой зазор между первой и последней точкой (пиксели)
      closureGapPx: gap,
    },
  }
}

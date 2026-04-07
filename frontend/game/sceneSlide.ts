import Phaser from 'phaser'

export type SceneSlidePayload = {
  slide?: 'fromLeft' | 'fromRight'
}

const DURATION_MS = 340
const EASE_IN = 'Cubic.in'
const EASE_OUT = 'Cubic.out'

export function readSlidePayload(scene: Phaser.Scene): SceneSlidePayload {
  return (scene.scene.settings.data ?? {}) as SceneSlidePayload
}

/** Въезд контента: справа (forward) или слева (back). */
export function tweenSlideEnter(
  scene: Phaser.Scene,
  root: Phaser.GameObjects.Container,
  width: number,
  onComplete?: () => void
): void {
  const { slide } = readSlidePayload(scene)
  if (slide === 'fromRight') {
    root.setX(width)
  } else if (slide === 'fromLeft') {
    root.setX(-width)
  } else {
    onComplete?.()
    return
  }

  scene.tweens.add({
    targets: root,
    x: 0,
    duration: DURATION_MS,
    ease: EASE_OUT,
    onComplete,
  })
}

/** Выезд и переход: forward — уезжаем влево, новая сцена въезжает справа; back — наоборот. */
export function tweenSlideExitThenStart(
  scene: Phaser.Scene,
  root: Phaser.GameObjects.Container,
  width: number,
  direction: 'forward' | 'back',
  targetKey: string
): void {
  const endX = direction === 'forward' ? -width : width
  scene.tweens.add({
    targets: root,
    x: endX,
    duration: DURATION_MS,
    ease: EASE_IN,
    onComplete: () => {
      const payload: SceneSlidePayload = {
        slide: direction === 'forward' ? 'fromRight' : 'fromLeft',
      }
      scene.scene.start(targetKey, payload)
    },
  })
}

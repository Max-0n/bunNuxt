import Phaser from 'phaser'
import { CIRCLE_DRAW_REGISTRY_KEY, type CircleDrawGameContext } from '~/game/circleDrawApi'
import { CircleDrawScene } from '~/game/circleDrawScene'
import { LeaderboardScene } from '~/game/leaderboardScene'
import { LoadingScene } from '~/game/loadingScene'
import { MenuScene } from '~/game/menuScene'

export type CreateCircleDrawGameOptions = {
  apiBaseUrl: string
}

export function createCircleDrawGame(
  parent: HTMLElement,
  options: CreateCircleDrawGameOptions
): { destroy: () => void; resize: () => void } {
  const ctx: CircleDrawGameContext = { apiBaseUrl: options.apiBaseUrl }

  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    backgroundColor: 0x0f0114,
    scale: {
      mode: Phaser.Scale.RESIZE,
      autoCenter: Phaser.Scale.CENTER_BOTH,
      width: Math.max(parent.clientWidth, 320),
      height: Math.max(parent.clientHeight, 420),
    },
    scene: [LoadingScene, MenuScene, CircleDrawScene, LeaderboardScene],
    input: {
      touch: { capture: true },
    },
    callbacks: {
      preBoot: g => {
        g.registry.set(CIRCLE_DRAW_REGISTRY_KEY, ctx)
      },
    },
  })

  return {
    destroy: () => {
      game.destroy(true)
    },
    resize: () => {
      game.scale.resize(Math.max(parent.clientWidth, 320), Math.max(parent.clientHeight, 420))
    },
  }
}

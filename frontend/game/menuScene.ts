import Phaser from 'phaser'
import { CIRCLE_DRAW_REGISTRY_KEY, type CircleDrawGameContext, fetchCircleDrawLeaderboard } from '~/game/circleDrawApi'
import { SceneKey } from '~/game/sceneKeys'
import { tweenSlideEnter, tweenSlideExitThenStart } from '~/game/sceneSlide'
import { formatRecordDateTime } from '~/utils/formatRecordDateTime'

type MenuButton = {
  background: Phaser.GameObjects.Rectangle
  label: Phaser.GameObjects.Text
}

type FallingBlob = {
  shape: Phaser.GameObjects.Arc
  vy: number
}

export class MenuScene extends Phaser.Scene {
  private root!: Phaser.GameObjects.Container
  private topRecordText!: Phaser.GameObjects.Text
  private titleText!: Phaser.GameObjects.Text
  private subtitleText!: Phaser.GameObjects.Text
  private startButton!: MenuButton
  private leaderboardButton!: MenuButton

  private blobs: FallingBlob[] = []
  private blobAreaW = 0
  private blobAreaH = 0

  constructor() {
    super({ key: SceneKey.Menu })
  }

  create(): void {
    this.cameras.main.setBackgroundColor(0x0f0114)

    const w = this.scale.width
    const h = this.scale.height

    this.root = this.add.container(0, 0)

    this.titleText = this.add
      .text(w / 2, 76, 'Circle Draw', {
        fontFamily: 'Rubik, sans-serif',
        fontSize: '44px',
        color: '#ffffff',
      })
      .setOrigin(0.5)

    this.subtitleText = this.add
      .text(w / 2, 126, 'Нарисуй максимально идеальный круг', {
        fontFamily: 'Rubik, sans-serif',
        fontSize: '17px',
        color: '#ffffffcc',
      })
      .setOrigin(0.5)

    this.topRecordText = this.add
      .text(w / 2, 190, '', {
        fontFamily: 'Rubik, sans-serif',
        fontSize: '16px',
        color: '#82f88e',
        align: 'center',
      })
      .setOrigin(0.5)

    this.startButton = this.createButton('Начать', 0x229dda, () => {
      tweenSlideExitThenStart(this, this.root, w, 'forward', SceneKey.CircleDraw)
    })

    this.leaderboardButton = this.createButton('Лидерборд', 0x8a2cd2, () => {
      tweenSlideExitThenStart(this, this.root, w, 'forward', SceneKey.Leaderboard)
    })

    this.spawnFallingBlobs(w, h)

    this.root.add([
      this.titleText,
      this.subtitleText,
      this.topRecordText,
      this.startButton.background,
      this.startButton.label,
      this.leaderboardButton.background,
      this.leaderboardButton.label,
    ])

    this.topRecordText.setText('ТОП рекорд: загрузка…')
    void this.refreshTopRecord()
    this.layout()
    this.prepareButtonEntrance()

    tweenSlideEnter(this, this.root, w, () => {
      this.playButtonEntrance()
    })

    this.scale.on('resize', this.handleResize, this)
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off('resize', this.handleResize, this)
    })
  }

  override update(_time: number, delta: number): void {
    const h = this.blobAreaH
    const w = this.blobAreaW
    if (h < 1 || w < 1) return

    const dt = delta / 1000
    for (const b of this.blobs) {
      b.shape.y += b.vy * dt
      if (b.shape.y > h + 80) {
        b.shape.y = Phaser.Math.Between(-160, -20)
        b.shape.x = Phaser.Math.Between(20, w - 20)
        b.shape.setRadius(Phaser.Math.Between(6, 28))
        b.vy = Phaser.Math.FloatBetween(28, 92)
        b.shape.setAlpha(Phaser.Math.FloatBetween(0.06, 0.18))
      }
    }
  }

  private spawnFallingBlobs(w: number, h: number): void {
    this.blobAreaW = w
    this.blobAreaH = h
    this.blobs = []

    const count = 22
    for (let i = 0; i < count; i++) {
      const r = Phaser.Math.Between(6, 32)
      const x = Phaser.Math.Between(20, Math.max(20, w - 20))
      const y = Phaser.Math.Between(-40, h + 40)
      const alpha = Phaser.Math.FloatBetween(0.05, 0.2)
      const circle = this.add.circle(x, y, r, 0xffffff, alpha)
      circle.setStrokeStyle(1, 0xffffff, alpha * 1.4)
      const vy = Phaser.Math.FloatBetween(22, 100)
      this.blobs.push({ shape: circle, vy })
      this.root.add(circle)
    }
  }

  private getCircleDrawContext(): CircleDrawGameContext | undefined {
    return this.game.registry.get(CIRCLE_DRAW_REGISTRY_KEY) as CircleDrawGameContext | undefined
  }

  private async refreshTopRecord(): Promise<void> {
    const ctx = this.getCircleDrawContext()
    if (!ctx?.apiBaseUrl) {
      this.topRecordText.setText('ТОП рекорд: не задан API_URL')
      return
    }

    try {
      const data = await fetchCircleDrawLeaderboard()
      const top = data.entries[0]
      if (!top) {
        this.topRecordText.setText('ТОП рекорд: пока пусто')
        return
      }

      this.topRecordText.setText(
        `ТОП рекорд: ${top.scorePercent}% (${top.username})\n${formatRecordDateTime(Date.parse(top.createdAt))}`
      )
    } catch {
      this.topRecordText.setText('ТОП рекорд: не удалось загрузить')
    }
  }

  private createButton(text: string, color: number, onClick: () => void): MenuButton {
    const background = this.add.rectangle(0, 0, 300, 56, color, 0.95).setOrigin(0.5).setStrokeStyle(2, 0xffffff, 0.22)

    const label = this.add
      .text(0, 0, text, {
        fontFamily: 'Rubik, sans-serif',
        fontSize: '20px',
        color: '#ffffff',
      })
      .setOrigin(0.5)

    background.setInteractive({ useHandCursor: true })
    background.on('pointerover', () => background.setFillStyle(color, 1))
    background.on('pointerout', () => background.setFillStyle(color, 0.95))
    background.on('pointerdown', () => background.setScale(0.985))
    background.on('pointerup', () => {
      background.setScale(1)
      onClick()
    })

    return { background, label }
  }

  /** Стартовое состояние перед анимацией появления */
  private prepareButtonEntrance(): void {
    const buttons: MenuButton[] = [this.startButton, this.leaderboardButton]
    for (const btn of buttons) {
      btn.background.setAlpha(0)
      btn.label.setAlpha(0)
      btn.background.setScale(0.88)
      btn.label.setScale(0.88)
    }
  }

  private playButtonEntrance(): void {
    const stagger = 110
    const duration = 520

    const animate = (btn: MenuButton, delay: number) => {
      const yBg = btn.background.y
      const yLb = btn.label.y
      btn.background.setY(yBg + 36)
      btn.label.setY(yLb + 36)

      this.tweens.add({
        targets: btn.background,
        alpha: 1,
        scaleX: 1,
        scaleY: 1,
        y: yBg,
        duration,
        delay,
        ease: 'Back.out',
      })
      this.tweens.add({
        targets: btn.label,
        alpha: 1,
        scaleX: 1,
        scaleY: 1,
        y: yLb,
        duration,
        delay,
        ease: 'Back.out',
      })
    }

    animate(this.startButton, 0)
    animate(this.leaderboardButton, stagger)
  }

  private layout(): void {
    const w = this.scale.width
    const h = this.scale.height

    this.blobAreaW = w
    this.blobAreaH = h

    this.titleText.setPosition(w / 2, 76)
    this.subtitleText.setPosition(w / 2, 126)
    this.topRecordText.setPosition(w / 2, Math.max(190, h * 0.36))

    this.startButton.background.setPosition(w / 2, h - 170)
    this.startButton.label.setPosition(w / 2, h - 170)

    this.leaderboardButton.background.setPosition(w / 2, h - 98)
    this.leaderboardButton.label.setPosition(w / 2, h - 98)
  }

  private handleResize(): void {
    this.layout()
  }
}

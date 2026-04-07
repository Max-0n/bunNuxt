import Phaser from 'phaser'
import { CIRCLE_LINE_WIDTH_IDEAL, CIRCLE_LINE_WIDTH_USER } from '~/constants/circleDraw'
import { addCircleDrawRecord } from '~/game/recordsStorage'
import { SceneKey } from '~/game/sceneKeys'
import { tweenSlideEnter, tweenSlideExitThenStart } from '~/game/sceneSlide'
import { evaluateCircleStroke } from '~/utils/evaluateCircleStroke'

type Point = { x: number; y: number }
type SceneButton = {
  background: Phaser.GameObjects.Rectangle
  label: Phaser.GameObjects.Text
}

export class CircleDrawScene extends Phaser.Scene {
  private root!: Phaser.GameObjects.Container
  private idealGfx!: Phaser.GameObjects.Graphics
  private userGfx!: Phaser.GameObjects.Graphics
  private hintText!: Phaser.GameObjects.Text
  private resultText!: Phaser.GameObjects.Text
  private resetButton!: SceneButton
  private menuButton!: SceneButton
  private leaderboardButton!: SceneButton

  private drawAreaTop = 72
  private drawAreaBottom = 300
  private idealCx = 0
  private idealCy = 0
  private idealR = 0

  private drawing = false
  private points: Point[] = []

  constructor() {
    super({ key: SceneKey.CircleDraw })
  }

  create(): void {
    this.cameras.main.setBackgroundColor(0x0f0114)

    this.root = this.add.container(0, 0)

    this.idealGfx = this.add.graphics()
    this.userGfx = this.add.graphics()

    this.hintText = this.add
      .text(0, 0, 'Зажмите и ведите по кругу, отпустите для оценки', {
        fontFamily: 'Rubik, sans-serif',
        fontSize: '16px',
        color: '#ffffffcc',
      })
      .setOrigin(0.5)

    this.resultText = this.add
      .text(0, 0, 'Точность и чистота: —', {
        fontFamily: 'Rubik, sans-serif',
        fontSize: '16px',
        color: '#82f88e',
        align: 'center',
      })
      .setOrigin(0.5)

    this.resetButton = this.createButton('Сбросить', 0x229dda, 220, () => {
      this.resetDrawing()
    })
    this.menuButton = this.createButton('Меню', 0x8a2cd2, 144, () => {
      tweenSlideExitThenStart(this, this.root, this.scale.width, 'back', SceneKey.Menu)
    })
    this.leaderboardButton = this.createButton('Лидерборд', 0x8a2cd2, 144, () => {
      tweenSlideExitThenStart(this, this.root, this.scale.width, 'forward', SceneKey.Leaderboard)
    })

    this.root.add([
      this.idealGfx,
      this.userGfx,
      this.hintText,
      this.resultText,
      this.resetButton.background,
      this.resetButton.label,
      this.menuButton.background,
      this.menuButton.label,
      this.leaderboardButton.background,
      this.leaderboardButton.label,
    ])

    this.layout()
    tweenSlideEnter(this, this.root, this.scale.width)

    this.input.addPointer(1)

    this.input.on('pointerdown', this.handlePointerDown, this)
    this.input.on('pointermove', this.handlePointerMove, this)
    this.input.on('pointerup', this.handlePointerUp, this)
    this.input.on('pointerupoutside', this.handlePointerUp, this)

    this.scale.on('resize', this.handleResize, this)
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.input.off('pointerdown', this.handlePointerDown, this)
      this.input.off('pointermove', this.handlePointerMove, this)
      this.input.off('pointerup', this.handlePointerUp, this)
      this.input.off('pointerupoutside', this.handlePointerUp, this)
      this.scale.off('resize', this.handleResize, this)
    })
  }

  private createButton(
    text: string,
    color: number,
    width: number,
    onClick: () => void
  ): {
    background: Phaser.GameObjects.Rectangle
    label: Phaser.GameObjects.Text
  } {
    const background = this.add.rectangle(0, 0, width, 48, color, 0.95).setOrigin(0.5).setStrokeStyle(2, 0xffffff, 0.22)
    const label = this.add
      .text(0, 0, text, {
        fontFamily: 'Rubik, sans-serif',
        fontSize: '18px',
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

  private handlePointerDown(pointer: Phaser.Input.Pointer): void {
    if (!this.isPointerInDrawArea(pointer)) return

    this.drawing = true
    this.points = [this.normalizePointer(pointer)]
    this.userGfx.clear()
    this.resultText.setText('Рисование...')
  }

  private handlePointerMove(pointer: Phaser.Input.Pointer): void {
    if (!this.drawing || !pointer.isDown) return
    this.points.push(this.normalizePointer(pointer))
    this.redrawUserStroke()
  }

  private handlePointerUp(pointer: Phaser.Input.Pointer): void {
    if (!this.drawing) return

    this.drawing = false
    this.points.push(this.normalizePointer(pointer))
    this.redrawUserStroke()

    const result = evaluateCircleStroke(this.points, this.idealCx, this.idealCy, this.idealR)
    const scorePercent = result?.score ?? 0
    addCircleDrawRecord(scorePercent)

    if (result) {
      this.resultText.setText(
        `Точность и чистота: ${scorePercent}%\nЛиния ${result.details.radial}% · Оборот ${result.details.sweep}% · Замыкание ${result.details.closure}%`
      )
    } else {
      this.resultText.setText('Точность и чистота: 0%\nСлишком короткий штрих, попробуйте нарисовать полный круг')
    }

    if (scorePercent > 90 && typeof window !== 'undefined') {
      window.alert(`Поздравляем! Очень крутой круг: ${scorePercent}%`)
    }
  }

  private handleResize(gameSize: Phaser.Structs.Size): void {
    this.layout(gameSize.width, gameSize.height)
  }

  private normalizePointer(pointer: Phaser.Input.Pointer): Point {
    const x = Phaser.Math.Clamp(pointer.x, 0, this.scale.width)
    const y = Phaser.Math.Clamp(pointer.y, 0, this.scale.height)
    return { x, y }
  }

  private isPointerInDrawArea(pointer: Phaser.Input.Pointer): boolean {
    return (
      pointer.x >= 0 &&
      pointer.x <= this.scale.width &&
      pointer.y >= this.drawAreaTop &&
      pointer.y <= this.drawAreaBottom
    )
  }

  private layout(width = this.scale.width, height = this.scale.height): void {
    this.drawAreaTop = 72
    this.drawAreaBottom = Math.max(this.drawAreaTop + 120, height - 180)

    this.idealCx = width / 2
    this.idealCy = (this.drawAreaTop + this.drawAreaBottom) / 2
    this.idealR = Math.max(48, Math.min(width * 0.34, (this.drawAreaBottom - this.drawAreaTop) * 0.42))

    this.hintText.setPosition(width / 2, 30)
    this.resultText.setPosition(width / 2, height - 138)

    this.resetButton.background.setPosition(width / 2, height - 98)
    this.resetButton.label.setPosition(width / 2, height - 98)
    this.menuButton.background.setPosition(width / 2 - 76, height - 44)
    this.menuButton.label.setPosition(width / 2 - 76, height - 44)
    this.leaderboardButton.background.setPosition(width / 2 + 76, height - 44)
    this.leaderboardButton.label.setPosition(width / 2 + 76, height - 44)

    this.drawIdealCircle()
    this.redrawUserStroke()
  }

  private drawIdealCircle(): void {
    this.idealGfx.clear()
    this.idealGfx.lineStyle(CIRCLE_LINE_WIDTH_IDEAL, 0xffffff, 0.22)
    this.idealGfx.strokeCircle(this.idealCx, this.idealCy, this.idealR)
  }

  private redrawUserStroke(): void {
    this.userGfx.clear()
    if (this.points.length < 2) return
    this.userGfx.lineStyle(CIRCLE_LINE_WIDTH_USER, 0x22c0ff, 1)
    for (let i = 1; i < this.points.length; i++) {
      const a = this.points[i - 1]!
      const b = this.points[i]!
      this.userGfx.lineBetween(a.x, a.y, b.x, b.y)
    }
  }

  private resetDrawing(): void {
    this.drawing = false
    this.points = []
    this.userGfx.clear()
    this.resultText.setText('Точность и чистота: —')
  }
}

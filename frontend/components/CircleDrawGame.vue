<template lang="pug">
.circle-draw
  .circle-draw__canvas(ref="canvasHost")
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { createCircleDrawGame } from '~/game/createCircleDrawGame'

const canvasHost = ref<HTMLElement | null>(null)

let api: ReturnType<typeof createCircleDrawGame> | null = null
let resizeObserver: ResizeObserver | null = null

onMounted(() => {
  const el = canvasHost.value
  if (!el) return

  api = createCircleDrawGame(el)

  resizeObserver = new ResizeObserver(() => {
    api?.resize()
  })
  resizeObserver.observe(el)
})

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  resizeObserver = null
  api?.destroy()
  api = null
})
</script>

<style lang="scss" scoped>
.circle-draw {
  display: flex;
  flex: 1;
  width: 100%;
  max-width: 760px;
  margin: 0 auto;
  padding: 12px 16px 16px;
  box-sizing: border-box;
}

.circle-draw__canvas {
  width: 100%;
  height: min(82vh, 760px);
  min-height: 480px;
  margin: 0 auto;
  border-radius: var(--border-radius);
  overflow: hidden;
  touch-action: none;
  box-shadow: var(--box-shadow);
}
</style>

<template lang="pug">
  main
    NuxtPage

  ModalsLayout

  Notivue(v-slot="item").is-notivue
    NotivueSwipe(:item="item")
      Notification(:item="item" :theme="theme")
</template>

<script setup lang="ts">
import { type NotivueTheme, slateTheme } from 'notivue'

const theme: NotivueTheme = {
  ...slateTheme,
  '--nv-min-width': 'calc(100vw - 32px)',
  '--nv-global-bg': 'rgba(39, 42, 47, 0.9)',
  '--nv-global-border': 'rgba(39, 42, 47, 0.9)',
  '--nv-radius': '20px',
  '--nv-tip-width': '0',
  '--nv-icon-size': '20px',
  '--nv-spacing': '6px',
  '--nv-title-size': '16px',
  '--nv-message-size': '14px',
  '--nv-global-fg': '#fff',
  '--nv-success-accent': '#82F88E',
}
</script>

<style lang="scss" scoped>
main {
  position: relative;
  display: flex;
  padding-top: var(--tg-content-safe-area-inset-top);
  padding-bottom: var(--main-padding-bottom);
  min-height: 100vh;
}
</style>

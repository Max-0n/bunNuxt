<template lang="pug">
  component(v-if="IconComponent" :is="IconComponent")
</template>

<script setup lang="ts">
import type { Component } from 'vue'

type ComponentImport = Record<string, () => Promise<{ default: Component }>>

const props = defineProps<{ name?: string }>()

const icons = import.meta.glob('~/assets/svg/*.svg') as ComponentImport
const IconComponent = shallowRef<Component | null>(null)

watch(
  () => props.name,
  async name => {
    if (!name) {
      IconComponent.value = null
      return
    }

    const path = `/assets/svg/${name}.svg`
    const loader = icons[path]
    IconComponent.value = loader ? (await loader()).default : null
  },
  { immediate: true }
)
</script>

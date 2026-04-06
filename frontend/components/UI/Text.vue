<template lang="pug">
  component(
    :is="as"
    :class="[`color-${color}`, `text-shadow-${shadow}`, `text-transform-${transform}`, `text-weight-${weight}`, `text-size-${size}`, `text-align-${align}`]"
    :style="style"
    v-html="$t(text)"
  )
</template>

<script setup lang="ts">
type AsElement = keyof HTMLElementTagNameMap

withDefaults(
  defineProps<{
    text?: string | number
    color?: TextColor
    as?: AsElement
    shadow?: TextShadow
    transform?: TextTransform
    weight?: TextWeight
    size?: TextSize
    align?: TextAlign
    style?: string | Record<string, string> | undefined
  }>(),
  {
    color: TextColor.white,
    as: 'p',
    shadow: TextShadow.none,
    transform: TextTransform.none,
    weight: TextWeight.w700,
    size: TextSize.s14,
    style: undefined,
  }
)
</script>


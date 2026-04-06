<template lang="pug">
  button(
    :class="{ wide, round, ghost, 'with-press': !withoutPress, active, 'is-pressed': isPressed }"
    :appearance="appearance"
    :disabled="disabled || progress"
    @touchstart="handleTouchStart"
    @touchend="handleTouchEnd"
    @touchcancel="handleTouchEnd"
  )
    slot()

    template(v-if="progress")
      .progress
      UIIcon(name="progress").progress-icon.size-12
</template>

<script lang="ts" setup>
import { ref } from 'vue'

const isPressed = ref(false)

const handleTouchStart = () => {
  if (!props.disabled && !props.progress && !props.withoutPress) {
    isPressed.value = true
  }
}

const handleTouchEnd = () => {
  isPressed.value = false
}

const props = withDefaults(
  defineProps<{
    disabled?: boolean
    active?: boolean
    progress?: boolean
    wide?: boolean
    round?: boolean
    ghost?: boolean
    appearance?: ButtonAppearance
    withoutPress?: boolean
  }>(),
  {
    disabled: false,
    active: false,
    progress: false,
    wide: false,
    round: false,
    ghost: false,
    withoutPress: false,
  }
)
</script>

<style lang="scss" scoped>
button {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-white);
  background: var(--color-button-main);
  padding: 8px 16px;
  border-radius: var(--border-radius);
  border: none;
  transition: filter ease-in-out 0.3s, transform ease-in-out 0.1s;
  overflow: hidden;

  &:not(.ghost) {
    backdrop-filter: var(--button-backdrop-filter);
  }

  &[disabled] {
    filter: grayscale(0.8);
  }

  &[appearance="secondary"] {
    background: var(--color-button-secondary);
  }

  &[appearance="tertiary"] {
    background: var(--color-button-tertiary);
  }

  &[appearance="danger"] {
    background: var(--color-button-danger);
  }

  .progress {
    position: absolute;
    width: 100%;
    height: 100%;
    background: inherit;
    box-shadow: inherit;
    opacity: 0.95;

    &-icon {
      position: absolute;
    }
  }

  .prepend,
  .postend {
    display: flex;
    margin: auto 0 auto 0;
  }

  &.wide {
    width: 100%;
  }

  &.round {
    border-radius: 120px;
  }

  &.ghost {
    background: transparent;
    padding: 0;
    box-shadow: none;
  }

  &.with-press:not([disabled]):active,
  &.with-press:not([disabled]).is-pressed,
  &.active {
    filter: brightness(1.4);
    transform: scale(0.98);
  }
}
</style>

<template lang="pug">
  input.ui-range(
    type="range"
    :min="min"
    :max="max"
    :step="step"
    :value="modelValue"
    :disabled="disabled"
    @input="handleInput"
  )
</template>

<script lang="ts" setup>
const props = withDefaults(
  defineProps<{
    modelValue?: number
    min?: number
    max?: number
    step?: number
    disabled?: boolean
  }>(),
  {
    min: 0,
    max: 100,
    step: 1,
    disabled: false,
  }
)

const emit = defineEmits<{
  'update:modelValue': [value: number]
}>()

const handleInput = (event: Event) => {
  const target = event.target as HTMLInputElement
  const value = parseFloat(target.value)
  emit('update:modelValue', value)
}
</script>

<style lang="scss" scoped>
.ui-range {
  width: 100%;
  height: 8px;
  border-radius: 4px;
  background: var(--color-white-03);
  outline: none;
  -webkit-appearance: none;
  cursor: pointer;

  &::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 20px;
    height: 20px;
    border-radius: 50%;
    background: var(--color-white);
    cursor: pointer;
    transition: transform 0.2s ease;

    &:hover {
      transform: scale(1.1);
    }
  }

  &::-moz-range-thumb {
    width: 20px;
    height: 20px;
    border-radius: 50%;
    background: var(--color-white);
    cursor: pointer;
    border: none;
    transition: transform 0.2s ease;

    &:hover {
      transform: scale(1.1);
    }
  }

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;

    &::-webkit-slider-thumb {
      cursor: not-allowed;
    }

    &::-moz-range-thumb {
      cursor: not-allowed;
    }
  }
}
</style>

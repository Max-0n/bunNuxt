<template lang="pug">
  label.ui-checkbox
    input(
      ref="inputRef"
      type="checkbox"
      :checked="modelValue"
      :disabled="disabled"
      @change="handleChange"
    )
    span.ui-checkbox__box
    span.ui-checkbox__label(v-if="label") {{ label }}
</template>

<script lang="ts" setup>
const props = withDefaults(
  defineProps<{
    modelValue?: boolean
    label?: string
    disabled?: boolean
  }>(),
  {
    modelValue: false,
    disabled: false,
  }
)

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
}>()

const inputRef = ref<HTMLInputElement | null>(null)

const handleChange = () => {
  emit('update:modelValue', inputRef.value?.checked ?? false)
}
</script>

<style lang="scss" scoped>
.ui-checkbox {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  user-select: none;

  input {
    position: absolute;
    opacity: 0;
    width: 0;
    height: 0;
    pointer-events: none;
  }

  &__box {
    width: 20px;
    height: 20px;
    flex-shrink: 0;
    background: var(--color-white-03);
    border-radius: 4px;
    border: 1px solid var(--color-white-06);
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background 0.2s, border-color 0.2s;

    &::after {
      content: '';
      width: 6px;
      height: 10px;
      border: 2px solid var(--color-white);
      border-top: 0;
      border-left: 0;
      transform: rotate(45deg) translateY(-1px);
      opacity: 0;
      transition: opacity 0.2s;
    }
  }

  input:checked + &__box {
    background: var(--color-cyan);
    border-color: var(--color-cyan);

    &::after {
      opacity: 1;
    }
  }

  input:disabled + &__box {
    opacity: 0.5;
    cursor: not-allowed;
  }

  input:disabled ~ &__label {
    opacity: 0.5;
  }

  &__label {
    font-size: 12px;
    color: var(--color-white-07);
  }

  &:has(input:disabled) {
    cursor: not-allowed;
  }
}
</style>

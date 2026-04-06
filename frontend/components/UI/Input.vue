<template lang="pug">
  .ui-input(:class="{ 'ui-input--uppercase': transform === 'uppercase' }")
    label.ui-input__label(v-if="label") {{ label }}
    input(
      ref="inputRef"
      :type="type"
      :placeholder="placeholder"
      :disabled="disabled"
      :value="modelValue"
      :min="min"
      :max="max"
      :step="step"
      :inputmode="inputmode"
      @input="handleInput"
      @focus="$emit('focus', $event)"
      @blur="$emit('blur', $event)"
      @keydown="$emit('keydown', $event)"
      @keyup="$emit('keyup', $event)"
    )
</template>

<script lang="ts" setup>
import { nextTick } from 'vue'

const props = withDefaults(
  defineProps<{
    modelValue?: string | number
    label?: string
    transform?: 'uppercase' | 'lowercase' | 'capitalize' | 'none'
    type?: string
    placeholder?: string
    disabled?: boolean
    min?: string | number
    max?: string | number
    step?: string | number
    inputmode?: string
    autofocus?: boolean
  }>(),
  {
    type: 'text',
    disabled: false,
    autofocus: false,
  }
)

const emit = defineEmits<{
  'update:modelValue': [value: string]
  focus: [event: FocusEvent]
  blur: [event: FocusEvent]
  keydown: [event: KeyboardEvent]
  keyup: [event: KeyboardEvent]
}>()

const inputRef = ref<HTMLInputElement | null>(null)

const handleInput = (event: Event) => {
  const target = event.target as HTMLInputElement
  emit('update:modelValue', target.value)
}

onMounted(async () => {
  if (props.autofocus) {
    await nextTick()
    if (inputRef.value && !props.disabled) {
      inputRef.value.focus()
    }
  }
})
</script>

<style lang="scss" scoped>
.ui-input {
  width: 100%;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;

  &__label {
    font-size: 12px;
    color: var(--color-white-07);
  }

  input {
    width: 100%;
    box-sizing: border-box;
    background: var(--color-white-03);
    border-radius: var(--border-radius);
    padding: 10px 12px;
    border: none;
    outline: none;
    font-size: inherit;
    line-height: inherit;
    font-weight: inherit;
    font-family: inherit;
    color: var(--color-white);

    &::placeholder {
      color: var(--color-white-06);
    }

    &:disabled {
      cursor: not-allowed;
      opacity: 0.6;
    }
  }

  &--uppercase input {
    text-transform: uppercase;
  }
}
</style>

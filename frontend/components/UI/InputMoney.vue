<template lang="pug">
  .grow-wrapper
    span.grow-mirror(ref="mirror" aria-hidden="false")
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
import { computed, nextTick, onMounted, ref, watch } from 'vue'

const props = withDefaults(
  defineProps<{
    modelValue?: string | number
    type?: string
    placeholder?: string
    disabled?: boolean
    min?: string | number
    max?: string | number
    step?: string | number
    inputmode?: string
    autofocus?: boolean
    grow?: boolean
    numericOnly?: boolean
  }>(),
  {
    type: 'text',
    disabled: false,
    autofocus: false,
    grow: false,
    numericOnly: true,
  }
)

const emit = defineEmits<{
  'update:modelValue': [value: string]
  focus: [event: FocusEvent]
  blur: [event: FocusEvent]
  keydown: [event: KeyboardEvent]
  keyup: [event: KeyboardEvent]
}>()

const mirror = ref<HTMLElement | null>(null)
const inputRef = ref<HTMLInputElement | null>(null)

const displayValue = computed(() => {
  return props.modelValue?.toString() || ''
})

const sync = () => {
  if (!props.grow) return
  nextTick(() => {
    if (mirror.value && inputRef.value) {
      const textToMeasure = displayValue.value || props.placeholder || ' '
      mirror.value.textContent = textToMeasure
      const mirrorWidth = mirror.value.offsetWidth
      const container = inputRef.value.parentElement?.parentElement
      const maxWidth = container?.offsetWidth ?? Infinity
      const width = Math.min(Math.max(mirrorWidth, 10), maxWidth)
      inputRef.value.style.width = `${width}px`
    }
  })
}

watch(() => props.modelValue, sync)
onMounted(async () => {
  sync()
  // Автофокус на инпут при монтировании компонента, если указан prop autofocus
  if (props.autofocus) {
    await nextTick()
    if (inputRef.value && !props.disabled) {
      inputRef.value.focus()
    }
  }
})

const filterNumericInput = (value: string): string => {
  // Заменяем запятую на точку
  value = value.replace(/,/g, '.')

  // Регулярное выражение: 0 или число начинающееся с 1-9, затем опционально точка и до 8 цифр
  const match = value.match(/^(0|[1-9]\d*)(\.\d{0,8})?/)

  if (match) {
    return match[0]
  }

  if (value.startsWith('.') || value.startsWith(',')) {
    return '0.'
  }

  return ''
}

const handleInput = (event: Event) => {
  const target = event.target as HTMLInputElement
  const value = props.numericOnly ? filterNumericInput(target.value) : target.value

  if (value !== target.value) {
    target.value = value
  }

  emit('update:modelValue', value)
  if (props.grow) sync()
}
</script>

<style lang="scss" scoped>
.grow-wrapper {
  position: relative;
  display: inline-block;
  min-width: 22px;
  max-width: 100%;
  overflow: hidden;
}

input {
  text-align: right;
  min-width: 22px;
  background: transparent;
  border: none;
  outline: none;
  font-size: inherit;
  line-height: inherit;
  font-weight: inherit;
  font-family: inherit;
  color: inherit;
  position: relative;
  z-index: 2;
  padding: 0;
  margin: 0;

  &::placeholder {
    color: var(--color-grey-light);
    opacity: 0.7;
  }

  &:disabled {
    cursor: not-allowed;
    opacity: 0.6;
  }
}

.grow-mirror {
  position: absolute;
  visibility: hidden;
  white-space: pre;
  font-size: inherit;
  line-height: inherit;
  font-weight: inherit;
  font-family: inherit;
  color: inherit;
  padding: 0;
  margin: 0;
  border: none;
}
</style>

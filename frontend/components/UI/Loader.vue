<template lang="pug">
  svg(width="18" height="18" viewBox="0 0 18 18")
    circle(cx="9" cy="9" r="6")
    circle(cx="9" cy="9" r="6" :stroke-dasharray="progressLength" :stroke-dashoffset="progress" :style="circleStyle")
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

interface Props {
  min?: number
  value?: number
  max?: number
  duration?: number | string // Duration in milliseconds (ms)
}

const props = withDefaults(defineProps<Props>(), {
  min: 0,
  value: 25,
  max: 100,
})

// Текущее значение (для анимации загрузки)
const curValue = ref<number>(props.min)

// Длинна радиуса
const progressLength = 2 * Math.PI * 6

// Прогресс лоадера
const progress = computed<number>(() => {
  if (curValue.value === 0 && props.max === 0) return 37.7 // Значение, при котором круг не заполнен
  return curValue.value >= props.max ? 0 : progressLength - (curValue.value / props.max) * progressLength
})

// Прогресс лоадера
const isEnding = computed<boolean>(() => {
  return curValue.value / props.max >= 0.9
})

// Стиль для анимированного круга
const circleStyle = computed(() => ({
  transition: `stroke-dashoffset ${props.duration ? '0.1s' : '2s'} ease-in-out`,
}))

// Функция анимации от min до max (duration в миллисекундах)
const animateFromMinToMax = (duration: number) => {
  const startTime = Date.now()
  const startValue = props.min
  const endValue = props.max

  const animate = () => {
    const elapsed = Date.now() - startTime
    const progress = Math.min(elapsed / duration, 1)

    // Используем easeOut для более плавной анимации
    const easedProgress = 1 - (1 - progress) ** 3
    curValue.value = startValue + (endValue - startValue) * easedProgress

    if (progress < 1) {
      requestAnimationFrame(animate)
    }
  }

  requestAnimationFrame(animate)
}

// Запуск анимации
onMounted(() => {
  if (props.duration && Number(props.duration) > 0) {
    // Анимируем от min до max за указанное время (в миллисекундах)
    animateFromMinToMax(Number(props.duration))
  } else {
    // Обычное поведение - сразу устанавливаем value
    curValue.value = props.value
  }
})
</script>

<style lang="scss" scoped>
svg {
  backdrop-filter: blur(3px) brightness(.9) saturate(1.2);
  filter: drop-shadow(0 0 2px var(--color-black-050));
  border-radius: 100%;
}

circle {
  fill: none;
  stroke-width: 4;
  transform-origin: center center;
  transform: rotate(-90deg);

  &:first-of-type {
    stroke: var(--color-white-03);
  }

  &:nth-of-type(2) {
    stroke: var(--color-white);
  }
}
</style>

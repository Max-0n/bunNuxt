<template lang="pug">
  picture(v-if="defaultUrl" :class="{ contain: props.contain }")
    source(v-if="props.compressed" :srcset="props.compressed" type="image/webp")
    img(v-if="!isError" :src="defaultUrl" @error="onError" :alt="props.alt")
    slot(v-else name="error")
      UIIcon( name="monster")
</template>

<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    image?: string
    compressed?: string
    contain?: boolean
    alt?: string
  }>(),
  {
    contain: true,
  }
)

const defaultUrl = ref(props.image)
const isError = ref(false)

watch(
  () => props.image,
  newVal => {
    isError.value = false
    defaultUrl.value = newVal || ''
  }
)

const onError = () => {
  isError.value = true
}
</script>

<style lang="scss" scoped>
picture {
  display: block;
  -webkit-tap-highlight-color: transparent;
  user-select: none;

  img {
    display: block;
    width: 100%;
    height: 100%;
  }

  &.contain img {
    object-fit: contain;
  }
}
</style>

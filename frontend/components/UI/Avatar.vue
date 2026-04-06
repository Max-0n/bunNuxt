<template lang="pug">
  UIImage(
    v-if="image"
    :image="image"
    :contain="false"
  ).avatar
  .avatar(v-else)
    UIIcon(name="avatar").color-white
</template>

<script lang="ts" setup>
defineProps<{ image?: string }>()
</script>

<style lang="scss" scoped>
.avatar {
  flex-shrink: 0;
  border-radius: 500px;
  aspect-ratio: 1 / 1;
  min-width: 10px;
  overflow: hidden;
  color: var(--color-main);
  box-shadow: var(--box-shadow);
}
</style>

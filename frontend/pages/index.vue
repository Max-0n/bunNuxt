<template lang="pug">
.home
  p.home__greeting Привет!
</template>

<script setup lang="ts"></script>

<style lang="scss" scoped>
.home {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
}

.home__greeting {
  margin: 0;
  text-align: center;
}
</style>

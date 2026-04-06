export const useAppStore = defineStore('appStore', () => {
  const counter = ref(0)

  const increment = () => {
    counter.value += 1
  }

  return { counter, increment }
})

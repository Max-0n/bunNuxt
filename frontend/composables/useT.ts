export const $t = (key: string, params?: Record<string, unknown>): string => {
  // comment
  //@ts-expect-error
  return useNuxtApp().$i18n.t(key, params)
}

// Remove server-side import to fix Vue app aliases issue

export const translate = (key: string): string => {
  // This function should be used client-side only
  if (process.client) {
    const { $i18n } = useNuxtApp()
    return $i18n.t(key)
  }
  return key
}

export const arabicPlurals = (choice: number): number => {
  const name = new Intl.PluralRules('ar-EG').select(choice)

  return { zero: 0, one: 1, two: 2, few: 3, many: 4, other: 5 }[name]
}

export const russianPlurals = (choice: number, choicesLength: number): number => {
  if (choice === 0) {
    return 0
  }

  const teen = choice > 10 && choice < 20
  const endsWithOne = choice % 10 === 1

  if (!teen && endsWithOne) {
    return 1
  }

  if (!teen && choice % 10 >= 2 && choice % 10 <= 4) {
    return 2
  }

  return choicesLength < 4 ? 2 : 3
}

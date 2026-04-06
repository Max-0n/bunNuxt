export function toMapArrayByProp<T, K extends keyof T>(ar: T[], prop: K): Record<string, T[]> {
  const ret: Record<string, T[]> = {}
  ar.forEach((item: T) => {
    const key = String(item[prop])
    if (!ret[key]) {
      ret[key] = []
    }
    ret[key].push(item)
  })

  return ret
}

export function toMapByProp<T, K extends keyof T>(ar: T[], prop: K): Map<T[K], T> {
  const ret = new Map<T[K], T>()
  ar.forEach(item => ret.set(item[prop], item))
  return ret
}

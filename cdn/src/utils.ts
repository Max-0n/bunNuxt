// Функция для конвертации размера из байтов в человеко-читаемый формат
export function humanSize(bytes: number): string {
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB']
  if (bytes === 0) return '0 Bytes'
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  return parseFloat((bytes / 1024 ** i).toFixed(2)) + ' ' + sizes[i]
}

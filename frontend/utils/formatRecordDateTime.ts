export function formatRecordDateTime(createdAtMs: number): string {
  return new Date(createdAtMs).toLocaleString('ru-RU', {
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

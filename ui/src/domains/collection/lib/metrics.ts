import type { Assignment } from '@/domains/collection/api/collectionApi'

export function todayIso() {
  return new Date().toISOString().slice(0, 10)
}

export function formatHours(seconds: number) {
  const hours = seconds / 3600
  return `${hours.toFixed(hours >= 10 ? 0 : 1)} h`
}

export function assignmentProgressPct(item: Pick<Assignment, 'completed_seconds' | 'target_seconds'>) {
  if (item.target_seconds <= 0) return 0
  return Math.min(100, Math.round((item.completed_seconds / item.target_seconds) * 100))
}

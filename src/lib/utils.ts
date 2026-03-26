import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { formatDistanceToNow } from 'date-fns'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function timeAgo(dateStr: string): string {
  return formatDistanceToNow(new Date(dateStr), { addSuffix: true })
}

export function formatPhone(phone: string): string {
  return phone.replace(/(\d{3})(\d{3})(\d{4})/, '($1) $2-$3')
}

export function generateRequestId(): string {
  return `BC-${Date.now().toString(36).toUpperCase()}`
}

export function getUrgencyLabel(urgency: string): string {
  return {
    emergency: '🔴 EMERGENCY',
    priority: '🟡 PRIORITY',
    normal: '🟢 Normal',
  }[urgency] ?? urgency
}

export function pluralize(n: number, singular: string, plural?: string) {
  return n === 1 ? `${n} ${singular}` : `${n} ${plural ?? singular + 's'}`
}

// Safe JSON parse
export function safeJson<T>(str: string, fallback: T): T {
  try {
    return JSON.parse(str) as T
  } catch {
    return fallback
  }
}

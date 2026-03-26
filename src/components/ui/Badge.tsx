'use client'
import { cn } from '@/lib/utils'
import { BloodGroup, RequestStatus, STATUS_LABELS, URGENCY_COLORS } from '@/types'

const BLOOD_GROUP_COLORS: Record<BloodGroup, string> = {
  'A+':  'bg-trust-100 text-trust-700 border-trust-200',
  'A-':  'bg-care-50 text-trust-700 border-trust-100',
  'B+':  'bg-trust-100 text-trust-700 border-trust-200',
  'B-':  'bg-care-50 text-trust-700 border-trust-100',
  'AB+': 'bg-trust-100 text-trust-700 border-trust-200',
  'AB-': 'bg-care-50 text-trust-700 border-trust-100',
  'O+':  'bg-care-100 text-trust-700 border-care-300',
  'O-':  'bg-care-50 text-trust-700 border-care-200',
}

interface BloodGroupBadgeProps {
  group: BloodGroup
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

export function BloodGroupBadge({ group, size = 'md', className }: BloodGroupBadgeProps) {
  const sizes = {
    sm: 'text-xs px-2 py-0.5 font-bold',
    md: 'text-sm px-3 py-1 font-bold',
    lg: 'text-lg px-4 py-1.5 font-extrabold',
  }
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-lg border',
        BLOOD_GROUP_COLORS[group],
        sizes[size],
        className
      )}
    >
      {group}
    </span>
  )
}

const STATUS_STYLE: Record<RequestStatus, string> = {
  pending:    'bg-trust-50 text-trust-700 border-trust-200',
  matched:    'bg-trust-100 text-trust-800 border-trust-200',
  accepted:   'bg-trust-100 text-trust-800 border-trust-200',
  in_transit: 'bg-trust-100 text-trust-800 border-trust-200 animate-pulse',
  arrived:    'bg-emerald-50 text-emerald-700 border-emerald-200',
  completed:  'bg-gray-100 text-gray-700 border-gray-200',
  cancelled:  'bg-orange-50 text-orange-600 border-orange-100',
}

export function StatusBadge({ status }: { status: RequestStatus }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full border',
        STATUS_STYLE[status]
      )}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-current opacity-70 inline-block" />
      {STATUS_LABELS[status]}
    </span>
  )
}

export function UrgencyBadge({ urgency }: { urgency: 'emergency' | 'priority' | 'normal' }) {
  const labels = {
    emergency: '🔴 EMERGENCY',
    priority: '🟡 PRIORITY',
    normal: '🟢 Normal',
  }
  const styles = {
    emergency: 'bg-red-600 text-white',
    priority: 'bg-amber-500 text-white',
    normal: 'bg-green-100 text-green-800',
  }
  return (
    <span
      className={cn(
        'inline-flex items-center text-xs font-bold px-2.5 py-1 rounded-full',
        styles[urgency]
      )}
    >
      {labels[urgency]}
    </span>
  )
}

export function TrustScoreBadge({ score }: { score: number }) {
  const color =
    score >= 80
      ? 'text-score-high'
      : score >= 50
      ? 'text-score-medium'
      : 'text-score-low'
  return (
    <span className={cn('inline-flex items-center text-xs font-semibold', color)}>
      ★ {score}
    </span>
  )
}

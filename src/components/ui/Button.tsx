'use client'
import React from 'react'
import { cn } from '@/lib/utils'
import { motion } from 'framer-motion'

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline' | 'emergency'
  size?: 'sm' | 'md' | 'lg' | 'xl'
  loading?: boolean
  fullWidth?: boolean
  icon?: React.ReactNode
}

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  fullWidth = false,
  icon,
  children,
  className,
  disabled,
  onClick,
  ...props
}: ButtonProps) {
  const base =
    'relative inline-flex items-center justify-center gap-2 font-semibold rounded-xl transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 select-none cursor-pointer overflow-visible'

  const variants = {
    primary:
      'bg-red-600 hover:bg-red-700 active:bg-red-800 text-white shadow-blood focus:ring-red-400',
    secondary:
      'bg-amber-50 hover:bg-amber-100 text-red-800 border-2 border-amber-200 hover:border-red-300 focus:ring-amber-300',
    ghost:
      'bg-transparent hover:bg-amber-50 text-red-700 focus:ring-amber-200',
    danger:
      'bg-blood-700 hover:bg-blood-800 text-white shadow-blood focus:ring-blood-500',
    outline:
      'bg-white border-2 border-amber-300 hover:border-red-300 text-red-700 hover:text-red-800 focus:ring-amber-200',
    emergency:
      'bg-gradient-to-r from-red-700 via-red-600 to-amber-500 hover:from-red-800 hover:via-red-700 hover:to-amber-600 text-white shadow-blood focus:ring-red-400',
  }

  const sizes = {
    sm: 'px-3 py-1.5 text-sm',
    md: 'px-5 py-2.5 text-sm',
    lg: 'px-6 py-3 text-base',
    xl: 'px-8 py-4 text-lg',
  }

  const handleClick: React.MouseEventHandler<HTMLButtonElement> = (event) => {
    onClick?.(event)
  }

  return (
    <motion.button
      whileTap={{ scale: disabled || loading ? 1 : 0.97 }}
      onClick={handleClick}
      className={cn(
        base,
        variants[variant],
        sizes[size],
        fullWidth && 'w-full',
        (disabled || loading) && 'opacity-60 pointer-events-none',
        className
      )}
      disabled={disabled || loading}
      {...(props as any)}
    >
      {loading ? (
        <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
        </svg>
      ) : (
        icon
      )}
      {children}
    </motion.button>
  )
}

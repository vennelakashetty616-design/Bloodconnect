'use client'
import Link from 'next/link'
import { CheckCircle } from 'lucide-react'
import { Button } from '@/components/ui/Button'

export default function ConfirmedPage() {
  return (
    <div className="text-center py-4">
      <div className="w-16 h-16 bg-trust-100 rounded-full flex items-center justify-center mx-auto mb-4">
        <CheckCircle size={36} className="text-trust-700" />
      </div>

      <h2 className="text-xl font-black text-gray-900 mb-2">Email Confirmed!</h2>
      <p className="text-sm text-gray-600 mb-6">
        Your account is verified and ready. Sign in to complete your basic profile and start saving lives.
      </p>

      <Link href="/auth/login">
        <Button variant="primary" fullWidth size="lg">
          Sign In and Continue
        </Button>
      </Link>

      <p className="text-xs text-gray-400 mt-5">
        You will be taken to your dashboard after signing in.
      </p>
    </div>
  )
}

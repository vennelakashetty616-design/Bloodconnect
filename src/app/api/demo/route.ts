import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  // Set demo cookie without redirecting (client will handle redirect)
  const response = NextResponse.json({ success: true })
  response.cookies.set('demo_mode', 'true', {
    path: '/',
    maxAge: 60 * 60 * 24 * 7, // 7 days
    sameSite: 'lax',
    secure: false,
  })
  return response
}

import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { Toaster } from 'react-hot-toast'

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' })

export const metadata: Metadata = {
  title: 'Save Lives',
  description: 'Emergency peer-to-peer blood donor matching platform. Connect with the closest available blood donors in minutes.',
  keywords: 'blood donation, emergency, blood donor, blood bank, life saving',
  authors: [{ name: 'Care Team' }],
  manifest: '/manifest.json',
  icons: {
    icon: '/favicon.png',
    apple: '/apple-icon.png',
  },
  openGraph: {
    title: 'Save Lives',
    description: 'Find the closest blood donors in an emergency, in minutes.',
    type: 'website',
  },
}

export const viewport: Viewport = {
  themeColor: '#B11226',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="font-sans bg-neutral-offwhite text-gray-900 antialiased min-h-screen">
        <div className="global-side-rails" aria-hidden="true">
          <span className="rail rail-left" />
          <span className="rail rail-right" />
          <span className="orb orb-left" />
          <span className="orb orb-right" />
        </div>
        {children}
        <Toaster
          position="top-center"
          toastOptions={{
            duration: 4000,
            style: {
              borderRadius: '12px',
              fontFamily: 'var(--font-inter)',
              fontSize: '14px',
            },
            success: {
              style: { background: '#B11226', color: '#ffffff', border: '1px solid #C62828' },
            },
            error: {
              style: { background: '#B11226', color: '#ffffff', border: '1px solid #C62828' },
            },
          }}
        />
      </body>
    </html>
  )
}

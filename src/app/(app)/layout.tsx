import { BottomNav } from '@/components/layout/Navigation'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#fff8ee_0%,#fff4dd_45%,#fff2f3_100%)] pb-24 max-w-lg mx-auto relative">
      {children}
      <BottomNav />
    </div>
  )
}

'use client'
import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Bell, CheckCheck } from 'lucide-react'
import { TopBar } from '@/components/layout/Navigation'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { getSupabaseClient } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/useAuth'
import { useAppStore } from '@/store/appStore'
import { Notification } from '@/types'
import { timeAgo } from '@/lib/utils'

const TYPE_ICONS: Record<string, string> = {
  blood_request: '🩸',
  donor_accepted: '🦸',
  in_transit: '🚗',
  arrived: '🏥',
  completed: '💖',
  emergency: '🚑',
}

const DEMO_NOTIFICATIONS: Notification[] = [
  {
    id: 'demo-notif-1',
    user_id: 'demo-test',
    type: 'blood_request',
    title: 'O+ Blood Needed Urgently',
    body: 'City Care Hospital needs O+ donor. 2 units required for trauma patient. Respond now to save a life.',
    related_request_id: 'demo-1',
    is_read: false,
    created_at: '2026-03-13T14:32:00.000Z',
    updated_at: '2026-03-13T14:32:00.000Z',
  },
  {
    id: 'demo-notif-2',
    user_id: 'demo-test',
    type: 'donor_accepted',
    title: 'Your Donation Request Accepted',
    body: 'A verified donor has accepted your blood request for A- at Sunrise Multispeciality.',
    related_request_id: 'demo-2',
    is_read: false,
    created_at: '2026-03-13T13:15:00.000Z',
    updated_at: '2026-03-13T13:15:00.000Z',
  },
  {
    id: 'demo-notif-3',
    user_id: 'demo-test',
    type: 'in_transit',
    title: 'Donor is on the Way',
    body: 'Your verified donor is now on transit to St. Mercy General. ETA: 12 minutes.',
    related_request_id: 'demo-3',
    is_read: true,
    created_at: '2026-03-13T12:45:00.000Z',
    updated_at: '2026-03-13T12:45:00.000Z',
  },
  {
    id: 'demo-notif-4',
    user_id: 'demo-test',
    type: 'arrived',
    title: 'Donor Arrived at Hospital',
    body: 'The verified donor has arrived at the collection center. Collection will begin shortly.',
    related_request_id: 'demo-1',
    is_read: true,
    created_at: '2026-03-12T18:30:00.000Z',
    updated_at: '2026-03-12T18:30:00.000Z',
  },
  {
    id: 'demo-notif-5',
    user_id: 'demo-test',
    type: 'completed',
    title: 'Blood Donation Completed',
    body: 'Thank you for donating! Your contribution has helped save a life. Rest well and hydrate.',
    related_request_id: 'demo-2',
    is_read: true,
    created_at: '2026-03-11T16:20:00.000Z',
    updated_at: '2026-03-11T16:20:00.000Z',
  },
]

export default function NotificationsPage() {
  const { user } = useAuth()
  const { setUnreadCount } = useAppStore()
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [loading, setLoading] = useState(true)

  async function fetchNotifications() {
    if (!user) return
    const supabase = getSupabaseClient()
    const { data } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(50)
    
    // Show demo notifications if no real data
    const notifs = (data as Notification[]) ?? DEMO_NOTIFICATIONS
    setNotifications(notifs)
    setUnreadCount(0)
    setLoading(false)
  }

  async function markAllRead() {
    if (!user) return
    const supabase = getSupabaseClient()
    await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('user_id', user.id)
      .eq('is_read', false)
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })))
  }

  useEffect(() => {
    fetchNotifications()
  }, [user])

  return (
    <>
      <TopBar
        title="Notifications"
        right={
          <Button variant="ghost" size="sm" onClick={markAllRead} icon={<CheckCheck size={16} />}>
            Mark all read
          </Button>
        }
      />

      <div className="px-4 py-4 space-y-3">
        {loading ? (
          <div className="flex justify-center py-12">
            <Bell className="text-gray-300 animate-pulse" size={40} />
          </div>
        ) : notifications.length === 0 ? (
          <div className="flex flex-col items-center py-16 gap-3">
            <div className="w-16 h-16 bg-neutral-offwhite rounded-full flex items-center justify-center">
              <Bell className="text-gray-300" size={28} />
            </div>
            <p className="text-gray-500 font-semibold">No notifications yet</p>
            <p className="text-gray-400 text-sm text-center">
              You&apos;ll be notified when someone needs your blood type nearby.
            </p>
          </div>
        ) : (
          <AnimatePresence>
            {notifications.map((n, i) => (
              <motion.div
                key={n.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.03 }}
              >
                <Card className={`p-4 ${!n.is_read ? 'border-care-200 bg-care-50/30' : ''}`}>
                  <div className="flex items-start gap-3">
                    <span className="text-2xl">{TYPE_ICONS[n.type] ?? '🔔'}</span>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-bold text-gray-900 ${!n.is_read ? 'text-blood-900' : ''}`}>
                        {n.title}
                      </p>
                      <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{n.body}</p>
                      <p className="text-xs text-gray-400 mt-1">{timeAgo(n.created_at)}</p>
                    </div>
                    {!n.is_read && (
                      <span className="w-2.5 h-2.5 bg-care-500 rounded-full shrink-0 mt-1" />
                    )}
                  </div>
                </Card>
              </motion.div>
            ))}
          </AnimatePresence>
        )}
      </div>
    </>
  )
}

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { Profile, Donor, BloodRequest, TrackingState } from '@/types'

interface AppStore {
  // Auth
  user: Profile | null
  donor: Donor | null
  setUser: (user: Profile | null) => void
  setDonor: (donor: Donor | null) => void

  // Active request (requester view)
  activeRequest: BloodRequest | null
  setActiveRequest: (req: BloodRequest | null) => void

  // Tracking
  trackingState: TrackingState | null
  setTrackingState: (state: TrackingState | null) => void

  // Donor current location
  myLocation: { lat: number; lng: number } | null
  setMyLocation: (loc: { lat: number; lng: number } | null) => void

  // UI
  isOnline: boolean
  setIsOnline: (v: boolean) => void

  // Notifications badge
  unreadCount: number
  setUnreadCount: (n: number) => void

  // Reset
  reset: () => void
}

export const useAppStore = create<AppStore>()(
  persist(
    (set) => ({
      user: null,
      donor: null,
      setUser: (user) => set({ user }),
      setDonor: (donor) => set({ donor }),

      activeRequest: null,
      setActiveRequest: (req) => set({ activeRequest: req }),

      trackingState: null,
      setTrackingState: (state) => set({ trackingState: state }),

      myLocation: null,
      setMyLocation: (loc) => set({ myLocation: loc }),

      isOnline: true,
      setIsOnline: (v) => set({ isOnline: v }),

      unreadCount: 0,
      setUnreadCount: (n) => set({ unreadCount: n }),

      reset: () =>
        set({
          user: null,
          donor: null,
          activeRequest: null,
          trackingState: null,
          myLocation: null,
          unreadCount: 0,
        }),
    }),
    {
      name: 'fuellife-store',
      partialize: (state) => ({
        user: state.user,
        donor: state.donor,
      }),
    }
  )
)

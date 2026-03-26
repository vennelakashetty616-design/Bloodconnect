export function AppLoadingScreen() {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[linear-gradient(180deg,rgba(255,248,238,0.95)_0%,rgba(255,242,218,0.95)_100%)] backdrop-blur-[1px]">
      <div className="relative flex w-full max-w-xs flex-col items-center px-6">
        <div className="relative mb-5 flex h-20 w-20 items-center justify-center">
          <span className="loader-heartbeat-ring" />
          <span className="loader-heartbeat-ring loader-heartbeat-ring-delay" />

          <svg
            className="loader-blood-drop"
            viewBox="0 0 48 64"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
          >
            <path
              d="M24 2C24 2 6 24.8 6 38C6 52.36 14.06 62 24 62C33.94 62 42 52.36 42 38C42 24.8 24 2 24 2Z"
              fill="url(#dropGradient)"
            />
            <path
              d="M24 10C24 10 11.6 28.42 11.6 38.14C11.6 48.44 17.13 56.2 24 56.2C30.87 56.2 36.4 48.44 36.4 38.14C36.4 28.42 24 10 24 10Z"
              fill="rgba(255,255,255,0.16)"
            />
            <defs>
              <linearGradient id="dropGradient" x1="24" y1="2" x2="24" y2="62" gradientUnits="userSpaceOnUse">
                <stop stopColor="#D62D43" />
                <stop offset="1" stopColor="#B11226" />
              </linearGradient>
            </defs>
          </svg>

          <svg
            className="loader-pulse-line"
            viewBox="0 0 120 28"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
          >
            <path
              d="M2 14H27L35 5L45 23L55 9L63 14H118"
              stroke="#9A6117"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>

        <p className="text-center text-sm font-semibold tracking-wide text-red-700">Coordinating life-saving network...</p>
        <p className="mt-1 text-center text-xs text-amber-700/90">Please wait while we prepare your dashboard.</p>
      </div>
    </div>
  )
}

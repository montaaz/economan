export function Logo({ compact }: { compact?: boolean }) {
  return (
    <span className="flex items-center gap-2.5">
      <span className="relative grid size-9 shrink-0 place-items-center">
        <svg viewBox="0 0 40 40" className="size-9" aria-hidden="true">
          <defs>
            <linearGradient id="ec-glass" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#ffffff" stopOpacity="0.96" />
              <stop offset="42%" stopColor="#bcdcff" stopOpacity="0.82" />
              <stop offset="100%" stopColor="#3f8ae4" stopOpacity="0.94" />
            </linearGradient>
            <linearGradient id="ec-shine" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#ffffff" stopOpacity="0.95" />
              <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
            </linearGradient>
          </defs>
          <rect x="7" y="20.5" width="26" height="12" rx="3.2" fill="url(#ec-glass)" stroke="#ffffff" strokeOpacity="0.85" />
          <rect x="10" y="12" width="20" height="10.5" rx="3" fill="url(#ec-glass)" fillOpacity="0.9" stroke="#ffffff" strokeOpacity="0.8" />
          <rect x="13.5" y="5" width="13" height="9" rx="2.6" fill="url(#ec-glass)" fillOpacity="0.82" stroke="#ffffff" strokeOpacity="0.75" />
          <rect x="9.4" y="21.6" width="21.2" height="2.6" rx="1.3" fill="url(#ec-shine)" />
        </svg>
      </span>
      {!compact ? (
        <span className="min-w-0">
          <span className="block text-[0.98rem] font-bold leading-tight tracking-tight text-fg">Economan</span>
          <span className="block text-[0.68rem] leading-tight tracking-wide text-fg-subtle">
            Commandes par département
          </span>
        </span>
      ) : (
        <span className="text-[0.95rem] font-bold tracking-tight text-fg">Economan</span>
      )}
    </span>
  )
}

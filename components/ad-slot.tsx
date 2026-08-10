"use client"

import { useEffect, useRef } from "react"

const ADSENSE_CLIENT = process.env.NEXT_PUBLIC_ADSENSE_CLIENT

type AdSlotProps = {
  /** AdSense ad unit slot id (data-ad-slot). */
  slot?: string
  /** Short label shown above the ad for transparency. */
  label?: string
}

/**
 * A tasteful, non-intrusive ad slot.
 * - If NEXT_PUBLIC_ADSENSE_CLIENT (and a slot id) are set, renders a real
 *   Google AdSense unit.
 * - Otherwise renders a calm placeholder so the layout never breaks before
 *   AdSense approval.
 */
export function AdSlot({ slot, label = "スポンサー" }: AdSlotProps) {
  const ref = useRef<HTMLModElement>(null)
  const pushed = useRef(false)
  const isLive = Boolean(ADSENSE_CLIENT && slot)

  useEffect(() => {
    if (!isLive || pushed.current) return
    try {
      // @ts-expect-error adsbygoogle is injected by the AdSense script
      ;(window.adsbygoogle = window.adsbygoogle || []).push({})
      pushed.current = true
    } catch {
      // no-op: AdSense not ready yet
    }
  }, [isLive])

  return (
    <div className="my-4 overflow-hidden rounded-3xl border border-dashed border-border bg-card/60 px-4 py-3">
      <p className="mb-2 text-center text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>

      {isLive ? (
        <ins
          ref={ref}
          className="adsbygoogle block"
          style={{ display: "block" }}
          data-ad-client={ADSENSE_CLIENT}
          data-ad-slot={slot}
          data-ad-format="auto"
          data-full-width-responsive="true"
        />
      ) : (
        <div className="flex min-h-[90px] items-center justify-center rounded-2xl bg-secondary/50 px-4 py-6 text-center">
          <p className="text-sm text-muted-foreground">
            広告スペース
            <span className="mt-1 block text-xs">
              {"ここに広告が表示されます"}
            </span>
          </p>
        </div>
      )}
    </div>
  )
}

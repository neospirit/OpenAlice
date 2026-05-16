import { Landmark } from 'lucide-react'
import { useWorkspace } from '../tabs/store'
import { getFocusedTab } from '../tabs/types'
import { SidebarRow } from './SidebarRow'

/**
 * Trading Accounts (Beta) sidebar.
 *
 * Trading account configuration was previously a sub-item under the
 * Settings sidebar. Promoted to a top-level Beta entry because the
 * cross-broker unification work is in active rearchitecture and the
 * lifecycle stage warrants visibility at the ActivityBar level.
 *
 * Sidebar opens the existing `settings/trading` page (no new ViewSpec).
 * The Beta-section description is rendered once at the ActivityBar
 * section header — we don't duplicate it inside the sidebar itself.
 */
export function TradingAccountsBetaSidebar() {
  const focused = useWorkspace((state) => getFocusedTab(state)?.spec)
  // Also light up when a `uta-detail` tab is focused — that's the
  // sibling view that gets opened from inside the TradingPage.
  const isActive =
    (focused?.kind === 'settings' && focused.params.category === 'trading')
    || focused?.kind === 'uta-detail'
  const openOrFocus = useWorkspace((state) => state.openOrFocus)

  return (
    <div className="flex flex-col h-full">
      <div className="py-0.5">
        <SidebarRow
          label={
            <span className="flex items-center gap-2">
              <Landmark size={14} strokeWidth={1.8} className="shrink-0" />
              <span>Trading Accounts</span>
            </span>
          }
          active={isActive}
          onClick={() =>
            openOrFocus({ kind: 'settings', params: { category: 'trading' } })
          }
        />
      </div>
    </div>
  )
}

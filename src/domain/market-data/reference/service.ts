/**
 * Reference-data service — in-process implementation of the reference
 * contract (see types.ts). Aggregates the opentypebb SDK clients into
 * board-shaped payloads with the explicit meta envelope.
 */

import type { DerivativesClientLike, EconomyClientLike, EquityClientLike, IndexClientLike } from '../client/types.js'
import type { CalendarBoard, MacroBoard, MoversBoard, ReferenceDataService } from './types.js'
import { fetchMacroBoard } from './macro.js'
import { fetchTermStructure, type TermStructureBoard } from './term-structure.js'
import { fetchValuationStrip, type ValuationStrip } from './valuation.js'
import { fetchGlobalMacro, type GlobalMacroBoard } from './global-macro.js'
import { fetchShipping, type ShippingBoard } from './shipping.js'
import { fetchFedBoard, type FedBoard } from './fed.js'
import { cachedBoard } from './cache.js'

export interface ReferenceDataDeps {
  equityClient: EquityClientLike
  economyClient: EconomyClientLike
  /** Only on the typebb-sdk backend — the openbb-api client set has no
   *  derivatives twin. Term structure fails loud without it. */
  derivativesClient?: DerivativesClientLike
  /** Only on the typebb-sdk backend (no openbb-api twin). */
  indexClient?: IndexClientLike
  /** Configured default equity provider — the meta label. On the SDK backend
   *  the client routes by its constructed default, so the label is the
   *  REQUESTED provider (same caveat as the bar layer's vendor meta). */
  equityProvider: string
}

/** Rows per movers list — enough for a board, small enough to stay snappy. */
const MOVERS_LIMIT = 25

/** Default forward window for the calendar board (days). */
const CALENDAR_DAYS = 14

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10)
}

/** Cache TTLs per board — matched to upstream cadence, not UI refresh.
 *  OECD/multpl/PortWatch publish weekly-to-quarterly; intraday surfaces
 *  stay short so the boards keep feeling live. */
const TTL = {
  movers: 60_000,            // intraday lists
  termStructure: 120_000,    // live-ish crypto curve
  calendar: 30 * 60_000,
  macro: 30 * 60_000,
  fed: 60 * 60_000,
  valuation: 6 * 60 * 60_000,   // multpl updates ~daily
  globalMacro: 6 * 60 * 60_000, // OECD updates monthly/quarterly + tiny quota
  shipping: 6 * 60 * 60_000,    // PortWatch updates weekly
} as const

export function createReferenceData(deps: ReferenceDataDeps): ReferenceDataService {
  const movers = cachedBoard(TTL.movers, async (): Promise<MoversBoard> => {
    // One list failing must not kill the board — same resilience rule as
    // the federated search fan-out.
    const [gainers, losers, active, uvGrowth, gTech, smallCaps, uvLarge] = await Promise.allSettled([
      deps.equityClient.getGainers(),
      deps.equityClient.getLosers(),
      deps.equityClient.getActive(),
      deps.equityClient.getUndervaluedGrowth(),
      deps.equityClient.getGrowthTech(),
      deps.equityClient.getAggressiveSmallCaps(),
      deps.equityClient.getUndervaluedLargeCaps(),
    ])
    const rows = (r: PromiseSettledResult<MoversBoard['gainers']>) =>
      r.status === 'fulfilled' ? r.value.slice(0, MOVERS_LIMIT) : []
    return {
      gainers: rows(gainers),
      losers: rows(losers),
      active: rows(active),
      undervaluedGrowth: rows(uvGrowth),
      growthTech: rows(gTech),
      smallCaps: rows(smallCaps),
      undervaluedLarge: rows(uvLarge),
      meta: { provider: deps.equityProvider, asOf: new Date().toISOString() },
    }
  })

  const calendarCached = cachedBoard(TTL.calendar, async (): Promise<CalendarBoard> => {
    const days = CALENDAR_DAYS
    const start = new Date()
    const end = new Date(start.getTime() + days * 24 * 60 * 60 * 1000)
    const window = { start: isoDay(start), end: isoDay(end) }
    // Calendars are FMP-only in the provider catalog — explicit, same as
    // the equityGetEarningsCalendar tool.
    const params = { provider: 'fmp', start_date: window.start, end_date: window.end }
    const [earnings, ipos, dividends] = await Promise.allSettled([
      deps.equityClient.getCalendarEarnings(params),
      deps.equityClient.getCalendarIpo(params),
      deps.equityClient.getCalendarDividend(params),
    ])
    // All three down = the key is missing/invalid — fail loud with the
    // upstream message instead of rendering a silently empty board.
    if (earnings.status === 'rejected' && ipos.status === 'rejected' && dividends.status === 'rejected') {
      throw earnings.reason instanceof Error
        ? earnings.reason
        : new Error(String(earnings.reason))
    }
    const rows = <T>(r: PromiseSettledResult<T[]>) => (r.status === 'fulfilled' ? r.value : [])
    // Partial failures stay loud too: a suspended/limited FMP tier can
    // reject one endpoint while siblings return 200 — annotate per list.
    const errors: NonNullable<CalendarBoard['errors']> = {}
    const note = (key: keyof NonNullable<CalendarBoard['errors']>, r: PromiseSettledResult<unknown>) => {
      if (r.status === 'rejected') {
        errors[key] = r.reason instanceof Error ? r.reason.message : String(r.reason)
      }
    }
    note('earnings', earnings)
    note('ipos', ipos)
    note('dividends', dividends)
    return {
      earnings: rows(earnings),
      ipos: rows(ipos),
      dividends: rows(dividends),
      window,
      ...(Object.keys(errors).length ? { errors } : {}),
      meta: { provider: 'fmp', asOf: new Date().toISOString() },
    }
  })

  const macro = cachedBoard(TTL.macro, () => fetchMacroBoard(deps.economyClient))
  const globalMacro = cachedBoard(TTL.globalMacro, () => fetchGlobalMacro(deps.economyClient))
  const shipping = cachedBoard(TTL.shipping, () => fetchShipping(deps.economyClient))
  const fed = cachedBoard(TTL.fed, () => fetchFedBoard(deps.economyClient))

  const termStructure = cachedBoard(TTL.termStructure, () => {
    if (!deps.derivativesClient) {
      return Promise.reject(new Error('Term structure requires the typebb-sdk market-data backend (derivatives client unavailable).'))
    }
    return fetchTermStructure(deps.derivativesClient)
  })

  const valuation = cachedBoard(TTL.valuation, () => {
    if (!deps.indexClient) {
      return Promise.reject(new Error('Valuation strip requires the typebb-sdk market-data backend (index client unavailable).'))
    }
    return fetchValuationStrip(deps.indexClient)
  })

  return {
    movers,
    // calendar(opts) with a custom window bypasses the cache (rare, AI-only
    // path through the route's ?days=); the default window is cached.
    async calendar(opts): Promise<CalendarBoard> {
      if (opts?.days && opts.days !== CALENDAR_DAYS) return uncachedCalendar(deps, opts.days)
      return calendarCached()
    },
    macro,
    termStructure,
    valuation,
    globalMacro,
    shipping,
    fed,
  }
}

async function uncachedCalendar(deps: ReferenceDataDeps, days: number): Promise<CalendarBoard> {
  const start = new Date()
  const end = new Date(start.getTime() + days * 24 * 60 * 60 * 1000)
  const window = { start: isoDay(start), end: isoDay(end) }
  const params = { provider: 'fmp', start_date: window.start, end_date: window.end }
  const [earnings, ipos, dividends] = await Promise.allSettled([
    deps.equityClient.getCalendarEarnings(params),
    deps.equityClient.getCalendarIpo(params),
    deps.equityClient.getCalendarDividend(params),
  ])
  if (earnings.status === 'rejected' && ipos.status === 'rejected' && dividends.status === 'rejected') {
    throw earnings.reason instanceof Error ? earnings.reason : new Error(String(earnings.reason))
  }
  const rows = <T>(r: PromiseSettledResult<T[]>) => (r.status === 'fulfilled' ? r.value : [])
  const errors: NonNullable<CalendarBoard['errors']> = {}
  const note = (key: keyof NonNullable<CalendarBoard['errors']>, r: PromiseSettledResult<unknown>) => {
    if (r.status === 'rejected') errors[key] = r.reason instanceof Error ? r.reason.message : String(r.reason)
  }
  note('earnings', earnings)
  note('ipos', ipos)
  note('dividends', dividends)
  return {
    earnings: rows(earnings),
    ipos: rows(ipos),
    dividends: rows(dividends),
    window,
    ...(Object.keys(errors).length ? { errors } : {}),
    meta: { provider: 'fmp', asOf: new Date().toISOString() },
  }
}

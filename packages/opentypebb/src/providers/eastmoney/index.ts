/**
 * Eastmoney (东方财富) Provider.
 *
 * Source: https://www.eastmoney.com/ — free, no API key (public web endpoints).
 * Opt-in incremental vendor for CN A-shares: Chinese-name search + 前复权 K-line,
 * the特质化 depth yfinance can't give. Self-consistent secid namespace.
 */

import { Provider } from '../../core/provider/abstract/provider.js'
import { EastmoneyEquitySearchFetcher } from './models/equity-search.js'
import { EastmoneyEquityHistoricalFetcher } from './models/equity-historical.js'

export const eastmoneyProvider = new Provider({
  name: 'eastmoney',
  description: 'Eastmoney 东方财富 — CN A-share quotes (Chinese-name search + 前复权 K-line).',
  website: 'https://www.eastmoney.com/',
  fetcherDict: {
    EquitySearch: EastmoneyEquitySearchFetcher,
    EquityHistorical: EastmoneyEquityHistoricalFetcher,
  },
})

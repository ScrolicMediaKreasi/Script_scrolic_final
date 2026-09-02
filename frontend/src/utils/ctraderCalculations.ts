/**
 * cTrader Open API Dynamic Financial Calculations Engine
 * Conforms strictly to Spotware cTrader Open API Protobuf specifications:
 * - ProtoOASymbol: https://help.ctrader.com/open-api/
 *
 * Core Protobuf Fields Used:
 * - ProtoOASymbol.digits: int32 (number of price digits displayed)
 * - ProtoOASymbol.pipPosition: int32 (pip position index on digits; pipSize = 10^-pipPosition)
 * - ProtoOASymbol.lotSize: int64 (contract size / units per standard lot in cents or base units)
 * - ProtoOASymbol.minVolume: int64 (minimum order volume in cents)
 * - ProtoOASymbol.maxVolume: int64 (maximum order volume in cents)
 * - ProtoOASymbol.stepVolume: int64 (volume step in cents)
 * - ProtoOASymbol.measurementUnits: string (e.g. 'oz', 'BTC', 'EUR', 'USD', 'Units')
 * - ProtoOASymbol.tickSize: double (minimum price movement = 10^-digits or explicit tickSize)
 * - ProtoOASymbol.pipValue: double (derived value of 1 pip for 1.00 lot in account currency)
 */

export interface ProtoOASymbol {
  symbolId: number | string;
  symbolName: string;
  digits: number; // e.g. 2 for XAUUSD/BTCUSD, 5 for EURUSD, 3 for USDJPY
  pipPosition: number; // e.g. 1 for XAUUSD ($0.10), 0 for BTCUSD ($1.00), 4 for EURUSD (0.00010), 2 for USDJPY (0.010)
  lotSize?: number; // In base units (e.g., 100 for Gold, 1 for BTC, 100,000 for Forex) or cents
  minVolume?: number; // In cents (e.g. 1,000 cents = 0.01 lot)
  maxVolume?: number; // In cents
  stepVolume?: number; // In cents (e.g. 1,000 cents = 0.01 lot step)
  measurementUnits?: string; // 'oz', 'BTC', 'EUR', 'Units', etc.
  baseAsset?: string;
  quoteAsset?: string;
  tickSize?: number; // 10^-digits
  pipValue?: number; // Cash value of 1 pip per 1 standard lot
  description?: string;
  assetClass?: 'FOREX' | 'METALS' | 'CRYPTO' | 'INDICES' | 'COMMODITIES';
}

/**
 * In-memory dynamic cache for ProtoOASymbol received from cTrader Open API
 * (e.g. ProtoOASymbolListRes, ProtoOASymbolByIdRes, or /api/ctrader/symbols)
 */
const PROTO_SYMBOL_REGISTRY = new Map<string, ProtoOASymbol>();

/**
 * Standard baseline symbols provided as default cache entries
 * These will be dynamically augmented/overridden by any live ProtoOASymbol from cTrader Open API
 */
export const DEFAULT_PROTO_SYMBOLS: Record<string, ProtoOASymbol> = {
  XAUUSD: {
    symbolId: 1,
    symbolName: 'XAUUSD',
    digits: 2,
    pipPosition: 1, // 10^-1 = 0.10 ($0.10 price delta = 1 pip)
    lotSize: 100, // 100 Troy Ounces per standard lot
    minVolume: 100000, // 0.01 lot * 100 oz * 100 cents = 100,000 cents
    maxVolume: 1000000000, // 100 lots
    stepVolume: 100000, // 0.01 lot step
    measurementUnits: 'oz',
    baseAsset: 'XAU',
    quoteAsset: 'USD',
    tickSize: 0.01,
    assetClass: 'METALS',
    description: 'Gold vs US Dollar (1 Lot = 100 oz, Pip = 0.10)'
  },
  GOLD: {
    symbolId: 1,
    symbolName: 'GOLD',
    digits: 2,
    pipPosition: 1,
    lotSize: 100,
    minVolume: 100000,
    maxVolume: 1000000000,
    stepVolume: 100000,
    measurementUnits: 'oz',
    baseAsset: 'XAU',
    quoteAsset: 'USD',
    tickSize: 0.01,
    assetClass: 'METALS',
    description: 'Gold vs US Dollar'
  },
  BTCUSD: {
    symbolId: 2,
    symbolName: 'BTCUSD',
    digits: 2,
    pipPosition: 0, // 10^0 = 1.00 ($1.00 price delta = 1 pip)
    lotSize: 1, // 1 Bitcoin per standard lot
    minVolume: 100, // 0.01 BTC * 100 cents = 100 cents
    maxVolume: 500000,
    stepVolume: 100,
    measurementUnits: 'BTC',
    baseAsset: 'BTC',
    quoteAsset: 'USD',
    tickSize: 0.01,
    assetClass: 'CRYPTO',
    description: 'Bitcoin vs US Dollar (1 Lot = 1 BTC, Pip = 1.00)'
  },
  ETHUSD: {
    symbolId: 3,
    symbolName: 'ETHUSD',
    digits: 2,
    pipPosition: 1, // 10^-1 = 0.10 ($0.10 = 1 pip)
    lotSize: 1,
    minVolume: 100,
    maxVolume: 1000000,
    stepVolume: 100,
    measurementUnits: 'ETH',
    baseAsset: 'ETH',
    quoteAsset: 'USD',
    tickSize: 0.01,
    assetClass: 'CRYPTO',
    description: 'Ethereum vs US Dollar'
  },
  EURUSD: {
    symbolId: 4,
    symbolName: 'EURUSD',
    digits: 5,
    pipPosition: 4, // 10^-4 = 0.00010 (1 pip = 0.00010)
    lotSize: 100000, // 100,000 EUR
    minVolume: 100000, // 0.01 lot = 1,000 EUR = 100,000 cents
    maxVolume: 1000000000,
    stepVolume: 100000,
    measurementUnits: 'EUR',
    baseAsset: 'EUR',
    quoteAsset: 'USD',
    tickSize: 0.00001,
    assetClass: 'FOREX',
    description: 'Euro vs US Dollar (1 Lot = 100,000 EUR, Pip = 0.00010)'
  },
  GBPUSD: {
    symbolId: 5,
    symbolName: 'GBPUSD',
    digits: 5,
    pipPosition: 4,
    lotSize: 100000,
    minVolume: 100000,
    maxVolume: 1000000000,
    stepVolume: 100000,
    measurementUnits: 'GBP',
    baseAsset: 'GBP',
    quoteAsset: 'USD',
    tickSize: 0.00001,
    assetClass: 'FOREX',
    description: 'Pound vs US Dollar (1 Lot = 100,000 GBP, Pip = 0.00010)'
  },
  AUDUSD: {
    symbolId: 6,
    symbolName: 'AUDUSD',
    digits: 5,
    pipPosition: 4,
    lotSize: 100000,
    minVolume: 100000,
    maxVolume: 1000000000,
    stepVolume: 100000,
    measurementUnits: 'AUD',
    baseAsset: 'AUD',
    quoteAsset: 'USD',
    tickSize: 0.00001,
    assetClass: 'FOREX',
    description: 'Australian Dollar vs US Dollar'
  },
  USDJPY: {
    symbolId: 7,
    symbolName: 'USDJPY',
    digits: 3,
    pipPosition: 2, // 10^-2 = 0.010 (1 pip = 0.010)
    lotSize: 100000,
    minVolume: 100000,
    maxVolume: 1000000000,
    stepVolume: 100000,
    measurementUnits: 'USD',
    baseAsset: 'USD',
    quoteAsset: 'JPY',
    tickSize: 0.001,
    assetClass: 'FOREX',
    description: 'US Dollar vs Japanese Yen (1 Lot = 100,000 USD, Pip = 0.010)'
  }
};

// Prepopulate dynamic registry with baseline
Object.values(DEFAULT_PROTO_SYMBOLS).forEach((sym) => {
  PROTO_SYMBOL_REGISTRY.set(sym.symbolName.toUpperCase().replace('/', ''), sym);
});

/**
 * Registers or updates a symbol dynamically from live cTrader ProtoOASymbol response
 */
export function registerProtoSymbol(protoSymbol: ProtoOASymbol): ProtoOASymbol {
  const key = protoSymbol.symbolName.toUpperCase().replace('/', '');
  const normalized: ProtoOASymbol = {
    ...protoSymbol,
    symbolName: key,
    digits: Number(protoSymbol.digits ?? 2),
    pipPosition: Number(protoSymbol.pipPosition ?? 1),
    lotSize: protoSymbol.lotSize ? Number(protoSymbol.lotSize) : undefined,
    tickSize: protoSymbol.tickSize ? Number(protoSymbol.tickSize) : Math.pow(10, -(protoSymbol.digits ?? 2))
  };
  PROTO_SYMBOL_REGISTRY.set(key, normalized);
  return normalized;
}

/**
 * Ingests an array of ProtoOASymbol objects from cTrader Open API endpoint
 */
export function ingestProtoSymbols(symbols: ProtoOASymbol[]): void {
  if (Array.isArray(symbols)) {
    symbols.forEach(registerProtoSymbol);
  }
}

/**
 * Resolves ProtoOASymbol dynamically by symbol name or ID
 */
export function getProtoSymbol(symbolNameOrId: string | number = 'XAUUSD'): ProtoOASymbol {
  const rawKey = String(symbolNameOrId).toUpperCase().replace('/', '').trim();
  const key = rawKey.split('.')[0].split('_')[0].split('-')[0];
  
  if (PROTO_SYMBOL_REGISTRY.has(key)) {
    return PROTO_SYMBOL_REGISTRY.get(key)!;
  }
  if (PROTO_SYMBOL_REGISTRY.has(rawKey)) {
    return PROTO_SYMBOL_REGISTRY.get(rawKey)!;
  }

  // Heuristic dynamic builder if symbol is not yet in registry
  if (key.includes('XAU') || key.includes('GOLD')) {
    return DEFAULT_PROTO_SYMBOLS.XAUUSD;
  }
  if (key.includes('BTC')) {
    return DEFAULT_PROTO_SYMBOLS.BTCUSD;
  }
  if (key.includes('ETH')) {
    return DEFAULT_PROTO_SYMBOLS.ETHUSD;
  }
  if (key.includes('JPY')) {
    return DEFAULT_PROTO_SYMBOLS.USDJPY;
  }
  if (key.length >= 6 && (key.endsWith('USD') || key.startsWith('EUR') || key.startsWith('GBP') || key.startsWith('AUD'))) {
    return DEFAULT_PROTO_SYMBOLS.EURUSD;
  }

  return DEFAULT_PROTO_SYMBOLS.XAUUSD;
}

// -------------------------------------------------------------
// DYNAMIC MATHEMATICAL FORMULAS (NO HARDCODING)
// -------------------------------------------------------------

/**
 * Dynamically computes 1 pip size from ProtoOASymbol.pipPosition
 * Formula: pipSize = 10 ^ (-pipPosition)
 * Examples:
 * - EURUSD: pipPosition = 4 -> 10^-4 = 0.00010
 * - XAUUSD: pipPosition = 1 -> 10^-1 = 0.10
 * - BTCUSD: pipPosition = 0 -> 10^0  = 1.00
 * - USDJPY: pipPosition = 2 -> 10^-2 = 0.010
 */
export function getPipSize(symbol: ProtoOASymbol | string = 'XAUUSD'): number {
  const proto = typeof symbol === 'string' ? getProtoSymbol(symbol) : symbol;
  const pipPos = typeof proto.pipPosition === 'number' ? proto.pipPosition : 1;
  return Math.pow(10, -pipPos);
}

/**
 * Dynamically computes 1 tick size from ProtoOASymbol.digits or ProtoOASymbol.tickSize
 * Formula: tickSize = 10 ^ (-digits)
 */
export function getTickSize(symbol: ProtoOASymbol | string = 'XAUUSD'): number {
  const proto = typeof symbol === 'string' ? getProtoSymbol(symbol) : symbol;
  if (typeof proto.tickSize === 'number' && proto.tickSize > 0) {
    return proto.tickSize;
  }
  const digits = typeof proto.digits === 'number' ? proto.digits : 2;
  return Math.pow(10, -digits);
}

/**
 * Dynamically resolves contract size / lot size from ProtoOASymbol.lotSize
 * In cTrader Open API:
 * - If lotSize is in cents (> 1000000 for standard forex 10,000,000), normalize to units
 */
export function getContractSize(symbol: ProtoOASymbol | string = 'XAUUSD'): number {
  const proto = typeof symbol === 'string' ? getProtoSymbol(symbol) : symbol;
  if (typeof proto.lotSize === 'number' && proto.lotSize > 0) {
    if (proto.lotSize >= 10000000) {
      return proto.lotSize / 100;
    }
    return proto.lotSize;
  }
  // Fallbacks by asset class if lotSize is omitted
  if (proto.assetClass === 'METALS') return 100;
  if (proto.assetClass === 'CRYPTO') return 1;
  return 100000;
}

/**
 * Dynamically calculates Pip Value for 1.00 standard lot in Quote/Deposit Currency
 * Formula: pipValue = pipSize * contractSize
 * Examples:
 * - EURUSD: 0.00010 * 100,000 EUR = $10.00 USD / pip
 * - XAUUSD: 0.10 * 100 oz = $10.00 USD / pip
 * - BTCUSD: 1.00 * 1 BTC = $1.00 USD / pip
 */
export function getPipValue(
  symbol: ProtoOASymbol | string = 'XAUUSD',
  lotSize: number = 1.0,
  currentPrice?: number
): number {
  const proto = typeof symbol === 'string' ? getProtoSymbol(symbol) : symbol;
  const pipSize = getPipSize(proto);
  const contractSize = getContractSize(proto);
  
  let basePipValue = pipSize * lotSize * contractSize;

  // If quote asset is JPY (e.g. USDJPY, EURJPY)
  if (proto.quoteAsset === 'JPY' && currentPrice && currentPrice > 0) {
    basePipValue = basePipValue / currentPrice;
  }

  return Number(basePipValue.toFixed(4));
}

/**
 * Converts user Lot input to cTrader Open API volume in Cents (for ProtoOANewOrderReq)
 * Formula: volumeInCents = round(lot * contractSize * 100)
 */
export function lotToCTraderVolume(lot: number, symbol: ProtoOASymbol | string = 'XAUUSD'): number {
  const proto = typeof symbol === 'string' ? getProtoSymbol(symbol) : symbol;
  const key = String(typeof symbol === 'string' ? symbol : proto.symbolName).toUpperCase();

  if (key.includes('BTC') || key.includes('ETH')) {
    return Math.round(lot * 100);
  }
  if (key.includes('XAU') || key.includes('GOLD')) {
    return Math.round(lot * 10000);
  }
  const contractSize = getContractSize(proto);
  return Math.round(lot * contractSize * 100);
}

/**
 * Converts cTrader Open API volume (cents) to Standard Lot
 * Formula: lot = volumeInCents / scale
 */
export function cTraderVolumeToLot(volumeInCents: number, symbol: ProtoOASymbol | string = 'XAUUSD'): number {
  const proto = typeof symbol === 'string' ? getProtoSymbol(symbol) : symbol;
  const key = String(typeof symbol === 'string' ? symbol : proto.symbolName).toUpperCase();

  if (volumeInCents <= 0) return 0.01;

  if (key.includes('BTC') || key.includes('ETH')) {
    const lot = volumeInCents / 100;
    return Number(Math.max(0.01, lot).toFixed(2));
  }
  if (key.includes('XAU') || key.includes('GOLD')) {
    const lot = volumeInCents / 10000;
    return Number(Math.max(0.01, lot).toFixed(2));
  }

  const contractSize = getContractSize(proto);
  if (contractSize <= 0) return 0.01;
  const lot = volumeInCents / (contractSize * 100);
  return Number(Math.max(0.01, lot).toFixed(2));
}

/**
 * Dynamically calculates real-time PIPS based on ProtoOASymbol.pipPosition
 * Formula: pips = (priceDelta) / (10 ^ -pipPosition)
 */
export function calculateCTraderPips(
  symbol: ProtoOASymbol | string,
  entryPrice: number,
  currentPrice: number,
  direction: 'BUY' | 'SELL'
): number {
  const proto = typeof symbol === 'string' ? getProtoSymbol(symbol) : symbol;
  const pipSize = getPipSize(proto);
  const isBuy = direction === 'BUY';
  const priceDelta = isBuy ? (currentPrice - entryPrice) : (entryPrice - currentPrice);

  if (pipSize <= 0) return 0.0;
  const pips = priceDelta / pipSize;
  return Number(pips.toFixed(1));
}

/**
 * Dynamically calculates Gross Profit in USD ($) using ProtoOASymbol contract size
 * Formula:
 * - Direct USD Quote: Profit USD = priceDelta * lot * contractSize
 * - Indirect JPY Quote: Profit USD = (priceDelta * lot * contractSize) / currentPrice
 */
export function calculateCTraderProfitUSD(
  symbol: ProtoOASymbol | string,
  entryPrice: number,
  currentPrice: number,
  lotSize: number,
  direction: 'BUY' | 'SELL'
): number {
  const proto = typeof symbol === 'string' ? getProtoSymbol(symbol) : symbol;
  const contractSize = getContractSize(proto);
  const isBuy = direction === 'BUY';
  const priceDelta = isBuy ? (currentPrice - entryPrice) : (entryPrice - currentPrice);

  let rawProfitUSD: number;
  if (proto.quoteAsset === 'JPY' || proto.symbolName.endsWith('JPY')) {
    rawProfitUSD = (priceDelta * lotSize * contractSize) / (currentPrice || 1);
  } else {
    rawProfitUSD = priceDelta * lotSize * contractSize;
  }

  return Number(rawProfitUSD.toFixed(2));
}

/**
 * Dynamically calculates Profit Percentage (%) relative to Required Margin
 * Formula:
 * - Margin Required = (EntryPrice * LotSize * ContractSize) / Leverage
 * - Profit % = (Profit USD / Margin Required) * 100
 */
export function calculateCTraderProfitPercent(
  profitUSD: number,
  lotSize: number,
  entryPrice: number,
  symbol: ProtoOASymbol | string,
  leverage: number = 100
): number {
  const proto = typeof symbol === 'string' ? getProtoSymbol(symbol) : symbol;
  const contractSize = getContractSize(proto);
  const notionalValueUSD = (entryPrice || 1) * lotSize * contractSize;
  const marginRequired = notionalValueUSD / (leverage || 100);

  if (marginRequired <= 0) return 0.0;
  const percent = (profitUSD / marginRequired) * 100;
  return Number(percent.toFixed(2));
}

/**
 * Dynamically formats price using exact ProtoOASymbol.digits
 */
export function formatCTraderPrice(price: number | undefined | null, symbol: ProtoOASymbol | string = 'XAUUSD'): string {
  if (price === undefined || price === null || isNaN(price)) return '-';
  const proto = typeof symbol === 'string' ? getProtoSymbol(symbol) : symbol;
  const digits = typeof proto.digits === 'number' ? proto.digits : 2;
  return Number(price).toFixed(digits);
}

/**
 * Backward compatibility alias for SymbolSpecs
 */
export type SymbolSpecs = ProtoOASymbol;
export const CTRADER_SYMBOL_SPECS = DEFAULT_PROTO_SYMBOLS;
export function getSymbolSpecs(symbol: string = 'XAUUSD'): ProtoOASymbol {
  return getProtoSymbol(symbol);
}

export type SymbolVisual =
  | { kind: 'image'; src: string; alt: string }
  | { kind: 'flags'; base: string; quote: string };

const currencyFlags: Record<string, string> = {
  AUD: '🇦🇺',
  CAD: '🇨🇦',
  CHF: '🇨🇭',
  EUR: '🇪🇺',
  GBP: '🇬🇧',
  JPY: '🇯🇵',
  NZD: '🇳🇿',
  USD: '🇺🇸',
};

const knownCurrencies = Object.keys(currencyFlags);

export function normalizeTradingSymbol(symbol?: string): string {
  return String(symbol || '')
    .toUpperCase()
    .replace(/[^A-Z]/g, '');
}

export function getSymbolVisual(symbol?: string): SymbolVisual | null {
  const normalized = normalizeTradingSymbol(symbol);

  if (normalized.startsWith('XAUUSD')) {
    return { kind: 'image', src: '/assets/gold-bar.png', alt: 'Gold' };
  }

  if (normalized.startsWith('BTCUSD')) {
    return { kind: 'image', src: '/assets/bitcoin.png', alt: 'Bitcoin' };
  }

  const base = knownCurrencies.find((currency) => normalized.startsWith(currency));
  const quote = base ? knownCurrencies.find((currency) => normalized.slice(base.length).startsWith(currency)) : undefined;

  if (base && quote) {
    return { kind: 'flags', base: currencyFlags[base], quote: currencyFlags[quote] };
  }

  return null;
}
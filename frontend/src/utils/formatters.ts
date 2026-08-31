/**
 * Utility functions for formatting and partially masking financial trade metrics
 * Compliant with cTrader Open API standard symbol specifications
 */
import { formatCTraderPrice, getSymbolSpecs } from './ctraderCalculations';

export const formatPrice = (val: number | undefined | null, symbol?: string): string => {
  return formatCTraderPrice(val, symbol);
};

/**
 * Masks price to only show the initial starting number / digit followed by 'x's,
 * matching user requirement: e.g. "6xxx", "2xxx", "1.xxx".
 * Examples:
 * - 67450.00 -> "6xxxx"
 * - 2748.50  -> "2xxx"
 * - 152.40   -> "1xx"
 * - 78.50    -> "7x"
 * - 1.0864   -> "1.xxx"
 */
export const maskPartialPrice = (val: number | undefined | null, symbol?: string): string => {
  if (val === undefined || val === null || isNaN(val) || val <= 0) return '-';
  const cleanSymbol = symbol && symbol !== 'Unknown' ? symbol : 'XAUUSD';
  const specs = getSymbolSpecs(cleanSymbol);

  if (specs.assetClass === 'FOREX' && specs.digits >= 4) {
    const formatted = Number(val).toFixed(specs.digits);
    const parts = formatted.split('.');
    if (parts.length === 2) {
      return `${parts[0]}.xxx`;
    }
    return '1.xxx';
  }

  const intVal = Math.floor(val);
  const intStr = intVal.toString();
  if (intStr.length <= 1) {
    return `${intStr}x`;
  }
  const firstDigit = intStr[0];
  const maskedSuffix = 'x'.repeat(intStr.length - 1);
  return `${firstDigit}${maskedSuffix}`;
};


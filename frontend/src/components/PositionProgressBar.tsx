import React, { useState, useEffect, useRef, useMemo } from 'react';
import { CheckCircle2, XCircle } from 'lucide-react';
import { Trade } from '../types';
import { formatPrice } from '../utils/formatters';

interface PositionProgressBarProps {
  trade: Trade;
  isLocked?: boolean;
  strategyGradient?: string;
  strategyName?: string;
  strategyAccentColor?: string;
  strategyBadgeClass?: string;
}

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

/**
 * Kept for backward compat with existing imports / tests.
 * Returns entryPercent (fixed anchor on the bar) and progressPercent (Now marker position).
 */
export function computePositionMetrics({
  direction,
  entryPrice = 0,
  currentPrice = 0,
  stopLoss = 0,
  takeProfit = 0,
  pips = 0,
  profitUSD = 0,
  status,
}: {
  direction?: 'BUY' | 'SELL';
  entryPrice?: number;
  currentPrice?: number;
  stopLoss?: number;
  takeProfit?: number;
  symbol?: string;
  pips?: number;
  profitUSD?: number;
  status?: 'OPEN' | 'CLOSED';
}) {
  const isBuy = direction !== 'SELL';
  const safeEntry = Number(entryPrice) > 0 ? Number(entryPrice) : 1;
  const safeCurrent = Number(currentPrice) > 0 ? Number(currentPrice) : safeEntry;

  let entryPercent = 30;
  let progressPercent = 50;

  if (stopLoss > 0 && takeProfit > 0) {
    const priceMin = isBuy ? Math.min(stopLoss, safeEntry, safeCurrent, takeProfit) : Math.min(takeProfit, safeEntry, safeCurrent, stopLoss);
    const priceMax = isBuy ? Math.max(stopLoss, safeEntry, safeCurrent, takeProfit) : Math.max(takeProfit, safeEntry, safeCurrent, stopLoss);
    const fullRange = Math.max(priceMax - priceMin, Number.EPSILON);
    entryPercent = clamp(((safeEntry - priceMin) / fullRange) * 100, 5, 95);
    progressPercent = clamp(((safeCurrent - priceMin) / fullRange) * 100, 2, 98);
    if (!isBuy) {
      entryPercent = 100 - entryPercent;
      progressPercent = 100 - progressPercent;
    }
  } else {
    const dynamicRange = Math.max(Math.abs(safeEntry) * 0.08, 0.0001);
    const delta = isBuy ? (safeCurrent - safeEntry) : (safeEntry - safeCurrent);
    const bias = clamp((delta / dynamicRange) * 24, -42, 42);
    entryPercent = 30;
    progressPercent = clamp(entryPercent + bias, 5, 95);
    if (status === 'CLOSED') {
      progressPercent = (profitUSD ?? 0) >= 0
        ? clamp(entryPercent + Math.min(Math.abs(profitUSD) / 400, 1) * 55, entryPercent + 5, 95)
        : clamp(entryPercent - Math.min(Math.abs(profitUSD) / 400, 1) * 20, 5, entryPercent - 2);
    }
    if (Math.abs(pips) > 0 && Math.abs(profitUSD ?? 0) === 0) {
      progressPercent = clamp(entryPercent + (pips > 0 ? 20 : -14), 5, 95);
    }
  }

  return { entryPercent, progressPercent };
}

/**
 * Position Trade Progress Bar (dark glass, premium)
 * Layout: risk zone, progress zone, and remaining zone
 *  - SL→Entry: red risk zone
 *  - Entry→NOW: green filled progress
 *  - NOW→TP: dim/transparent remaining
 *  - NOW: neon green glowing dot with pulse
 *  - Fixed centered badge below the bar: "XX% Position"
 *  - Supports LONG & SHORT; smooth transitions on tick updates
 */
export const PositionProgressBar: React.FC<PositionProgressBarProps> = ({
  trade,
  strategyName,
  strategyAccentColor,
  strategyBadgeClass,
}) => {
  const safeTrade = trade || ({} as Trade);
  const {
    direction = 'BUY',
    entryPrice = 0,
    currentPrice = 0,
    stopLoss = 0,
    takeProfit = 0,
    status = 'OPEN',
    profitUSD = 0,
    symbol = 'XAUUSD',
    pips = 0,
  } = safeTrade;

  const isBuy = direction === 'BUY';
  const hasSL = Number(stopLoss) > 0;
  const hasTP = Number(takeProfit) > 0;

  // Layout percentages: fixed anchor points for the four markers so bar is always readable
  // even when SL/TP not set. When both set, positions are proportional to actual price range.
  const { slPercent, entryPercent, nowPercent, tpPercent } = useMemo(() => {
    // Default anchors (used when SL/TP missing) – matches reference visual
    let sl = 6;
    let entry = 30;
    let tp = 94;

    if (hasSL && hasTP && entryPrice > 0) {
      // Map SL/Entry/TP to fixed anchors so their relative distance mirrors price range
      const slDist = Math.abs(entryPrice - stopLoss);
      const tpDist = Math.abs(takeProfit - entryPrice);
      const total = slDist + tpDist;
      if (total > 0) {
        // Allocate 6..94 across the bar; entry anchored proportionally
        entry = clamp(6 + (slDist / total) * 88, 12, 82);
        sl = 4;
        tp = 96;
      }
    }

    // Compute NOW position dynamically along the ENTRY→TP axis (positive) or ENTRY→SL axis (negative)
    let now = entry;
    if (entryPrice > 0 && currentPrice > 0) {
      const movement = isBuy ? currentPrice - entryPrice : entryPrice - currentPrice;
      if (hasSL && hasTP) {
        if (movement >= 0) {
          const denom = Math.max(Math.abs(takeProfit - entryPrice), Number.EPSILON);
          const frac = clamp(movement / denom, 0, 1.1);
          now = entry + frac * (tp - entry);
        } else {
          const denom = Math.max(Math.abs(entryPrice - stopLoss), Number.EPSILON);
          const frac = clamp(-movement / denom, 0, 1.1);
          now = entry - frac * (entry - sl);
        }
      } else {
        // No SL/TP: scale by % price move — 1% move = ~60% of the "travel" segment
        const pctMove = (movement / Math.max(Math.abs(entryPrice), Number.EPSILON)) * 100; // signed %
        if (pctMove >= 0) {
          const frac = clamp(pctMove / 1.2, 0, 1);
          now = entry + frac * (tp - entry);
        } else {
          const frac = clamp(-pctMove / 1.2, 0, 1);
          now = entry - frac * (entry - sl);
        }
      }
    } else if (Math.abs(pips) > 0) {
      // Fallback when prices missing – use pips sign & magnitude
      const frac = clamp(Math.abs(pips) / 200, 0, 1);
      now = pips > 0 ? entry + frac * (tp - entry) : entry - frac * (entry - sl);
    }

    now = clamp(now, sl + 1, tp - 1);
    return { slPercent: sl, entryPercent: entry, nowPercent: now, tpPercent: tp };
  }, [entryPrice, currentPrice, stopLoss, takeProfit, hasSL, hasTP, isBuy, pips]);

  // Position % = progress from Entry towards TP (positive) or SL (negative)
  const positionPercent = useMemo(() => {
    if (!(entryPrice > 0 && currentPrice > 0)) return 0;
    const movement = isBuy ? currentPrice - entryPrice : entryPrice - currentPrice;
    if (hasSL && hasTP) {
      if (movement >= 0) {
        const denom = Math.max(Math.abs(takeProfit - entryPrice), Number.EPSILON);
        return Math.round(clamp((movement / denom) * 100, 0, 999));
      }
      const denom = Math.max(Math.abs(entryPrice - stopLoss), Number.EPSILON);
      return -Math.round(clamp((-movement / denom) * 100, 0, 999));
    }
    // No SL/TP: report signed % price change from entry (rounded to 2 decimals if tiny)
    const pct = (movement / Math.max(Math.abs(entryPrice), Number.EPSILON)) * 100;
    const rounded1 = Math.round(pct * 10) / 10;
    if (rounded1 === 0 && pct !== 0) return Math.round(pct * 100) / 100;
    return rounded1;
  }, [entryPrice, currentPrice, stopLoss, takeProfit, hasSL, hasTP, isBuy]);

  const isProfit = positionPercent >= 0;

  // Tick flash animation on price change
  const [tickPulse, setTickPulse] = useState<'UP' | 'DOWN' | null>(null);
  const prevPriceRef = useRef<number>(currentPrice);
  useEffect(() => {
    if (currentPrice > 0 && currentPrice !== prevPriceRef.current) {
      setTickPulse(currentPrice > prevPriceRef.current ? 'UP' : 'DOWN');
      prevPriceRef.current = currentPrice;
      const t = setTimeout(() => setTickPulse(null), 650);
      return () => clearTimeout(t);
    }
  }, [currentPrice]);

  const nowDisplay = formatPrice(currentPrice || entryPrice, symbol);

  const dotColor = isProfit ? '#22c55e' : '#f43f5e';
  const dotGlow = isProfit ? 'rgba(34,197,94,0.65)' : 'rgba(244,63,94,0.6)';
  const isClosed = status === 'CLOSED';
  const isClosedProfit = Number(profitUSD) > 0;
  const closePercent = isClosedProfit ? tpPercent : slPercent;

  return (
    <div
      data-testid="position-progress-bar"
      className="relative w-full rounded-2xl px-4 pt-3 pb-6 overflow-visible"
      style={{
        background: 'linear-gradient(180deg, rgba(8,17,28,0.9) 0%, rgba(6,12,20,0.92) 100%)',
        border: '1px solid rgba(60,90,120,0.28)',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04), 0 6px 24px rgba(0,0,0,0.35)',
        backdropFilter: 'blur(14px)',
        WebkitBackdropFilter: 'blur(14px)',
      }}
    >
      {/* Direction badge moved from the pair header into the progress bar. */}
      <div
        className={`absolute left-4 top-3 inline-flex items-center rounded-md border px-2.5 py-0.5 text-xl font-extrabold leading-none tracking-tight uppercase ${
          isBuy
            ? 'border-emerald-500/30 bg-emerald-500/15 text-emerald-400'
            : 'border-rose-500/30 bg-rose-500/15 text-rose-400'
        }`}
      >
        {direction}
      </div>

      {strategyName && (
        <div
          className={`absolute left-1/2 top-3 inline-flex -translate-x-1/2 items-center gap-1 rounded-md border px-2.5 py-0.5 text-[11px] font-semibold ${
            strategyBadgeClass || ''
          }`}
          style={strategyAccentColor ? {
            backgroundColor: `${strategyAccentColor}18`,
            color: strategyAccentColor,
            borderColor: `${strategyAccentColor}55`,
          } : undefined}
        >
          <span>{strategyName}</span>
        </div>
      )}

      {/* Now price label remains anchored to the live marker. */}
      <div className="relative h-14 mb-1">
        {/* Now label */}
        <div
          className="absolute right-0 text-right"
          style={{
            top: '0px',
          }}
        >
          <div className="text-[10px] font-semibold tracking-wide text-neutral-400 uppercase">Price</div>
          <div
            className="text-[13px] font-bold font-mono leading-tight transition-colors duration-300"
            style={{ color: dotColor, textShadow: tickPulse ? `0 0 8px ${dotGlow}` : 'none' }}
          >
            {nowDisplay}
          </div>
        </div>

        {/* Compact SL, Entry, and TP markers directly above the track. */}
        <div
          className="absolute -translate-x-1/2 rounded-md border border-rose-500/30 bg-rose-500/15 px-2 py-0.5 text-[10px] font-bold tracking-wide text-rose-300"
          style={{ left: `${slPercent}%`, top: '32px' }}
        >
          SL
        </div>
        <div
          className="absolute -translate-x-1/2 rounded-md border border-white/25 bg-white/10 px-2 py-0.5 text-[10px] font-bold tracking-wide text-white"
          style={{ left: `${entryPercent}%`, top: '32px' }}
        >
          Entry
        </div>
        <div
          className="absolute -translate-x-1/2 rounded-md border border-emerald-500/30 bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold tracking-wide text-emerald-300"
          style={{ left: `${tpPercent}%`, top: '32px' }}
        >
          TP
        </div>

      </div>

      {/* Bar track */}
      <div className="relative w-full h-[10px] rounded-full overflow-visible">
        {/* Base neutral track */}
        <div
          className="absolute inset-0 rounded-full"
          style={{ background: 'rgba(255,255,255,0.05)' }}
        />

        {/* Risk zone (SL → Entry) — red — only when SL exists */}
        {hasSL && (
        <div
          className="absolute top-0 bottom-0 rounded-full transition-all duration-500 ease-out"
          style={{
            left: `${slPercent}%`,
            width: `${Math.max(0, entryPercent - slPercent)}%`,
            background: 'linear-gradient(90deg, rgba(244,63,94,0.85) 0%, rgba(244,63,94,0.55) 60%, rgba(244,63,94,0.25) 100%)',
            boxShadow: '0 0 12px rgba(244,63,94,0.25)',
          }}
        />
        )}

        {/* Progress zone (Entry → NOW) — green when profit, red when loss */}
        <div
          className="absolute top-0 bottom-0 rounded-full transition-all duration-500 ease-out"
          style={{
            left: `${Math.min(entryPercent, nowPercent)}%`,
            width: `${Math.max(0, Math.abs(nowPercent - entryPercent))}%`,
            background: isProfit
              ? 'linear-gradient(90deg, rgba(34,197,94,0.95) 0%, rgba(74,222,128,1) 55%, rgba(34,197,94,1) 100%)'
              : 'linear-gradient(90deg, rgba(244,63,94,0.95) 0%, rgba(251,113,133,1) 55%, rgba(244,63,94,1) 100%)',
            boxShadow: isProfit
              ? '0 0 14px rgba(34,197,94,0.55)'
              : '0 0 14px rgba(244,63,94,0.55)',
          }}
        />

        {/* Remaining zone (NOW → TP) — subtle transparent */}
        <div
          className="absolute top-0 bottom-0 rounded-full transition-all duration-500 ease-out"
          style={{
            left: `${Math.max(nowPercent, entryPercent)}%`,
            width: `${Math.max(0, tpPercent - Math.max(nowPercent, entryPercent))}%`,
            background: 'linear-gradient(90deg, rgba(52,211,153,0.15) 0%, rgba(52,211,153,0.08) 100%)',
          }}
        />

        {/* SL tick marker (short red bar) — only when SL exists */}
        {hasSL && (
        <div
          className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-[3px] h-[18px] rounded-full transition-[left] duration-500 ease-out"
          style={{ left: `${slPercent}%`, background: '#f43f5e', boxShadow: '0 0 6px rgba(244,63,94,0.7)' }}
        />
        )}

        {/* Entry tick marker (short white bar) */}
        <div
          className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-[3px] h-[18px] rounded-full transition-[left] duration-500 ease-out"
          style={{ left: `${entryPercent}%`, background: '#ffffff', boxShadow: '0 0 6px rgba(255,255,255,0.7)' }}
        />

        {/* TP tick marker (short green bar) — only when TP exists */}
        {hasTP && (
        <div
          className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-[3px] h-[18px] rounded-full transition-[left] duration-500 ease-out"
          style={{ left: `${tpPercent}%`, background: '#22c55e', boxShadow: '0 0 6px rgba(34,197,94,0.7)' }}
        />
        )}

        {/* NOW glowing dot */}
        <div
          className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 transition-[left] duration-500 ease-out"
          style={{ left: `${nowPercent}%` }}
          data-testid="progress-now-dot"
        >
          <div className="relative flex items-center justify-center">
            {status === 'OPEN' && (
              <span
                className="absolute inline-flex h-6 w-6 rounded-full opacity-70 animate-ping"
                style={{ background: dotColor }}
              />
            )}
            {tickPulse && (
              <span
                className="absolute inline-flex h-7 w-7 rounded-full border-2 animate-pulse"
                style={{ borderColor: dotColor, background: `${dotColor}22` }}
              />
            )}
            <div
              className="relative rounded-full h-[14px] w-[14px] border-[2px] border-white"
              style={{
                background: dotColor,
                boxShadow: `0 0 14px ${dotGlow}, 0 0 28px ${dotGlow}`,
              }}
            />
          </div>
        </div>

        {isClosed && (
          <div
            className="absolute top-1/2 z-10 -translate-x-1/2 -translate-y-1/2 animate-pulse"
            style={{ left: `${closePercent}%` }}
            data-testid={isClosedProfit ? 'progress-close-profit' : 'progress-close-loss'}
          >
            {isClosedProfit ? (
              <CheckCircle2
                className="h-6 w-6 animate-bounce text-emerald-400"
                strokeWidth={3}
                style={{ filter: 'drop-shadow(0 0 6px rgba(34,197,94,0.85))' }}
              />
            ) : (
              <XCircle
                className="h-6 w-6 animate-bounce text-rose-400"
                strokeWidth={3}
                style={{ filter: 'drop-shadow(0 0 6px rgba(244,63,94,0.85))' }}
              />
            )}
          </div>
        )}
      </div>

      {/* Keep the position badge centered so live price movement cannot move it. */}
      <div
        className="absolute"
        style={{
          left: '50%',
          top: 'calc(100% - 19px)',
          transform: 'translateX(-50%)',
        }}
        data-testid="progress-position-badge"
      >
        <div className="relative">
          {/* Little connector line to the dot */}
          <div
            className="absolute left-1/2 -translate-x-1/2 -top-1.5 w-px h-1.5 opacity-50"
            style={{ background: dotColor }}
          />
          <div
            className="rounded-md px-2 py-0.5 text-[10px] font-bold leading-tight font-mono whitespace-nowrap"
            style={{
              background: isProfit
                ? 'linear-gradient(180deg, rgba(34,197,94,0.9), rgba(22,163,74,0.9))'
                : 'linear-gradient(180deg, rgba(244,63,94,0.9), rgba(225,29,72,0.9))',
              color: '#04120a',
              boxShadow: `0 2px 8px ${dotGlow}, inset 0 1px 0 rgba(255,255,255,0.3)`,
              border: `1px solid ${isProfit ? 'rgba(34,197,94,0.9)' : 'rgba(244,63,94,0.9)'}`,
            }}
          >
            {(() => {
              const abs = Math.abs(positionPercent);
              const sign = positionPercent > 0 ? '+' : positionPercent < 0 ? '-' : '';
              const display = abs === 0 ? '0'
                : abs >= 10 ? Math.round(abs).toString()
                : abs >= 1 ? abs.toFixed(1)
                : abs.toFixed(2);
              return `${sign}${display}% Position`;
            })()}
          </div>
        </div>
      </div>
    </div>
  );
};

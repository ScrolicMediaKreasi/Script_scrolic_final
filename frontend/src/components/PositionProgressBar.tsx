import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Trade } from '../types';
import { formatPrice, maskPartialPrice } from '../utils/formatters';

interface PositionProgressBarProps {
  trade: Trade;
  isLocked?: boolean;
  strategyGradient?: string;
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
 * Layout: SL ────── Entry ══════ NOW ────── TP
 *  - SL→Entry: red risk zone
 *  - Entry→NOW: green filled progress
 *  - NOW→TP: dim/transparent remaining
 *  - NOW: neon green glowing dot with pulse
 *  - Floating badge below NOW: "XX% Position"
 *  - Supports LONG & SHORT; smooth transitions on tick updates
 */
export const PositionProgressBar: React.FC<PositionProgressBarProps> = ({
  trade,
  isLocked = false,
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

  // Price display strings
  const slDisplay = hasSL ? (isLocked ? maskPartialPrice(stopLoss, symbol) : formatPrice(stopLoss, symbol)) : '-';
  const entryDisplay = isLocked ? maskPartialPrice(entryPrice, symbol) : formatPrice(entryPrice, symbol);
  const nowDisplay = formatPrice(currentPrice || entryPrice, symbol);
  const tpDisplay = hasTP ? (isLocked ? maskPartialPrice(takeProfit, symbol) : formatPrice(takeProfit, symbol)) : '-';

  const dotColor = isProfit ? '#22c55e' : '#f43f5e';
  const dotGlow = isProfit ? 'rgba(34,197,94,0.65)' : 'rgba(244,63,94,0.6)';

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
      {/* Marker labels row (SL / Entry / Now / TP) — each anchored to its bar percentage */}
      <div className="relative h-14 mb-1">
        {/* SL label */}
        <div
          className="absolute -translate-x-1/2 text-center transition-[left] duration-500 ease-out"
          style={{ left: `${slPercent}%` }}
        >
          <div className="text-[10px] font-semibold tracking-wide text-neutral-400 uppercase">SL</div>
          <div className="text-[13px] font-bold font-mono text-rose-400 leading-tight">{slDisplay}</div>
        </div>

        {/* Entry label */}
        <div
          className="absolute -translate-x-1/2 text-center transition-[left] duration-500 ease-out"
          style={{ left: `${entryPercent}%` }}
        >
          <div className="text-[10px] font-semibold tracking-wide text-neutral-400 uppercase">Entry</div>
          <div className="text-[13px] font-bold font-mono text-white leading-tight">{entryDisplay}</div>
        </div>

        {/* Now label — vertically offset when too close to Entry or SL/TP to avoid overlap */}
        <div
          className="absolute -translate-x-1/2 text-center transition-[left,top] duration-500 ease-out"
          style={{
            left: `${nowPercent}%`,
            top: (Math.abs(nowPercent - entryPercent) < 10 || Math.abs(nowPercent - slPercent) < 10 || Math.abs(nowPercent - tpPercent) < 10) ? '28px' : '0px',
          }}
        >
          <div className="text-[10px] font-semibold tracking-wide text-neutral-400 uppercase">Now</div>
          <div
            className="text-[13px] font-bold font-mono leading-tight transition-colors duration-300"
            style={{ color: dotColor, textShadow: tickPulse ? `0 0 8px ${dotGlow}` : 'none' }}
          >
            {nowDisplay}
          </div>
        </div>

        {/* TP label */}
        <div
          className="absolute -translate-x-1/2 text-center transition-[left] duration-500 ease-out"
          style={{ left: `${tpPercent}%` }}
        >
          <div className="text-[10px] font-semibold tracking-wide text-neutral-400 uppercase">TP</div>
          <div className="text-[13px] font-bold font-mono text-emerald-400 leading-tight">{tpDisplay}</div>
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
      </div>

      {/* Floating "XX% Position" badge under NOW */}
      <div
        className="absolute transition-[left] duration-500 ease-out"
        style={{
          left: `${nowPercent}%`,
          top: 'calc(100% - 22px)',
          transform: 'translateX(-50%)',
        }}
        data-testid="progress-position-badge"
      >
        <div className="relative">
          {/* Little connector line to the dot */}
          <div
            className="absolute left-1/2 -translate-x-1/2 -top-2 w-[2px] h-2 opacity-60"
            style={{ background: dotColor }}
          />
          <div
            className="px-2.5 py-[3px] rounded-md text-[11px] font-bold font-mono whitespace-nowrap"
            style={{
              background: isProfit
                ? 'linear-gradient(180deg, rgba(34,197,94,0.9), rgba(22,163,74,0.9))'
                : 'linear-gradient(180deg, rgba(244,63,94,0.9), rgba(225,29,72,0.9))',
              color: '#04120a',
              boxShadow: `0 4px 12px ${dotGlow}, inset 0 1px 0 rgba(255,255,255,0.35)`,
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

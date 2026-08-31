import React from 'react';
import { Lock } from 'lucide-react';
import { Trade } from '../types';
import { formatPrice, maskPartialPrice } from '../utils/formatters';

interface PositionProgressBarProps {
  trade: Trade;
  isLocked?: boolean;
  strategyGradient?: string;
}

export const PositionProgressBar: React.FC<PositionProgressBarProps> = ({
  trade,
  isLocked = false,
  strategyGradient = 'from-amber-600 via-amber-400 to-emerald-400'
}) => {
  const { direction, entryPrice, currentPrice, stopLoss, takeProfit, status, pips, profitUSD } = trade;
  const isBuy = direction === 'BUY';
  const isProfit = profitUSD >= 0;

  // If SL or TP is 0 or not set, use safe fallback layout
  const hasSL = stopLoss > 0;
  const hasTP = takeProfit > 0;

  // Calculate percentage along the SL -> Entry -> TP line according to SCROLIC V7 spec
  let progressPercent = 50;
  let entryPercent = 50;

  if (hasSL && hasTP) {
    if (isBuy) {
      const totalRange = takeProfit - stopLoss;
      if (totalRange > 0) {
        entryPercent = Math.max(10, Math.min(90, ((entryPrice - stopLoss) / totalRange) * 100));
        progressPercent = Math.max(0, Math.min(100, ((currentPrice - stopLoss) / totalRange) * 100));
      }
    } else {
      // For SELL: Stop loss is HIGHER than entry, Take profit is LOWER than entry
      const totalRange = stopLoss - takeProfit;
      if (totalRange > 0) {
        entryPercent = Math.max(10, Math.min(90, ((stopLoss - entryPrice) / totalRange) * 100));
        progressPercent = Math.max(0, Math.min(100, ((stopLoss - currentPrice) / totalRange) * 100));
      }
    }
  } else if (hasTP) {
    // Progress relative to TP
    if (isBuy && takeProfit > entryPrice) {
      progressPercent = Math.max(0, Math.min(100, ((currentPrice - entryPrice) / (takeProfit - entryPrice)) * 100));
    } else if (!isBuy && entryPrice > takeProfit) {
      progressPercent = Math.max(0, Math.min(100, ((entryPrice - currentPrice) / (entryPrice - takeProfit)) * 100));
    }
    entryPercent = 50;
  } else {
    // Fallback if no SL/TP: show position relative to entry dynamically
    const pipsScale = trade.symbol.includes('XAU') ? 10.0 : trade.symbol.includes('BTC') ? 20.0 : 5.0;
    progressPercent = isProfit 
      ? Math.min(96, 50 + (pips / pipsScale)) 
      : Math.max(4, 50 - (Math.abs(pips) / pipsScale));
    entryPercent = 50;
  }

  // Display strings for SL, Entry, and TP
  const slDisplay = isLocked 
    ? (hasSL ? maskPartialPrice(stopLoss, trade.symbol) : '-') 
    : (hasSL ? formatPrice(stopLoss, trade.symbol) : '-');

  const entryDisplay = isLocked 
    ? maskPartialPrice(entryPrice, trade.symbol) 
    : formatPrice(entryPrice, trade.symbol);

  const tpDisplay = isLocked 
    ? (hasTP ? maskPartialPrice(takeProfit, trade.symbol) : '-') 
    : (hasTP ? formatPrice(takeProfit, trade.symbol) : '-');

  return (
    <div className="w-full bg-[#141414] rounded-xl p-3.5 border border-[#222222] relative overflow-hidden">
      {/* Top markers */}
      <div className="flex justify-between items-center text-[11px] font-mono mb-2 text-neutral-400">
        <div className="flex items-center gap-1">
          <span className="text-rose-400 font-semibold flex items-center gap-0.5">
            {isLocked && <Lock className="w-2.5 h-2.5 text-rose-400/80" />}
            SL
          </span>
          <span className={isLocked ? 'text-neutral-400 font-medium tracking-wider' : 'text-neutral-300'}>
            {slDisplay}
          </span>
        </div>

        <div className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-[#1f1f1f] text-neutral-300 border border-white/5">
          <span className="text-neutral-400 flex items-center gap-0.5">
            {isLocked && <Lock className="w-2.5 h-2.5 text-amber-400/80" />}
            ENTRY
          </span>
          <span className={`font-semibold ${isLocked ? 'text-amber-200/90 tracking-wider' : 'text-white'}`}>
            {entryDisplay}
          </span>
        </div>

        <div className="flex items-center gap-1">
          <span className="text-emerald-400 font-semibold flex items-center gap-0.5">
            {isLocked && <Lock className="w-2.5 h-2.5 text-emerald-400/80" />}
            TP
          </span>
          <span className={isLocked ? 'text-neutral-400 font-medium tracking-wider' : 'text-neutral-300'}>
            {tpDisplay}
          </span>
        </div>
      </div>

      {/* The Dynamic Progress Bar Track */}
      <div className="relative w-full h-2.5 bg-[#222222] rounded-full my-3 overflow-visible">
        {/* Entry Marker Line */}
        <div 
          className="absolute top-0 bottom-0 w-0.5 bg-neutral-400 z-10"
          style={{ left: `${entryPercent}%` }}
        >
          <div className="w-1.5 h-1.5 rounded-full bg-neutral-300 -translate-x-[2px] -translate-y-[2px]" />
        </div>

        {/* Dynamic Colored Bar from Entry to Current */}
        <div 
          className={`absolute top-0 bottom-0 rounded-full transition-all duration-500 bg-gradient-to-r ${strategyGradient}`}
          style={{
            left: `${Math.min(entryPercent, progressPercent)}%`,
            width: `${Math.max(3, Math.abs(progressPercent - entryPercent))}%`
          }}
        />

        {/* Current Position Marker (Floating Ball & Pulse) */}
        <div 
          className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 z-20 transition-all duration-500 cursor-pointer"
          style={{ left: `${progressPercent}%` }}
        >
          <div className="relative flex items-center justify-center">
            {status === 'OPEN' && (
              <span className={`animate-ping absolute inline-flex h-3.5 w-3.5 rounded-full opacity-75 ${isProfit ? 'bg-emerald-400' : 'bg-rose-400'}`} />
            )}
            <div className={`relative inline-flex rounded-full h-3.5 w-3.5 border-2 border-white shadow-lg ${isProfit ? 'bg-emerald-500' : 'bg-rose-500'}`} />
          </div>
        </div>
      </div>

      {/* Bottom Labels */}
      <div className="flex justify-between items-center text-[10px] text-neutral-400 font-medium">
        <span className="text-rose-400/80">RISK ZONE</span>
        <div className="text-center font-mono">
          <span className="text-neutral-300 font-semibold">
            NOW: {formatPrice(currentPrice, trade.symbol)}
          </span>
        </div>
        <span className="text-emerald-400/80">TARGET ZONE</span>
      </div>
    </div>
  );
};

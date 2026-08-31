import React from 'react';

export const FeedSkeleton: React.FC = () => {
  return (
    <div className="w-full max-w-md mx-auto space-y-4 pb-12 animate-in fade-in duration-300">
      {[1, 2].map((idx) => (
        <div 
          key={idx} 
          className="bg-[#0b140d]/90 border border-emerald-500/20 rounded-3xl p-4 shadow-xl space-y-3.5 relative overflow-hidden backdrop-blur-md"
        >
          {/* Top Shimmer Overlay */}
          <div className="absolute inset-0 -translate-x-full animate-[shimmer_2s_infinite] bg-gradient-to-r from-transparent via-emerald-500/5 to-transparent pointer-events-none" />

          {/* 1. Header: Avatar + User Info + Symbol Badge */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {/* Avatar Skeleton */}
              <div className="w-11 h-11 rounded-2xl bg-neutral-800/80 animate-pulse shrink-0 border border-white/5" />

              <div className="space-y-1.5 min-w-0">
                <div className="flex items-center gap-2">
                  <div className="w-28 h-3.5 rounded-lg bg-neutral-800/90 animate-pulse" />
                  <div className="w-12 h-3.5 rounded-md bg-emerald-500/20 animate-pulse" />
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-16 h-2.5 rounded bg-neutral-800/60 animate-pulse" />
                  <div className="w-20 h-2.5 rounded bg-neutral-800/60 animate-pulse" />
                </div>
              </div>
            </div>

            {/* Symbol & Direction Badge Skeleton */}
            <div className="w-20 h-8 rounded-xl bg-neutral-800/90 animate-pulse border border-white/5" />
          </div>

          {/* 2. Main Live Trade Canvas Skeleton */}
          <div className="bg-[#071009] rounded-2xl p-4 border border-emerald-500/15 space-y-3">
            {/* Price Metrics Shimmer */}
            <div className="flex justify-between items-center">
              <div className="space-y-1">
                <div className="w-16 h-2.5 rounded bg-neutral-800/60 animate-pulse" />
                <div className="w-24 h-5 rounded-lg bg-neutral-800/90 animate-pulse" />
              </div>
              <div className="space-y-1 text-right">
                <div className="w-16 h-2.5 rounded bg-neutral-800/60 animate-pulse" />
                <div className="w-24 h-5 rounded-lg bg-emerald-500/20 animate-pulse" />
              </div>
            </div>

            {/* Progress Bar Shimmer */}
            <div className="space-y-1 pt-1">
              <div className="flex justify-between">
                <div className="w-12 h-2 rounded bg-neutral-800/60 animate-pulse" />
                <div className="w-16 h-2 rounded bg-emerald-500/30 animate-pulse" />
              </div>
              <div className="w-full h-3 rounded-full bg-neutral-800/80 animate-pulse overflow-hidden">
                <div className="w-2/3 h-full bg-gradient-to-r from-emerald-600/30 to-amber-500/30 rounded-full animate-pulse" />
              </div>
            </div>

            {/* Hidden SL/TP Pills Shimmer */}
            <div className="grid grid-cols-2 gap-2 pt-1">
              <div className="h-8 rounded-xl bg-neutral-800/60 animate-pulse border border-white/5" />
              <div className="h-8 rounded-xl bg-neutral-800/60 animate-pulse border border-white/5" />
            </div>
          </div>

          {/* 3. Action Buttons & Description Skeleton */}
          <div className="flex items-center justify-between pt-1">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-neutral-800/80 animate-pulse" />
              <div className="w-8 h-8 rounded-xl bg-neutral-800/80 animate-pulse" />
              <div className="w-8 h-8 rounded-xl bg-neutral-800/80 animate-pulse" />
            </div>
            <div className="w-28 h-9 rounded-xl bg-emerald-500/20 animate-pulse border border-emerald-500/30" />
          </div>

          {/* Description Text Shimmer */}
          <div className="space-y-1.5 pt-1">
            <div className="w-full h-3 rounded bg-neutral-800/70 animate-pulse" />
            <div className="w-3/4 h-3 rounded bg-neutral-800/70 animate-pulse" />
          </div>
        </div>
      ))}
    </div>
  );
};

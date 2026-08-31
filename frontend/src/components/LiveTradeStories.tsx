import React, { useState } from 'react';
import { Plus, TrendingUp, TrendingDown, Zap, X, ShieldCheck, ArrowRight, Eye } from 'lucide-react';
import { FeedPost, User } from '../types';
import { triggerHaptic } from '../utils/haptics';
import { formatPrice } from '../utils/formatters';

interface LiveTradeStoriesProps {
  posts: FeedPost[];
  currentUser: User | null;
  onSelectStoryPost: (post: FeedPost) => void;
  onOpenDetail?: (post: FeedPost) => void;
}

export const LiveTradeStories: React.FC<LiveTradeStoriesProps> = ({
  posts,
  currentUser,
  onSelectStoryPost,
  onOpenDetail
}) => {
  // Extract unique live trade posts or unique traders with open positions
  const safePosts = Array.isArray(posts) ? posts : [];
  const livePosts = safePosts.filter((p) => p?.trade?.status === 'OPEN');
  // Fallback to top recent posts if not enough live positions
  const displayStories = livePosts.length > 0 ? livePosts.slice(0, 10) : safePosts.slice(0, 8);
  const [activeStoryModalPost, setActiveStoryModalPost] = useState<FeedPost | null>(null);

  const handleStoryClick = (post: FeedPost) => {
    triggerHaptic('selection');
    onSelectStoryPost(post);
  };

  const myPost = currentUser ? posts.find(p => p.user.id === currentUser.id) : null;

  return (
    <div className="w-full bg-[#061009] border-b border-[#18633c]/25 py-3 px-2 select-none shadow-inner">
      {/* Horizontal Story Rail */}
      <div className="flex items-center gap-3.5 overflow-x-auto no-scrollbar px-1.5 py-0.5">
        
        {/* Story Bubble 1: Current User Story / Live Status */}
        <div 
          onClick={() => {
            triggerHaptic('medium');
            if (myPost) {
              onSelectStoryPost(myPost);
            } else if (displayStories.length > 0) {
              onSelectStoryPost(displayStories[0]);
            }
          }}
          className="flex flex-col items-center gap-1.5 shrink-0 cursor-pointer group"
        >
          <div className="relative">
            <div className="w-15 h-15 rounded-full p-[2px] bg-gradient-to-tr from-emerald-600 to-green-400 group-hover:from-emerald-500 group-hover:to-green-300 transition-all duration-300 shadow-md shadow-emerald-500/20">
              <div className="w-full h-full rounded-full bg-[#07130c] p-[2px] overflow-hidden flex items-center justify-center">
                <img
                  src={currentUser?.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80'}
                  alt="My Story"
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover rounded-full group-hover:scale-105 transition-transform"
                />
              </div>
            </div>
            {/* Live Indicator Overlay Badge */}
            <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-emerald-500 border-2 border-[#061009] flex items-center justify-center shadow-sm">
              <span className="w-1.5 h-1.5 rounded-full bg-black animate-ping" />
            </div>
          </div>
          <span className="text-[11px] font-semibold text-neutral-300 group-hover:text-emerald-400 truncate max-w-[64px] text-center">
            {currentUser ? 'Posisi Saya' : 'cTrader Live'}
          </span>
        </div>

        {/* Story Bubbles: Active Live Traders */}
        {displayStories.map((post) => {
          const { user, trade, strategy } = post;
          const isProfit = (trade?.profitUSD || 0) >= 0;
          const isBuy = trade?.direction === 'BUY';
          const isPro = user.subscriptionTier !== 'free';

          return (
            <div
              key={`story-${post.id}`}
              id={`story-bubble-${post.id}`}
              onClick={() => handleStoryClick(post)}
              className="flex flex-col items-center gap-1.5 shrink-0 cursor-pointer group transition-transform active:scale-95"
            >
              <div className="relative">
                {/* Glowing Animated Instagram-style Ring with Strategy Gradient for Pro */}
                <div 
                  className={`w-15 h-15 rounded-full p-[2.5px] transition-all duration-300 ${
                    isPro 
                      ? `bg-gradient-to-tr ${strategy.positionBarGradient}`
                      : isProfit
                      ? 'bg-gradient-to-tr from-emerald-500 via-amber-400 to-emerald-400'
                      : 'bg-gradient-to-tr from-rose-500 via-amber-500 to-purple-500'
                  }`}
                  style={
                    isPro
                      ? { boxShadow: `0 0 14px -2px ${strategy.accentColor}55` }
                      : isProfit
                      ? { boxShadow: '0 0 12px -2px rgba(16,185,129,0.35)' }
                      : { boxShadow: '0 0 12px -2px rgba(244,63,94,0.35)' }
                  }
                >
                  <div className="w-full h-full rounded-full bg-[#0d0d0d] p-[2px] overflow-hidden flex items-center justify-center relative">
                    <img
                      src={user.avatar}
                      alt={user.displayName}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover rounded-full group-hover:scale-105 transition-transform"
                    />
                    {/* Mini Asset Symbol Overlay Pill inside circle */}
                    <div className="absolute inset-x-0 bottom-0 bg-black/80 py-0.5 text-center">
                      <span className="text-[8px] font-black font-mono tracking-tighter text-white">
                        {trade?.symbol && trade.symbol !== 'Unknown' ? trade.symbol.replace('USD', '') : 'XAU'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Floating Direction & Status Badge */}
                <div className={`absolute -top-1 -right-1 px-1.5 py-0.5 rounded-full border border-[#0a0a0a] text-[9px] font-black flex items-center gap-0.5 shadow-md ${
                  isBuy 
                    ? 'bg-emerald-500 text-black' 
                    : 'bg-rose-500 text-white'
                }`}>
                  {isBuy ? <TrendingUp className="w-2.5 h-2.5 stroke-[3]" /> : <TrendingDown className="w-2.5 h-2.5 stroke-[3]" />}
                  <span>{trade.direction === 'BUY' ? 'B' : 'S'}</span>
                </div>

                {/* Live Pulse Ping */}
                <span className="absolute bottom-0 left-0 w-2.5 h-2.5 rounded-full bg-emerald-400 border-2 border-[#0a0a0a]">
                  <span className="absolute inset-0 rounded-full bg-emerald-400 animate-ping opacity-75"></span>
                </span>
              </div>

              {/* Trader Name & Pips */}
              <div className="flex flex-col items-center max-w-[68px]">
                <span className="text-[11px] font-semibold text-neutral-200 group-hover:text-amber-300 truncate w-full text-center">
                  {user.username}
                </span>
                <span className={`text-[9px] font-mono font-bold leading-none ${
                  isProfit ? 'text-emerald-400' : 'text-rose-400'
                }`}>
                  {isProfit ? '+' : ''}{(trade?.pips ?? 0).toFixed(0)}p
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Optional Instagram Story Quick Modal Viewer */}
      {activeStoryModalPost && (
        <div 
          className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200"
          onClick={() => setActiveStoryModalPost(null)}
        >
          <div 
            className="w-full max-w-sm bg-[#111111] border border-[#262626] rounded-3xl overflow-hidden shadow-2xl relative animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Story Header */}
            <div className="p-4 bg-gradient-to-b from-[#1c1c1c] to-transparent flex items-center justify-between border-b border-white/5">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-full p-[2px] bg-gradient-to-tr from-amber-400 to-emerald-400">
                  <img
                    src={activeStoryModalPost.user.avatar}
                    alt={activeStoryModalPost.user.displayName}
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover rounded-full"
                  />
                </div>
                <div>
                  <div className="flex items-center gap-1">
                    <span className="font-bold text-xs text-white">{activeStoryModalPost.user.displayName}</span>
                    {activeStoryModalPost.user.isVerified && <ShieldCheck className="w-3.5 h-3.5 text-sky-400" />}
                  </div>
                  <span className="text-[10px] text-neutral-400">@{activeStoryModalPost.user.username} - Live Signal</span>
                </div>
              </div>
              <button
                onClick={() => setActiveStoryModalPost(null)}
                className="w-8 h-8 rounded-full bg-neutral-800/80 hover:bg-neutral-700 text-neutral-400 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Story Body */}
            <div className="p-5 space-y-4 text-center">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-300 text-xs font-bold">
                <Zap className="w-3.5 h-3.5" />
                <span>{activeStoryModalPost.strategy.name}</span>
              </div>

              <div>
                <div className="text-3xl font-black text-white font-display tracking-tight">
                  {activeStoryModalPost.trade.symbol}
                </div>
                <div className={`text-sm font-bold font-mono mt-1 ${
                  (activeStoryModalPost.trade.profitUSD ?? 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'
                }`}>
                  {activeStoryModalPost.trade.direction} - {(activeStoryModalPost.trade.profitUSD ?? 0) >= 0 ? '+' : ''}
                  {(activeStoryModalPost.trade.pips ?? 0).toFixed(1)} Pips (${(activeStoryModalPost.trade.profitUSD ?? 0).toFixed(2)})
                </div>
              </div>

              <div className="bg-[#181818] p-3 rounded-2xl border border-[#2a2a2a] text-xs text-neutral-300 text-left">
                {activeStoryModalPost.customDescription || activeStoryModalPost.autoDescription}
              </div>

              {/* Action Buttons */}
              <div className="grid grid-cols-2 gap-2 pt-2">
                <button
                  onClick={() => {
                    triggerHaptic('medium');
                    const post = activeStoryModalPost;
                    setActiveStoryModalPost(null);
                    onSelectStoryPost(post);
                  }}
                  className="w-full py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-extrabold text-xs flex items-center justify-center gap-1.5 shadow-lg shadow-amber-500/20 cursor-pointer"
                >
                  <Eye className="w-3.5 h-3.5" />
                  <span>Lihat di Feed</span>
                </button>

                {onOpenDetail && (
                  <button
                    onClick={() => {
                      triggerHaptic('medium');
                      const post = activeStoryModalPost;
                      setActiveStoryModalPost(null);
                      onOpenDetail(post);
                    }}
                    className="w-full py-2.5 rounded-xl bg-[#222] hover:bg-[#2e2e2e] text-white font-bold text-xs flex items-center justify-center gap-1.5 border border-[#333] cursor-pointer"
                  >
                    <span>Detail Trade</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

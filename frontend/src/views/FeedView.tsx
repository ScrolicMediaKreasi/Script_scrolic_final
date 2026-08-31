import React, { useState, useRef, useEffect } from 'react';
import { 
  Sparkles, 
  Users, 
  Filter, 
  TrendingUp, 
  RefreshCw, 
  Zap, 
  Lock, 
  Smartphone, 
  ListFilter,
  ChevronUp,
  ChevronDown,
  Layers,
  Maximize2,
  Minimize2
} from 'lucide-react';
import { FeedPost, User } from '../types';
import { DynamicFeedTemplate } from '../components/DynamicFeedTemplate';
import { LiveTradeStories } from '../components/LiveTradeStories';
import { FeedSkeleton } from '../components/FeedSkeleton';
import { STRATEGY_LIST } from '../data/strategies';
import { triggerHaptic } from '../utils/haptics';

interface FeedViewProps {
  posts: FeedPost[];
  currentUser: User | null;
  isLoading?: boolean;
  hasMore?: boolean;
  isLoadingMore?: boolean;
  onLoadMore?: () => void;
  onUnlockPost: (post: FeedPost) => void;
  onOpenDetail: (post: FeedPost) => void;
  onOpenFollowSetup: (post: FeedPost) => void;
  onOpenAskAI: (post: FeedPost) => void;
  onOpenComments: (post: FeedPost) => void;
  onToggleLike: (post: FeedPost) => void;
  onToggleSave: (post: FeedPost) => void;
  onToggleFollow: (username: string) => void;
  onOpenPerformance?: (username: string) => void;
  onEditDescription: (post: FeedPost) => void;
  onViewProfile: (username: string) => void;
  onRefreshFeed: () => void;
  onOpenLogin?: () => void;
}

export const FeedView: React.FC<FeedViewProps> = ({
  posts,
  currentUser,
  isLoading = false,
  hasMore = false,
  isLoadingMore = false,
  onLoadMore,
  onUnlockPost,
  onOpenDetail,
  onOpenFollowSetup,
  onOpenAskAI,
  onOpenComments,
  onToggleLike,
  onToggleSave,
  onToggleFollow,
  onOpenPerformance,
  onEditDescription,
  onViewProfile,
  onRefreshFeed,
  onOpenLogin
}) => {
  const [feedType, setFeedType] = useState<'for_you' | 'following'>('for_you');
  const [selectedStrategyFilter, setSelectedStrategyFilter] = useState<string>('ALL');
  const [viewMode, setViewMode] = useState<'scroll' | 'swipe_focus'>('scroll');
  const [activeSwipeIndex, setActiveSwipeIndex] = useState<number>(0);
  const [highlightedPostId, setHighlightedPostId] = useState<string | null>(null);

  // Filter posts
  const filteredPosts = posts.filter((p) => {
    // Tab filter
    if (feedType === 'following') {
      if (!currentUser) return false;
      const isFollowed = (currentUser.followingList || []).includes(p.user.username);
      if (!isFollowed && p.userId !== currentUser.id) return false;
    }
    // Strategy filter
    if (selectedStrategyFilter !== 'ALL' && p.strategy.id !== selectedStrategyFilter) {
      return false;
    }
    return true;
  });

  const sentinelRef = useRef<HTMLDivElement>(null);

  // Automatic Infinite Scroll Sentinel Observer
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !hasMore || isLoadingMore || !onLoadMore || typeof IntersectionObserver === 'undefined') {
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && hasMore && !isLoadingMore && onLoadMore) {
          onLoadMore();
        }
      },
      { rootMargin: '300px 0px 300px 0px', threshold: 0.1 }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [hasMore, isLoadingMore, onLoadMore, filteredPosts.length]);

  // Story click handler: Scrolls directly to target card & triggers gentle highlight
  const handleSelectStoryPost = (post: FeedPost) => {
    triggerHaptic('selection');
    setHighlightedPostId(post.id);
    if (viewMode === 'swipe_focus') {
      const idx = filteredPosts.findIndex((p) => p.id === post.id);
      if (idx !== -1) {
        setActiveSwipeIndex(idx);
      }
    } else {
      setTimeout(() => {
        const el = document.getElementById(`feed-post-${post.id}`);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 100);
    }
    // Clear highlight after 3 seconds
    setTimeout(() => {
      setHighlightedPostId(null);
    }, 3000);
  };

  // Next / Previous swipe cards handlers for Swipe Focus mode
  const handleNextCard = () => {
    if (activeSwipeIndex < filteredPosts.length - 1) {
      triggerHaptic('light');
      setActiveSwipeIndex((prev) => prev + 1);
    }
  };

  const handlePrevCard = () => {
    if (activeSwipeIndex > 0) {
      triggerHaptic('light');
      setActiveSwipeIndex((prev) => prev - 1);
    }
  };

  // Keyboard navigation for desktop testing
  useEffect(() => {
    if (viewMode !== 'swipe_focus') return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown' || e.key === 'j') {
        handleNextCard();
      } else if (e.key === 'ArrowUp' || e.key === 'k') {
        handlePrevCard();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [viewMode, activeSwipeIndex, filteredPosts.length]);

  // Vertical touch gesture for Swipe Focus Mode
  const touchStartY = useRef<number>(0);
  const handleSwipeTouchStart = (e: React.TouchEvent) => {
    touchStartY.current = e.touches[0].clientY;
  };
  const handleSwipeTouchEnd = (e: React.TouchEvent) => {
    const deltaY = e.changedTouches[0].clientY - touchStartY.current;
    if (deltaY < -50) {
      handleNextCard();
    } else if (deltaY > 50) {
      handlePrevCard();
    }
  };

  return (
    <div className={`w-full max-w-md mx-auto ${viewMode === 'swipe_focus' ? 'h-[calc(100dvh-7.5rem)] pb-0' : 'pb-24 px-3 sm:px-0'}`}>
      
      {/* 1. SCROLL MODE: STORIES & TOP CONTROLS */}
      {viewMode === 'scroll' && (
        <>
          {/* Instagram-like Stories Rail */}
          <div className="mb-2">
            <LiveTradeStories
              posts={posts}
              currentUser={currentUser}
              onSelectStoryPost={handleSelectStoryPost}
              onOpenDetail={onOpenDetail}
            />
          </div>

          {/* Top Feed Controls Bar */}
          <div className="sticky top-14 z-30 bg-[#050505]/95 backdrop-blur-md pt-2 pb-2 border-b border-[#1f1f1f] mb-2">
            
            {/* Main Feed Tab Toggle & Mode Switcher */}
            <div className="flex items-center justify-between px-2 mb-2">
              <div className="flex gap-4">
                <button
                  id="feed-tab-foryou"
                  onClick={() => {
                    triggerHaptic('light');
                    setFeedType('for_you');
                    setActiveSwipeIndex(0);
                  }}
                  className={`text-sm font-bold transition-all relative pb-1 cursor-pointer ${
                    feedType === 'for_you' ? 'text-white' : 'text-neutral-500 hover:text-neutral-300'
                  }`}
                >
                  Untuk Anda
                  {feedType === 'for_you' && (
                    <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-amber-400 rounded-full" />
                  )}
                </button>

                <button
                  id="feed-tab-following"
                  onClick={() => {
                    triggerHaptic('light');
                    if (!currentUser && onOpenLogin) {
                      onOpenLogin();
                    } else {
                      setFeedType('following');
                      setActiveSwipeIndex(0);
                    }
                  }}
                  className={`text-sm font-bold transition-all relative pb-1 cursor-pointer flex items-center gap-1 ${
                    feedType === 'following' ? 'text-white' : 'text-neutral-500 hover:text-neutral-300'
                  }`}
                >
                  Mengikuti
                  {!currentUser && <Lock className="w-3 h-3 text-neutral-500" />}
                  {feedType === 'following' && (
                    <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-amber-400 rounded-full" />
                  )}
                </button>

                <div className="hidden sm:flex items-center gap-1 text-[10px] font-mono font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  <span>cTrader Live</span>
                </div>
              </div>

              <div className="flex items-center gap-1.5">
                {/* Mode Switch Toggle Button (Labeled simply 'Switch') */}
                <button
                  id="btn-feed-mode-switch"
                  onClick={() => {
                    triggerHaptic('medium');
                    setViewMode('swipe_focus');
                  }}
                  className="px-2.5 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 border bg-[#141414] border-[#262626] text-neutral-200 hover:text-amber-400 hover:border-amber-500/40 transition-all cursor-pointer shadow-sm active:scale-95"
                  title="Ganti ke Switch"
                >
                  <Smartphone className="w-3.5 h-3.5 text-amber-400" />
                  <span>Switch</span>
                </button>

                <button
                  onClick={() => {
                    triggerHaptic('light');
                    onRefreshFeed();
                  }}
                  className="p-1.5 rounded-xl bg-[#141414] border border-[#222222] text-neutral-400 hover:text-white transition-colors cursor-pointer"
                  title="Refresh Feed"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Strategy DNA Horizontal Filter Pills */}
            <div className="flex gap-1.5 overflow-x-auto no-scrollbar px-2 pt-0.5">
              <button
                onClick={() => {
                  triggerHaptic('selection');
                  setSelectedStrategyFilter('ALL');
                  setActiveSwipeIndex(0);
                }}
                className={`whitespace-nowrap px-3 py-1 rounded-full text-xs font-bold transition-all cursor-pointer ${
                  selectedStrategyFilter === 'ALL'
                    ? 'bg-amber-500 text-black shadow-sm'
                    : 'bg-[#141414] border border-[#222222] text-neutral-400 hover:text-neutral-200'
                }`}
              >
                Semua DNA
              </button>
              {STRATEGY_LIST.map((strat) => (
                <button
                  key={strat.id}
                  onClick={() => {
                    triggerHaptic('selection');
                    setSelectedStrategyFilter(strat.id);
                    setActiveSwipeIndex(0);
                  }}
                  className={`whitespace-nowrap px-3 py-1 rounded-full text-xs font-semibold transition-all cursor-pointer ${
                    selectedStrategyFilter === strat.id
                      ? `${strat.badgeClass} border font-bold shadow-sm`
                      : 'bg-[#141414] border border-[#222222] text-neutral-400 hover:text-neutral-200'
                  }`}
                >
                  {strat.name}
                </button>
              ))}
            </div>
          </div>

          {/* Guest Mode Informational Banner */}
          {!currentUser && (
            <div className="mb-4 mx-1 p-3 rounded-2xl bg-gradient-to-r from-amber-500/10 via-neutral-900 to-emerald-500/10 border border-white/10 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-amber-500/20 flex items-center justify-center shrink-0">
                  <Zap className="w-4 h-4 text-amber-400" />
                </div>
                <div>
                  <div className="text-xs font-bold text-white">Mode Pratinjau Publik</div>
                  <div className="text-[10px] text-neutral-400">Masuk untuk unlock trade & mirror order.</div>
                </div>
              </div>
              {onOpenLogin && (
                <button
                  onClick={() => {
                    triggerHaptic('medium');
                    onOpenLogin();
                  }}
                  className="px-3 py-1.5 rounded-xl bg-white text-neutral-950 text-xs font-black shrink-0 hover:bg-neutral-100 transition-all cursor-pointer"
                >
                  Masuk
                </button>
              )}
            </div>
          )}
        </>
      )}

      {/* SKELETON LOADING STATE VS EMPTY STATE */}
      {isLoading ? (
        <FeedSkeleton />
      ) : filteredPosts.length === 0 ? (
        <div className="text-center py-16 px-4 bg-[#111111] rounded-3xl border border-[#1f1f1f] my-4">
          <div className="w-12 h-12 rounded-full bg-[#161616] border border-[#222222] flex items-center justify-center mx-auto text-neutral-500 mb-3">
            <Users className="w-6 h-6" />
          </div>
          <h4 className="text-white font-bold text-sm mb-1">
            {feedType === 'following' ? 'Belum Ada Trade dari Akun yang Diikuti' : 'Belum Ada Konten Trade'}
          </h4>
          <p className="text-xs text-neutral-400 max-w-xs mx-auto mb-4">
            {feedType === 'following'
              ? 'Buka tab "Untuk Anda" atau cari trader handal di tab Explore untuk mulai mengikuti setup trading mereka.'
              : 'Setup posisi trading cTrader dari trader yang Anda ikuti akan muncul secara otomatis di feed ini.'}
          </p>
          <button
            onClick={() => {
              triggerHaptic('medium');
              onRefreshFeed();
            }}
            className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs inline-flex items-center gap-1.5 shadow-lg shadow-amber-500/20 cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Segarkan Feed</span>
          </button>
        </div>
      ) : viewMode === 'swipe_focus' ? (
        /* MODE 1: TRULY FULL SCREEN SWITCH MODE (Only Header, Full-screen Card, & Bottom Nav) */
        <div 
          className="relative w-full h-full flex flex-col justify-between select-none p-1"
          onTouchStart={handleSwipeTouchStart}
          onTouchEnd={handleSwipeTouchEnd}
        >
          {/* Sleek Floating Header Overlay: Switch to Scroll & Post Counter */}
          <div className="w-full flex items-center justify-between px-2 py-1 shrink-0 z-20">
            {/* Scroll Button */}
            <button
              id="btn-feed-mode-scroll"
              onClick={() => {
                triggerHaptic('medium');
                setViewMode('scroll');
              }}
              className="px-2.5 py-1 rounded-full bg-[#141414]/90 backdrop-blur-md border border-[#2c2c2c] text-neutral-300 hover:text-white text-[11px] font-bold flex items-center gap-1.5 shadow-md active:scale-95 transition-all cursor-pointer"
              title="Ganti ke mode Scroll"
            >
              <Layers className="w-3 h-3 text-amber-400" />
              <span>Scroll</span>
            </button>

            {/* Post Counter & Up/Down Navigation */}
            <div className="flex items-center gap-1 bg-[#141414]/90 backdrop-blur-md px-2 py-0.5 rounded-full border border-[#2c2c2c] shadow-md">
              <span className="text-[10px] font-mono font-bold text-amber-300 px-1">
                {activeSwipeIndex + 1}/{filteredPosts.length}
              </span>
              <button
                onClick={handlePrevCard}
                disabled={activeSwipeIndex === 0}
                className="p-1 rounded-full text-neutral-400 hover:text-white disabled:opacity-20 active:scale-90 transition-all cursor-pointer"
                title="Post Sebelumnya"
              >
                <ChevronUp className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={handleNextCard}
                disabled={activeSwipeIndex === filteredPosts.length - 1}
                className="p-1 rounded-full text-neutral-400 hover:text-white disabled:opacity-20 active:scale-90 transition-all cursor-pointer"
                title="Post Selanjutnya"
              >
                <ChevronDown className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Full-Height Card */}
          <div className="flex-1 w-full relative min-h-0 py-0.5">
            <DynamicFeedTemplate
              key={filteredPosts[activeSwipeIndex]?.id}
              post={filteredPosts[activeSwipeIndex]}
              currentUser={currentUser}
              isHighlighted={highlightedPostId === filteredPosts[activeSwipeIndex]?.id}
              isFullScreen={true}
              onUnlock={onUnlockPost}
              onOpenDetail={onOpenDetail}
              onOpenFollowSetup={onOpenFollowSetup}
              onOpenAskAI={onOpenAskAI}
              onOpenComments={onOpenComments}
              onToggleLike={onToggleLike}
              onToggleSave={onToggleSave}
              onToggleFollow={onToggleFollow}
              onOpenPerformance={onOpenPerformance}
              onEditDescription={onEditDescription}
              onViewProfile={onViewProfile}
            />
          </div>
        </div>
      ) : (
        /* MODE 2: STANDARD INFINITE FEED (with individual horizontal card swipes & haptics) */
        <div className="space-y-4">
          {filteredPosts.map((post) => (
            <DynamicFeedTemplate
              key={post.id}
              post={post}
              currentUser={currentUser}
              isHighlighted={highlightedPostId === post.id}
              isFullScreen={false}
              onUnlock={onUnlockPost}
              onOpenDetail={onOpenDetail}
              onOpenFollowSetup={onOpenFollowSetup}
              onOpenAskAI={onOpenAskAI}
              onOpenComments={onOpenComments}
              onToggleLike={onToggleLike}
              onToggleSave={onToggleSave}
              onToggleFollow={onToggleFollow}
              onOpenPerformance={onOpenPerformance}
              onEditDescription={onEditDescription}
              onViewProfile={onViewProfile}
            />
          ))}

          {/* Infinite Scroll / Load More Trigger */}
          {hasMore && onLoadMore && (
            <div ref={sentinelRef} className="pt-2 pb-6 text-center">
              <button
                onClick={() => {
                  triggerHaptic('light');
                  onLoadMore();
                }}
                disabled={isLoadingMore}
                className="px-5 py-2.5 rounded-2xl bg-[#141414] hover:bg-[#1c1c1c] border border-[#2a2a2a] text-neutral-300 hover:text-white text-xs font-bold inline-flex items-center gap-2 transition-all cursor-pointer disabled:opacity-50"
              >
                {isLoadingMore ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin text-amber-400" />
                    <span>Memuat Trade Berikutnya...</span>
                  </>
                ) : (
                  <>
                    <span>Muat Lebih Banyak Trade</span>
                    <ChevronDown className="w-3.5 h-3.5 text-neutral-400" />
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

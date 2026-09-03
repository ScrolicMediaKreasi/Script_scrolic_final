import React, { useState, useRef, useEffect } from 'react';
import { 
  Heart, 
  MessageCircle, 
  Share2, 
  Bookmark, 
  Lock, 
  Unlock, 
  Sparkles, 
  Crown,
  CheckCircle2, 
  Edit3, 
  TrendingUp, 
  TrendingDown, 
  Clock, 
  ShieldCheck,
  Zap,
  Activity,
  Flame,
  BarChart2,
  Compass,
  Repeat,
  Shield,
  Radio,
  Anchor,
  Layers,
  ArrowLeft,
  ArrowRight
} from 'lucide-react';
import { FeedPost, Trade, User } from '../types';
import { getStrategy } from '../data/strategies';
import { PositionProgressBar } from './PositionProgressBar';
import { formatPrice, maskPartialPrice } from '../utils/formatters';
import { calculateCTraderPips } from '../utils/ctraderCalculations';
import { triggerHaptic } from '../utils/haptics';
import { updateSEOForFeedPost } from '../utils/seo';
import { livePositionStore } from '../services/livePositionStore';
import { getSymbolVisual } from '../utils/symbolVisuals';

interface DynamicFeedTemplateProps {
  post: FeedPost;
  currentUser: User | null;
  isHighlighted?: boolean;
  isFullScreen?: boolean;
  onUnlock: (post: FeedPost) => void;
  onOpenDetail: (post: FeedPost) => void;
  onOpenFollowSetup: (post: FeedPost) => void;
  onOpenAskAI: (post: FeedPost) => void;
  onOpenComments: (post: FeedPost) => void;
  onToggleLike: (post: FeedPost) => void;
  onToggleSave: (post: FeedPost) => void;
  onToggleFollow: (username: string) => void;
  onOpenPerformance?: (username: string) => void;
  onEditDescription?: (post: FeedPost) => void;
  onViewProfile?: (username: string) => void;
}

export const DynamicFeedTemplate: React.FC<DynamicFeedTemplateProps> = ({
  post,
  currentUser,
  isHighlighted = false,
  isFullScreen = false,
  onUnlock,
  onOpenDetail,
  onOpenFollowSetup,
  onOpenAskAI,
  onOpenComments,
  onToggleLike,
  onToggleSave,
  onToggleFollow,
  onOpenPerformance,
  onEditDescription,
  onViewProfile
}) => {
  const DEFAULT_AVATAR = 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200&auto=format&fit=crop&q=80';
  const user = post.user || {
    id: post.userId || 'trader',
    username: post.username || 'trader',
    displayName: post.username || 'Trader',
    avatar: post.avatar || DEFAULT_AVATAR,
    subscriptionTier: 'free',
    isVerified: false,
    role: 'user'
  };

  const avatarUrl = user.avatar && user.avatar.trim() !== '' ? user.avatar : DEFAULT_AVATAR;

  const strategyId = String(
    post.strategy?.id ||
    post.strategy_id ||
    (post as any).strategyId ||
    post.trade?.strategyId ||
    (post.user as any)?.primaryStrategyId ||
    (post.user as any)?.strategyDNA ||
    'breakout'
  );
  const rawTrade = post.trade || {
    id: post.trade_id || post.id,
    cTraderPositionId: post.trade_id || post.id || 'pos-881',
    accountId: post.account_id || '',
    userId: post.user_id || post.userId || '',
    symbol: post.symbol || 'XAUUSD',
    direction: post.position_type || 'BUY',
    volumeLot: post.lot || 1.0,
    entryPrice: post.entry_price || post.trade?.entryPrice || 0,
    currentPrice: post.current_price || post.trade?.currentPrice || post.entry_price || 0,
    stopLoss: post.stop_loss || (post as any).stopLoss || post.trade?.stopLoss || 0,
    takeProfit: post.take_profit || (post as any).takeProfit || post.trade?.takeProfit || 0,
    profitUSD: post.profit || 0,
    profitPercent: post.profit_percent || 0,
    pips: post.pips || 0,
    openTime: post.opened_at || new Date().toISOString(),
    duration: post.duration || 'Live',
    status: post.status || 'OPEN',
    strategyId
  };

  const strategy = getStrategy(strategyId);
  const defaultStrategyNote = strategy.defaultNote || strategy.description;
  const customDescription = post.customDescription || (post as any).custom_description;
  const autoDescription = post.autoDescription || (post as any).auto_description;
  const displayNote = customDescription || autoDescription || defaultStrategyNote;
  const [localTrade, setLocalTrade] = useState<Trade>(rawTrade as Trade);
  const trade = localTrade;
  const [isIntersecting, setIsIntersecting] = useState(false);
  const cardRef = useRef<HTMLElement>(null);

  const isOwner = Boolean(currentUser && (currentUser.id === post.userId || currentUser.username === user.username));
  const isPremiumUser = Boolean(user.subscriptionTier && user.subscriptionTier !== 'free');
  const isBuy = (trade.direction || 'BUY') === 'BUY';
  const isProfit = (trade?.profitUSD ?? 0) >= 0;
  const isOpen = (trade.status || 'OPEN') === 'OPEN';
  const isUnlocked = Boolean(post.isUnlocked || isOwner || trade.status === 'CLOSED');

  const displayProfitUSD = Number(localTrade.profitUSD ?? 0);
  const isPositiveProfit = displayProfitUSD >= 0;
  const displaySymbol = trade?.symbol && trade.symbol !== 'Unknown' ? trade.symbol : 'XAUUSD';
  const symbolVisual = getSymbolVisual(displaySymbol);

  // Sync server snapshots only when the underlying trade identity changes.
  // Otherwise the live tick state from the socket layer must remain the source of truth.
  useEffect(() => {
    if (!post.trade) return;

    setLocalTrade((prev) => {
      const prevId = prev?.id ?? '';
      const nextId = post.trade?.id ?? '';

      if (prevId && nextId && prevId === nextId) {
        const hasLiveTick = Number.isFinite(Number(prev.currentPrice)) && Number(prev.currentPrice) > 0;

        // Keep the socket-driven tick as the source of truth for an already-open trade.
        // Only accept the server snapshot when it is the first bootstrap or the live tick is empty.
        if (hasLiveTick) {
          return prev;
        }
      }

      return post.trade;
    });
  }, [post.id, post.trade?.id, post.trade?.currentPrice, post.trade?.entryPrice, post.trade?.pips, post.trade?.profitUSD]);

  // Viewport Observer for Offscreen Realtime Pausing
  useEffect(() => {
    const el = cardRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') {
      setIsIntersecting(true);
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsIntersecting(entry.isIntersecting);
      },
      { rootMargin: '100px 0px 100px 0px', threshold: 0.1 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Isolated Localized WebSocket Subscription
  useEffect(() => {
    if ((rawTrade.status || 'OPEN') !== 'OPEN' || !isIntersecting) return;
    const keys = [post.id, rawTrade.id, (rawTrade as any).positionId, rawTrade.cTraderPositionId].filter(Boolean);
    const unsubs = keys.map((k) =>
      livePositionStore.subscribe(String(k), (update) => {
        setLocalTrade((prev) => {
          const rawEntry = Number(update.entryPrice ?? update.entry);
          const rawCurrent = Number(update.currentPrice ?? update.current);
          const nextEntry = Number.isFinite(rawEntry) && rawEntry > 0 ? rawEntry : prev.entryPrice;
          const nextCurrent = Number.isFinite(rawCurrent) && rawCurrent > 0 ? rawCurrent : prev.currentPrice;
          const nextSymbol = String(update.symbol || prev.symbol || 'XAUUSD');
          const nextDirection = String((update as any).direction || (update as any).side || prev.direction || 'BUY').toUpperCase() as 'BUY' | 'SELL';
          const nextPips = Number.isFinite(update.pips) && update.pips !== null
            ? Number(update.pips)
            : calculateCTraderPips(nextSymbol, nextEntry, nextCurrent, nextDirection);

          return {
            ...prev,
            symbol: nextSymbol,
            direction: nextDirection,
            entryPrice: nextEntry,
            currentPrice: nextCurrent,
            pips: Number.isFinite(nextPips) ? nextPips : (prev.pips ?? 0),
            volumeLot: update.volumeLot ?? prev.volumeLot,
            profitUSD: update.profitUsd ?? update.profit ?? prev.profitUSD,
            profitPercent: update.profitPercent ?? prev.profitPercent,
            progress: update.progress ?? prev.progress,
            status: update.status ?? prev.status
          };
        });
      })
    );
    return () => unsubs.forEach((unsub) => unsub());
  }, [rawTrade.status, rawTrade.cTraderPositionId, isIntersecting, post.id, rawTrade.id]);

  const [copiedToast, setCopiedToast] = useState(false);
  const [doubleTapHeart, setDoubleTapHeart] = useState(false);
  const [showUnlockSparkle, setShowUnlockSparkle] = useState(false);
  const lastTapRef = useRef<number>(0);

  // Dynamic SEO & Schema.org JSON-LD Update (Zero Visual Change)
  useEffect(() => {
    if (post) {
      updateSEOForFeedPost(post);
    }
  }, [post.id]);

  const handleUnlockClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    triggerHaptic('heavy');
    setShowUnlockSparkle(true);
    setTimeout(() => setShowUnlockSparkle(false), 2400);
    onUnlock(post);
  };

  // Touch Swipe Gesture State
  const [dragOffset, setDragOffset] = useState<number>(0);
  const [isDragging, setIsDragging] = useState(false);
  const touchStartXRef = useRef<number>(0);
  const touchStartYRef = useRef<number>(0);
  const isHorizontalSwipeRef = useRef<boolean | null>(null);

  // Swipe Touch Handlers
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartXRef.current = e.touches[0].clientX;
    touchStartYRef.current = e.touches[0].clientY;
    isHorizontalSwipeRef.current = null;
    setIsDragging(true);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging) return;
    const currentX = e.touches[0].clientX;
    const currentY = e.touches[0].clientY;
    const deltaX = currentX - touchStartXRef.current;
    const deltaY = currentY - touchStartYRef.current;

    // Detect if the user is swiping horizontally rather than scrolling vertically
    if (isHorizontalSwipeRef.current === null) {
      if (Math.abs(deltaX) > 10 || Math.abs(deltaY) > 10) {
        isHorizontalSwipeRef.current = Math.abs(deltaX) > Math.abs(deltaY);
      }
    }

    if (isHorizontalSwipeRef.current) {
      // Damped horizontal drag
      const dampedOffset = deltaX * 0.75;
      // Cap drag limits between -120px and 120px
      const clampedOffset = Math.max(-120, Math.min(120, dampedOffset));
      setDragOffset(clampedOffset);
    }
  };

  const handleTouchEnd = () => {
    if (!isDragging) return;
    setIsDragging(false);

    // Swipe Threshold check (70px)
    if (dragOffset > 70) {
      // Swiped Right -> Quick Like action
      triggerHaptic('medium');
      onToggleLike(post);
      setDoubleTapHeart(true);
      setTimeout(() => setDoubleTapHeart(false), 800);
    } else if (dragOffset < -70) {
      // Swiped Left -> Quick Detail action
      triggerHaptic('medium');
      onOpenDetail(post);
    }

    // Reset offset with spring animation
    setDragOffset(0);
    isHorizontalSwipeRef.current = null;
  };

  // Double tap to like gesture
  const handleCardDoubleTap = () => {
    const now = Date.now();
    if (now - lastTapRef.current < 300) {
      triggerHaptic('success');
      if (!post.isLiked) {
        onToggleLike(post);
      }
      setDoubleTapHeart(true);
      setTimeout(() => setDoubleTapHeart(false), 900);
    }
    lastTapRef.current = now;
  };

  const handleShare = async (e: React.MouseEvent) => {
    e.stopPropagation();
    triggerHaptic('selection');
    const shareUrl = `${window.location.origin}/@${user.username}`;
    if (navigator.share) {
      try {
        await navigator.share({
          title: `Scrolic Trade: ${user.displayName} - ${trade.symbol} ${trade.direction}`,
          text: `Lihat live trade ${trade.symbol} ${trade.direction} (${strategy.name}) dari @${user.username} di Scrolic.`,
          url: shareUrl,
        });
      } catch (err) {
        // user cancelled or share failed
      }
    } else {
      navigator.clipboard.writeText(shareUrl);
      setCopiedToast(true);
      setTimeout(() => setCopiedToast(false), 2500);
    }
  };

  const handleFollowClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    triggerHaptic('medium');
    onToggleFollow(user.username);
  };

  return (
    <article 
      ref={cardRef}
      id={`feed-post-${post.id}`}
      onClick={handleCardDoubleTap}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      style={{
        transform: `translateX(${dragOffset}px)`,
        transition: isDragging ? 'none' : 'transform 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275), box-shadow 0.3s',
        borderColor: isHighlighted 
          ? '#F59E0B' 
          : isPremiumUser 
          ? `${strategy.accentColor}70` 
          : '#262626',
        boxShadow: isHighlighted 
          ? '0 0 30px rgba(245,158,11,0.35)' 
          : isPremiumUser 
          ? `0 14px 38px -6px ${strategy.accentColor}30, 0 0 20px -3px ${strategy.accentColor}20` 
          : '0 4px 20px -2px rgba(0,0,0,0.6)'
      }}
      className={`w-full max-w-md mx-auto rounded-3xl relative overflow-hidden bg-[#111111] border transition-all duration-300 select-none ${
        isFullScreen 
          ? 'h-full flex flex-col justify-between mb-0 border-[#262626] shadow-2xl' 
          : 'mb-5'
      } ${
        isHighlighted 
          ? 'ring-4 ring-amber-400/30 scale-[1.01]' 
          : ''
      }`}
    >
      {/* Top Subtle Accent Bar */}
      {isPremiumUser && (
        <div 
          className={`h-1 w-full bg-gradient-to-r ${strategy.positionBarGradient}`}
          style={{ opacity: 0.9 }}
        />
      )}

      {/* Visual Swipe Indicators when dragging */}
      {dragOffset > 25 && (
        <div className="absolute left-3 top-1/2 -translate-y-1/2 z-30 bg-rose-500/90 text-white px-3 py-1.5 rounded-full flex items-center gap-1.5 text-xs font-bold shadow-lg animate-pulse pointer-events-none">
          <Heart className="w-4 h-4 fill-white" />
          <span>Geser untuk Suka</span>
        </div>
      )}
      {dragOffset < -25 && (
        <div className="absolute right-3 top-1/2 -translate-y-1/2 z-30 bg-amber-500/90 text-black px-3 py-1.5 rounded-full flex items-center gap-1.5 text-xs font-bold shadow-lg animate-pulse pointer-events-none">
          <span>Detail Trade</span>
          <ArrowRight className="w-4 h-4" />
        </div>
      )}

      {/* Double Tap Big Heart Overlay Animation */}
      {doubleTapHeart && (
        <div className="absolute inset-0 z-40 flex items-center justify-center pointer-events-none animate-in zoom-in-50 fade-out duration-700">
          <div className="p-4 rounded-full bg-black/60 backdrop-blur-md border border-rose-500/40 shadow-2xl">
            <Heart className="w-16 h-16 fill-rose-500 text-rose-500 drop-shadow-[0_0_15px_rgba(244,63,94,0.8)]" />
          </div>
        </div>
      )}

      {/* Unlock Setup Celebratory Particle & Flash Overlay */}
      {showUnlockSparkle && (
        <div className="absolute inset-0 z-40 flex flex-col items-center justify-center bg-black/70 backdrop-blur-sm pointer-events-none animate-in fade-in zoom-in duration-300">
          <div className="relative flex flex-col items-center gap-2 p-5 rounded-3xl bg-gradient-to-b from-[#181818] to-[#0d0d0d] border border-amber-500/50 shadow-2xl shadow-amber-500/20 text-center animate-bounce">
            <div className="w-14 h-14 rounded-2xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 shadow-inner">
              <Sparkles className="w-8 h-8 animate-spin" />
            </div>
            <span className="text-sm font-black text-white font-display">
              Setup Berhasil Terbuka!
            </span>
            <span className="text-[11px] text-amber-300/90 font-medium max-w-[200px]">
              Level Stop Loss & Take Profit presisi kini aktif untuk trading.
            </span>
          </div>
        </div>
      )}

      {/* Strategy Aesthetic Glow Layer (Enhanced for Premium) */}
      <div 
        className={`absolute -top-20 -right-20 w-64 h-64 rounded-full blur-3xl pointer-events-none ${
          isPremiumUser ? 'opacity-30' : 'opacity-10'
        } bg-gradient-to-br ${strategy.gradient}`} 
      />
      {isPremiumUser && (
        <div 
          className="absolute -bottom-24 -left-24 w-52 h-52 rounded-full blur-3xl pointer-events-none opacity-15"
          style={{ backgroundColor: strategy.accentColor }}
        />
      )}

      {/* Card Header: Trader Identity */}
      <div className="p-4 flex items-center justify-between border-b border-[#1f1f1f] relative z-10">
        <div 
          className="flex items-center gap-3 cursor-pointer group"
          onClick={(e) => {
            e.stopPropagation();
            triggerHaptic('light');
            if (onViewProfile) onViewProfile(user.username);
          }}
        >
          {/* Avatar with cTrader indicator & Dynamic Strategy Ring */}
          <div className="relative shrink-0">
            <div 
              className={`w-11 h-11 rounded-full aspect-square overflow-hidden flex items-center justify-center transition-all duration-300 ${
                isPremiumUser ? 'p-[2px] shadow-sm' : 'border border-[#2e2e2e]'
              }`}
              style={
                isPremiumUser 
                  ? { background: `linear-gradient(135deg, ${strategy.accentColor}, #F59E0B)` } 
                  : {}
              }
            >
              <img 
                src={avatarUrl} 
                alt={user.username} 
                referrerPolicy="no-referrer"
                onClick={(e) => {
                  e.stopPropagation();
                  onViewProfile?.(user.username);
                }}
                className="w-full h-full rounded-full aspect-square object-cover group-hover:opacity-90 transition-opacity shrink-0"
              />
            </div>
            {user.cTraderConnected && (
              <span className="absolute -bottom-1 -right-1 w-4 h-4 bg-emerald-500 rounded-full border-2 border-[#111111] flex items-center justify-center shadow-sm shrink-0" title="Connected to cTrader Open API">
                <CheckCircle2 className="w-2.5 h-2.5 text-white" />
              </span>
            )}
          </div>

          <div>
            <div className="flex items-center gap-1.5">
              <span className="font-semibold text-neutral-100 text-sm tracking-tight group-hover:text-amber-300 transition-colors">
                {user.displayName}
              </span>
              {user.isVerified && (
                <ShieldCheck className="w-4 h-4 text-sky-400 fill-sky-400/20 shrink-0" />
              )}
            </div>
            <div className="flex items-center gap-2 text-xs text-neutral-400">
              <span>@{user.username}</span>
              <span>•</span>
              <span className="flex items-center gap-1 text-[11px] text-neutral-500">
                <Clock className="w-3 h-3 text-neutral-500 shrink-0" />
                {trade.duration || 'Live'}
              </span>
            </div>
          </div>
        </div>

        {/* Status Badge */}
        <div className="flex flex-col items-end gap-1.5 shrink-0">
          <div className="flex items-center gap-1.5">
            {isOpen ? (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                LIVE OP
              </span>
            ) : (
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-[#1a1a1a] text-neutral-400 border border-[#262626]">
                CLOSED
              </span>
            )}
          </div>

        </div>
      </div>

      {/* Card Body: Dynamic Trading Content */}
      <div className={`p-4 ${isFullScreen ? 'flex-1 flex flex-col justify-around py-3 space-y-3 overflow-y-auto no-scrollbar' : 'space-y-4'} relative z-10`}>
        
        {/* Symbol & Direction Bar */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {symbolVisual?.kind === 'image' && (
              <img
                src={symbolVisual.src}
                alt={symbolVisual.alt}
                className="h-5 w-5 shrink-0 object-contain"
              />
            )}
            {symbolVisual?.kind === 'flags' && (
              <span className="inline-flex shrink-0 items-center gap-0.5 text-base leading-none" aria-label={`${displaySymbol} currencies`}>
                <span>{symbolVisual.base}</span>
                <span>{symbolVisual.quote}</span>
              </span>
            )}
            <span className="text-xl font-extrabold tracking-tight text-white font-display">
              {displaySymbol}
            </span>
          </div>

          {/* Floating P/L */}
          <div className="text-right">
            <div className={`text-[1.5rem] font-black font-mono leading-none ${isPositiveProfit ? 'text-emerald-400' : 'text-rose-400'}`}>
              {isPositiveProfit ? '+$' : '-$'}{Math.abs(displayProfitUSD).toFixed(2)}
            </div>
            <div className="mt-1 text-xs text-neutral-400 font-mono">
              ({isPositiveProfit ? '+' : ''}{(localTrade.profitPercent ?? 0).toFixed(2)}%)
            </div>
          </div>
        </div>

        {/* Position Progress Bar (Visible in Both Locked & Unlocked states) */}
        <div className="relative">
          <PositionProgressBar 
            trade={localTrade} 
            isLocked={!isUnlocked} 
            strategyGradient={strategy.positionBarGradient} 
            strategyName={strategy.name}
            strategyAccentColor={isPremiumUser ? strategy.accentColor : undefined}
            strategyBadgeClass={isPremiumUser ? undefined : strategy.badgeClass}
          />
        </div>

        {/* Metrics Bar: Full Precision (Unlocked) vs Partially Masked (Locked) */}
        {isUnlocked ? (
          <div className="grid grid-cols-4 gap-2 bg-[#161616] rounded-2xl p-2.5 border border-[#222222] text-center text-xs font-mono">
            <div>
              <span className="text-[10px] text-neutral-400 block font-sans">Volume</span>
              <span className="font-semibold text-neutral-200">{trade.volumeLot} Lot</span>
            </div>
            <div>
              <span className="text-[10px] text-neutral-400 block font-sans">Entry</span>
              <span className="font-semibold text-neutral-200">{formatPrice(trade.entryPrice, trade.symbol)}</span>
            </div>
            <div>
              <span className="text-[10px] text-neutral-400 block font-sans">Stop Loss</span>
              <span className="font-semibold text-rose-400">{trade.stopLoss > 0 ? formatPrice(trade.stopLoss, trade.symbol) : '-'}</span>
            </div>
            <div>
              <span className="text-[10px] text-neutral-400 block font-sans">Take Profit</span>
              <span className="font-semibold text-emerald-400">{trade.takeProfit > 0 ? formatPrice(trade.takeProfit, trade.symbol) : '-'}</span>
            </div>
          </div>
        ) : (
          <div 
            className={`rounded-2xl p-2.5 flex flex-col sm:flex-row items-center justify-between gap-2.5 transition-all ${
              isPremiumUser 
                ? 'bg-[#121212] border' 
                : 'bg-[#111111] border border-amber-500/20'
            }`}
            style={
              isPremiumUser 
                ? { borderColor: `${strategy.accentColor}40`, backgroundColor: `${strategy.accentColor}08` } 
                : {}
            }
          >
            <div className="grid grid-cols-4 gap-2 w-full sm:w-auto flex-1 text-center text-xs font-mono">
              <div className="bg-[#161616] py-1.5 px-1 rounded-lg border border-white/5">
                <span className="text-[9px] text-neutral-400 block font-sans">Volume</span>
                <span className="font-semibold text-neutral-400 tracking-wider">0.x Lot</span>
              </div>
              <div className="bg-[#161616] py-1.5 px-1 rounded-lg border border-white/5">
                <span className="text-[9px] text-neutral-400 block font-sans flex items-center justify-center gap-0.5">
                  <Lock className="w-2 h-2 text-amber-400/80" /> Entry
                </span>
                <span className="font-semibold text-amber-200 tracking-wider">
                  {maskPartialPrice(trade.entryPrice, trade.symbol)}
                </span>
              </div>
              <div className="bg-[#161616] py-1.5 px-1 rounded-lg border border-white/5">
                <span className="text-[9px] text-neutral-400 block font-sans flex items-center justify-center gap-0.5">
                  <Lock className="w-2 h-2 text-rose-400/80" /> SL
                </span>
                <span className="font-semibold text-rose-300 tracking-wider">
                  {trade.stopLoss > 0 ? maskPartialPrice(trade.stopLoss, trade.symbol) : '-'}
                </span>
              </div>
              <div className="bg-[#161616] py-1.5 px-1 rounded-lg border border-white/5">
                <span className="text-[9px] text-neutral-400 block font-sans flex items-center justify-center gap-0.5">
                  <Lock className="w-2 h-2 text-emerald-400/80" /> TP
                </span>
                <span className="font-semibold text-emerald-300 tracking-wider">
                  {trade.takeProfit > 0 ? maskPartialPrice(trade.takeProfit, trade.symbol) : '-'}
                </span>
              </div>
            </div>

            <button
              id={`btn-unlock-${post.id}`}
              onClick={handleUnlockClick}
              style={
                isPremiumUser 
                  ? { 
                      background: `linear-gradient(135deg, ${strategy.accentColor}, #F59E0B)`,
                      boxShadow: `0 4px 15px -2px ${strategy.accentColor}40`
                    } 
                  : {}
              }
              className="w-full sm:w-auto px-3.5 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-black text-xs font-black shadow-md shadow-amber-500/20 flex items-center justify-center gap-1.5 transition-transform active:scale-95 cursor-pointer whitespace-nowrap"
            >
              <Zap className="w-3.5 h-3.5 fill-black" />
              <span>Buka Presisi - {post.unlockFee || 1} Energy</span>
            </button>
          </div>
        )}

        {/* Description Section */}
        <div className="bg-[#141414] rounded-2xl p-3 border border-[#222222] text-xs leading-relaxed text-neutral-300">
          <div className="flex items-start justify-between gap-2">
            <p className="flex-1">
              {displayNote}
            </p>
            {isOwner && onEditDescription && (
              <button
                id={`btn-edit-desc-${post.id}`}
                onClick={(e) => {
                  e.stopPropagation();
                  triggerHaptic('light');
                  onEditDescription(post);
                }}
                className="px-2 py-1 rounded bg-[#1f1f1f] text-neutral-300 hover:text-amber-400 hover:bg-[#282828] transition-colors cursor-pointer flex items-center gap-1 text-[11px] font-semibold shrink-0"
                title="Atur Deskripsi & Biaya"
              >
                <Edit3 className="w-3 h-3 text-amber-400" />
                <span>Atur Setup</span>
              </button>
            )}
          </div>
          {customDescription && (
            <span className="block mt-1 text-[10px] text-amber-400/80 font-medium">
              Catatan khusus dari @{user.username}
            </span>
          )}
          {isOwner && (
            <div className="mt-2 pt-2 border-t border-[#222222] flex items-center justify-between text-[10px] text-neutral-400 font-mono">
              <span>Biaya Setup Anda:</span>
              <span className="text-amber-300 font-bold">
                Unlock: {post.unlockFee || 1}⚡ • Follow: {post.followFee || 1}⚡ (Bagi Hasil 80%)
              </span>
            </div>
          )}
        </div>

        {/* CTAs Bar (When Unlocked) */}
        {isUnlocked && (
          <div className={`grid ${isOpen ? 'grid-cols-2' : 'grid-cols-1'} gap-2 pt-1`}>
            {isOpen && (
              <button
                id={`btn-follow-setup-${post.id}`}
                onClick={(e) => {
                  e.stopPropagation();
                  triggerHaptic('heavy');
                  onOpenFollowSetup(post);
                }}
                className="w-full py-2.5 px-3 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-xs font-bold flex items-center justify-center gap-1.5 transition-all active:scale-95 cursor-pointer"
              >
                <Zap className="w-3.5 h-3.5 fill-emerald-400" />
                <span>Ikuti Setup - {post.followFee || 1} Energy</span>
              </button>
            )}

            {isOpen ? (
              <button
                id={`btn-ask-ai-${post.id}`}
                onClick={(e) => {
                  e.stopPropagation();
                  triggerHaptic('medium');
                  onOpenAskAI(post);
                }}
                className="w-full py-2.5 px-3 rounded-xl bg-purple-500/10 hover:bg-purple-500/20 text-purple-300 border border-purple-500/30 text-xs font-bold flex items-center justify-center gap-1.5 transition-all active:scale-95 cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5 text-purple-400" />
                <span>Tanya AI - 1 Energy</span>
              </button>
            ) : (
              <button
                id={`btn-performance-detail-${post.id}`}
                onClick={(e) => {
                  e.stopPropagation();
                  triggerHaptic('light');
                  onOpenPerformance?.(user.username);
                }}
                disabled={!onOpenPerformance}
                className="w-full py-2.5 px-3 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 disabled:opacity-50 text-emerald-300 border border-emerald-500/30 text-xs font-bold flex items-center justify-center gap-1.5 transition-all active:scale-95 cursor-pointer"
              >
                <BarChart2 className="w-3.5 h-3.5 text-emerald-400" />
                <span>Lihat Performance Detail</span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* Card Footer: Social Interaction Bar */}
      <div className="px-4 py-3 border-t border-[#1f1f1f] bg-[#0A0A0A] flex items-center justify-between relative z-10 text-neutral-400">
        <div className="flex items-center gap-4">
          {/* Like Button */}
          <button
            id={`btn-like-${post.id}`}
            onClick={(e) => {
              e.stopPropagation();
              triggerHaptic('medium');
              onToggleLike(post);
            }}
            className={`flex items-center gap-1.5 text-xs font-medium transition-transform active:scale-110 cursor-pointer ${
              post.isLiked ? 'text-rose-400' : 'hover:text-neutral-200'
            }`}
          >
            <Heart className={`w-4 h-4 ${post.isLiked ? 'fill-rose-500 text-rose-500' : ''}`} />
            <span>{post.likesCount}</span>
          </button>

          {/* Comments Button */}
          <button
            id={`btn-comment-${post.id}`}
            onClick={(e) => {
              e.stopPropagation();
              triggerHaptic('light');
              onOpenComments(post);
            }}
            className="flex items-center gap-1.5 text-xs font-medium hover:text-neutral-200 transition-colors cursor-pointer"
          >
            <MessageCircle className="w-4 h-4" />
            <span>{post.commentsCount}</span>
          </button>

          {/* Share Button */}
          <button
            id={`btn-share-${post.id}`}
            onClick={handleShare}
            className="flex items-center gap-1.5 text-xs font-medium hover:text-neutral-200 transition-colors cursor-pointer"
          >
            <Share2 className="w-4 h-4" />
            <span>Bagikan</span>
          </button>
        </div>

        <div className="flex items-center gap-2">
          {/* Save / Bookmark Button */}
          <button
            id={`btn-save-${post.id}`}
            onClick={(e) => {
              e.stopPropagation();
              triggerHaptic('medium');
              onToggleSave(post);
            }}
            className={`p-1.5 rounded-xl transition-all cursor-pointer ${
              post.isSaved ? 'text-amber-400 bg-amber-500/10' : 'hover:text-neutral-200 hover:bg-[#1a1a1a]'
            }`}
            title="Simpan Setup"
          >
            <Bookmark className={`w-4 h-4 ${post.isSaved ? 'fill-amber-400' : ''}`} />
          </button>

          {/* Detail View Shortcut */}
          <button
            id={`btn-view-detail-${post.id}`}
            onClick={(e) => {
              e.stopPropagation();
              triggerHaptic('light');
              onOpenDetail(post);
            }}
            className="px-2.5 py-1 rounded-xl bg-[#1a1a1a] hover:bg-[#252525] border border-[#262626] text-[11px] font-semibold text-neutral-200 transition-colors cursor-pointer"
          >
            Detail
          </button>
        </div>
      </div>

      {/* Subtle Swipe Guidance Hint Footer */}
      <div className="px-4 py-1 bg-[#070707] border-t border-[#171717] flex items-center justify-between text-[9px] text-neutral-400">
        <span className="flex items-center gap-1">
          <ArrowRight className="w-2.5 h-2.5 text-rose-500" />
          <span>Geser Kanan: Suka</span>
        </span>
        <span className="text-neutral-400">Double tap untuk Suka</span>
        <span className="flex items-center gap-1">
          <span>Geser Kiri: Detail</span>
          <ArrowLeft className="w-2.5 h-2.5 text-amber-500" />
        </span>
      </div>

      {/* Copy Toast Indicator */}
      {copiedToast && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 bg-amber-500 text-black text-xs font-bold px-3 py-1 rounded-full shadow-lg z-30 animate-bounce">
          Link profile berhasil disalin!
        </div>
      )}
    </article>
  );
};

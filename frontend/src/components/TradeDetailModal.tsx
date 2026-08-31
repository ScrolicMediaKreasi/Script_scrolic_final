import React, { useEffect } from 'react';
import { 
  X, 
  TrendingUp, 
  TrendingDown, 
  Clock, 
  ShieldCheck, 
  Sparkles, 
  Crown,
  Zap, 
  Lock, 
  CheckCircle2,
  Calendar,
  AlertCircle
} from 'lucide-react';
import { FeedPost, User } from '../types';
import { PositionProgressBar } from './PositionProgressBar';
import { formatPrice, maskPartialPrice } from '../utils/formatters';
import { updateSEOForFeedPost } from '../utils/seo';

interface TradeDetailModalProps {
  post: FeedPost | null;
  currentUser: User | null;
  onClose: () => void;
  onUnlock: (post: FeedPost) => void;
  onOpenFollowSetup: (post: FeedPost) => void;
  onOpenAskAI: (post: FeedPost) => void;
}

export const TradeDetailModal: React.FC<TradeDetailModalProps> = ({
  post,
  currentUser,
  onClose,
  onUnlock,
  onOpenFollowSetup,
  onOpenAskAI
}) => {
  useEffect(() => {
    if (post) {
      updateSEOForFeedPost(post);
    }
  }, [post?.id]);

  if (!post) return null;

  const { user, trade, strategy } = post;
  const isPremiumUser = user.subscriptionTier && user.subscriptionTier !== 'free';
  const isOwner = Boolean(currentUser && currentUser.id === post.userId);
  const isBuy = trade.direction === 'BUY';
  const isProfit = (trade?.profitUSD ?? 0) >= 0;
  const isOpen = trade.status === 'OPEN';
  const isUnlocked = post.isUnlocked || isOwner || trade.status === 'CLOSED';

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-200">
      <div 
        id="trade-detail-sheet"
        style={
          isPremiumUser 
            ? { borderColor: `${strategy.accentColor}60`, boxShadow: `0 20px 50px -10px ${strategy.accentColor}30` }
            : {}
        }
        className="w-full max-w-lg bg-[#0A0A0A] border border-[#1f1f1f] rounded-t-3xl sm:rounded-2xl max-h-[92vh] flex flex-col overflow-hidden shadow-2xl relative"
      >
        {/* Top Strategy Stripe */}
        {isPremiumUser && (
          <div 
            className={`h-1.5 w-full bg-gradient-to-r ${strategy.positionBarGradient}`}
          />
        )}

        {/* Header */}
        <div className="p-4 border-b border-[#1f1f1f] flex items-center justify-between bg-[#0e0e0e]">
          <div className="flex items-center gap-3">
            <div 
              className={`rounded-full ${isPremiumUser ? 'p-[2px]' : ''}`}
              style={
                isPremiumUser 
                  ? { background: `linear-gradient(135deg, ${strategy.accentColor}, #F59E0B)` } 
                  : {}
              }
            >
              <img 
                src={user.avatar} 
                alt={user.username} 
                referrerPolicy="no-referrer"
                className="w-10 h-10 rounded-full object-cover border border-[#2a2a2a]"
              />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-bold text-white text-sm">@{user.username}</span>
                {user.isVerified && <ShieldCheck className="w-4 h-4 text-sky-400" />}
                {isPremiumUser ? (
                  <span 
                    className="px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider border flex items-center gap-0.5"
                    style={{
                      backgroundColor: `${strategy.accentColor}25`,
                      color: strategy.accentColor,
                      borderColor: `${strategy.accentColor}60`
                    }}
                  >
                    <Crown className="w-2.5 h-2.5 fill-current" /> PRO
                  </span>
                ) : (
                  <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-[#1a1a1a] text-neutral-400 border border-[#2a2a2a]">
                    FREE
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 mt-0.5">
                <span 
                  className={`inline-block text-[11px] font-semibold px-2 py-0.5 rounded-md border ${
                    isPremiumUser ? '' : strategy.badgeClass
                  }`}
                  style={
                    isPremiumUser 
                      ? { 
                          backgroundColor: `${strategy.accentColor}20`, 
                          color: strategy.accentColor, 
                          borderColor: `${strategy.accentColor}55` 
                        } 
                      : {}
                  }
                >
                  {strategy.name}
                </span>
                <span className="text-[10px] text-neutral-400">{strategy.tagline}</span>
              </div>
            </div>
          </div>
          <button
            id="btn-close-detail-modal"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-[#161616] border border-[#222222] hover:bg-[#222222] flex items-center justify-center text-neutral-400 hover:text-white transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Scroll Content */}
        <div className="p-5 overflow-y-auto space-y-5 flex-1 no-scrollbar">
          
          {/* Symbol & Direction Summary */}
          <div className="flex items-center justify-between bg-[#111111] p-4 rounded-2xl border border-[#1f1f1f]">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-2xl font-black text-white font-display tracking-tight">{trade?.symbol && trade.symbol !== 'Unknown' ? trade.symbol : 'XAUUSD'}</span>
                <span className={`px-2.5 py-1 rounded-md text-xs font-black tracking-wider uppercase ${
                  isBuy ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40' : 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                }`}>
                  {isBuy ? <TrendingUp className="w-3.5 h-3.5 inline mr-1" /> : <TrendingDown className="w-3.5 h-3.5 inline mr-1" />}
                  {trade.direction}
                </span>
              </div>
              <span className="text-xs text-neutral-400 mt-1 block">
                Position ID: <span className="font-mono text-neutral-300">{trade.cTraderPositionId}</span>
              </span>
            </div>

            <div className="text-right">
              <div className={`text-xl font-bold font-mono ${isProfit ? 'text-emerald-400' : 'text-rose-400'}`}>
                {isProfit ? '+' : ''}{(trade.pips ?? 0).toFixed(1)} Pips
              </div>
              <div className="text-xs text-neutral-400 font-mono">
                {isProfit ? '+$' : '-$'}{Math.abs(trade.profitUSD ?? 0).toFixed(2)} ({isProfit ? '+' : ''}{(trade.profitPercent ?? 0).toFixed(2)}%)
              </div>
            </div>
          </div>

          {/* Position Progress Bar */}
          <div>
            <span className="text-xs font-bold text-neutral-400 uppercase tracking-wider mb-2 block">
              Live Position Progress
            </span>
            <PositionProgressBar 
              trade={trade} 
              isLocked={!isUnlocked} 
              strategyGradient={strategy.positionBarGradient} 
            />
          </div>

          {/* Locked vs Unlocked Metrics Grid */}
          {!isUnlocked ? (
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-amber-500/20 text-amber-400 flex items-center justify-center">
                    <Lock className="w-3.5 h-3.5" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-white">Detail Level Presisi Terkunci Sebagian</h4>
                    <p className="text-[10px] text-neutral-400">Progress bar tetap live; buka nilai digit eksak dengan 1 Energy.</p>
                  </div>
                </div>
              </div>

              {/* Partially masked grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center font-mono text-xs">
                <div className="bg-[#141414] border border-[#222222] p-2.5 rounded-xl">
                  <span className="text-[10px] text-neutral-400 block font-sans">Volume</span>
                  <span className="font-semibold text-neutral-400 tracking-wider">0.x Lot</span>
                </div>
                <div className="bg-[#141414] border border-[#222222] p-2.5 rounded-xl">
                  <span className="text-[10px] text-neutral-400 block font-sans">Entry Price</span>
                  <span className="font-semibold text-amber-200 tracking-wider">{maskPartialPrice(trade.entryPrice, trade.symbol)}</span>
                </div>
                <div className="bg-[#141414] border border-[#222222] p-2.5 rounded-xl">
                  <span className="text-[10px] text-neutral-400 block font-sans">Stop Loss</span>
                  <span className="font-semibold text-rose-300 tracking-wider">{trade.stopLoss > 0 ? maskPartialPrice(trade.stopLoss, trade.symbol) : '-'}</span>
                </div>
                <div className="bg-[#141414] border border-[#222222] p-2.5 rounded-xl">
                  <span className="text-[10px] text-neutral-400 block font-sans">Take Profit</span>
                  <span className="font-semibold text-emerald-300 tracking-wider">{trade.takeProfit > 0 ? maskPartialPrice(trade.takeProfit, trade.symbol) : '-'}</span>
                </div>
              </div>

              <button
                id="btn-modal-unlock"
                onClick={() => onUnlock(post)}
                className="w-full py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-extrabold text-xs shadow-lg shadow-amber-500/20 flex items-center justify-center gap-1.5 transition-transform active:scale-95 cursor-pointer"
              >
                <Zap className="w-4 h-4 fill-black" />
                <span>Buka Detail Presisi - {post.unlockFee || 1} Energy</span>
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <span className="text-xs font-bold text-neutral-400 uppercase tracking-wider block">
                Parameter Trading Lengkap
              </span>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                <div className="bg-[#141414] border border-[#222222] p-3 rounded-xl">
                  <span className="text-[11px] text-neutral-400 block">Entry Price</span>
                  <span className="text-sm font-bold font-mono text-neutral-100">{formatPrice(trade.entryPrice, trade.symbol)}</span>
                </div>
                <div className="bg-[#141414] border border-[#222222] p-3 rounded-xl">
                  <span className="text-[11px] text-neutral-400 block">Current Price</span>
                  <span className="text-sm font-bold font-mono text-neutral-100">{formatPrice(trade.currentPrice, trade.symbol)}</span>
                </div>
                <div className="bg-[#141414] border border-[#222222] p-3 rounded-xl">
                  <span className="text-[11px] text-neutral-400 block">Volume Lot</span>
                  <span className="text-sm font-bold font-mono text-neutral-100">{trade.volumeLot} Lot</span>
                </div>
                <div className="bg-[#141414] border border-[#222222] p-3 rounded-xl">
                  <span className="text-[11px] text-neutral-400 block">Stop Loss</span>
                  <span className="text-sm font-bold font-mono text-red-400">{trade.stopLoss > 0 ? formatPrice(trade.stopLoss, trade.symbol) : 'None'}</span>
                </div>
                <div className="bg-[#141414] border border-[#222222] p-3 rounded-xl">
                  <span className="text-[11px] text-neutral-400 block">Take Profit</span>
                  <span className="text-sm font-bold font-mono text-emerald-400">{trade.takeProfit > 0 ? formatPrice(trade.takeProfit, trade.symbol) : 'None'}</span>
                </div>
                <div className="bg-[#141414] border border-[#222222] p-3 rounded-xl">
                  <span className="text-[11px] text-neutral-400 block">Risk:Reward Setup</span>
                  <span className="text-sm font-bold font-mono text-amber-400">{trade.rrRatio || '1:2.5'}</span>
                </div>
              </div>

              {/* Execution Details */}
              <div className="bg-[#111111] border border-[#1f1f1f] rounded-xl p-3 text-xs space-y-1.5 text-neutral-400">
                <div className="flex justify-between">
                  <span>Waktu Buka</span>
                  <span className="text-neutral-200 font-mono">
                    {trade.openTime ? new Date(trade.openTime).toLocaleString('id-ID') : '-'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Durasi Berjalan</span>
                  <span className="text-neutral-200 font-mono">{trade.duration || 'Live'}</span>
                </div>
                <div className="flex justify-between">
                  <span>Status Eksekusi</span>
                  <span className={`font-semibold ${trade.status === 'OPEN' ? 'text-emerald-400' : 'text-neutral-300'}`}>
                    {trade.status === 'OPEN' ? '● Posisi Aktif di cTrader' : '✓ Posisi Ditutup (Portfolio)'}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Trade Description */}
          <div className="bg-[#111111] rounded-xl p-3.5 border border-[#1f1f1f] text-xs text-neutral-300 leading-relaxed">
            <span className="text-neutral-400 font-semibold block mb-1">Catatan Analisis:</span>
            <p>{post.customDescription || post.autoDescription}</p>
          </div>
        </div>

        {/* Modal Footer with CTAs */}
        {isUnlocked && (
          <div className={`p-4 border-t border-[#1f1f1f] bg-[#0c0c0c] grid ${isOpen ? 'grid-cols-2' : 'grid-cols-1'} gap-3`}>
            {isOpen && (
              <button
                id="btn-modal-follow-setup"
                onClick={() => {
                  onClose();
                  onOpenFollowSetup(post);
                }}
                className="py-3 px-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-black text-xs flex items-center justify-center gap-1.5 shadow-lg shadow-emerald-500/20 active:scale-95 transition-transform cursor-pointer"
              >
                <Zap className="w-4 h-4 fill-black" />
                <span>Ikuti Setup - {post.followFee || 1} Energy</span>
              </button>
            )}

            <button
              id="btn-modal-ask-ai"
              onClick={() => {
                onClose();
                onOpenAskAI(post);
              }}
              className="py-3 px-3 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-black text-xs flex items-center justify-center gap-1.5 shadow-lg shadow-purple-600/20 active:scale-95 transition-transform cursor-pointer"
            >
              <Sparkles className="w-4 h-4 text-white" />
              <span>Tanya AI - 1 Energy</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

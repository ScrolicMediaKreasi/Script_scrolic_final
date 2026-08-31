import React, { useState } from 'react';
import { 
  Search, 
  TrendingUp, 
  ShieldCheck, 
  Users, 
  Award, 
  Zap, 
  Sparkles, 
  ChevronRight,
  Flame
} from 'lucide-react';
import { User, FeedPost } from '../types';
import { STRATEGY_LIST } from '../data/strategies';

interface ExploreViewProps {
  users: User[];
  posts: FeedPost[];
  currentUser: User | null;
  onViewProfile: (username: string) => void;
  onToggleFollow: (username: string) => void;
  onOpenDetail: (post: FeedPost) => void;
  onOpenPromotionPage?: (username: string) => void;
}

export const ExploreView: React.FC<ExploreViewProps> = ({
  users,
  posts,
  currentUser,
  onViewProfile,
  onToggleFollow,
  onOpenDetail,
  onOpenPromotionPage
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStrategy, setSelectedStrategy] = useState<string>('ALL');

  // Filtered leaderboard traders
  const filteredTraders = users.filter((u) => {
    const matchesSearch = 
      u.displayName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.username.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesStrategy = 
      selectedStrategy === 'ALL' || 
      u.strategyDNA === selectedStrategy || 
      u.primaryStrategyId === selectedStrategy;

    return matchesSearch && matchesStrategy;
  });

  // Top trending verified trades
  const trendingPosts = (posts || []).slice(0, 5);

  return (
    <div className="w-full max-w-md mx-auto pb-24 px-3 sm:px-0">
      
      {/* Header & Search Bar */}
      <div className="pt-2 pb-3 mb-2 space-y-3">
        <div>
          <h2 className="text-xl font-black text-white font-display">Explore & Leaderboard</h2>
          <p className="text-xs text-neutral-400">Temukan Master Trader & Setup DNA Terverifikasi</p>
        </div>

        {/* Search Input */}
        <div className="relative">
          <Search className="w-4 h-4 text-neutral-500 absolute left-3.5 top-3" />
          <input
            type="text"
            placeholder="Cari trader, username, atau simbol..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-[#111111] border border-[#1f1f1f] rounded-2xl pl-10 pr-4 py-2.5 text-xs text-white placeholder:text-neutral-500 focus:outline-none focus:border-amber-500"
          />
        </div>

        {/* Strategy Filter Chips */}
        <div className="flex gap-1.5 overflow-x-auto no-scrollbar pt-1">
          <button
            onClick={() => setSelectedStrategy('ALL')}
            className={`whitespace-nowrap px-3 py-1 rounded-full text-xs font-bold transition-all cursor-pointer ${
              selectedStrategy === 'ALL'
                ? 'bg-amber-500 text-black'
                : 'bg-[#141414] border border-[#222222] text-neutral-400'
            }`}
          >
            Semua Trader
          </button>
          {STRATEGY_LIST.map((strat) => (
            <button
              key={strat.id}
              onClick={() => setSelectedStrategy(strat.id)}
              className={`whitespace-nowrap px-3 py-1 rounded-full text-xs font-semibold transition-all cursor-pointer ${
                selectedStrategy === strat.id
                  ? `${strat.badgeClass} border font-bold`
                  : 'bg-[#141414] border border-[#222222] text-neutral-400'
              }`}
            >
              {strat.name}
            </button>
          ))}
        </div>
      </div>

      {/* Top Masters Leaderboard Section */}
      <div className="space-y-3 mb-6">
        <div className="flex items-center justify-between px-1">
          <div className="flex items-center gap-1.5">
            <Award className="w-4 h-4 text-amber-400" />
            <h3 className="font-bold text-white text-xs uppercase tracking-wider">Top Master Traders</h3>
          </div>
          <span className="text-[10px] text-neutral-400 font-mono">cTrader Real-Time Ranking</span>
        </div>

        <div className="space-y-2">
          {filteredTraders.map((trader, idx) => {
            const isFollowing = Boolean(currentUser && (currentUser.followingList || []).includes(trader.username));
            const isMe = Boolean(currentUser && currentUser.id === trader.id);

            return (
              <div 
                key={trader.id}
                className="bg-[#111111] border border-[#1f1f1f] rounded-2xl p-3 flex items-center justify-between hover:border-amber-500/30 transition-all"
              >
                <div 
                  onClick={() => onViewProfile(trader.username)}
                  className="flex items-center gap-3 cursor-pointer flex-1"
                >
                  <div className="relative">
                    <span className="absolute -top-1.5 -left-1.5 w-4 h-4 rounded-full bg-amber-500 text-black font-bold text-[9px] flex items-center justify-center font-mono shadow">
                      {idx + 1}
                    </span>
                    <img 
                      src={trader.avatar} 
                      alt={trader.username} 
                      className="w-11 h-11 rounded-full object-cover border border-[#2a2a2a]"
                    />
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="font-bold text-white text-xs">{trader.displayName}</span>
                      {trader.isVerified && <ShieldCheck className="w-3.5 h-3.5 text-amber-400" />}
                    </div>
                    <span className="text-[10px] text-neutral-400 font-mono">@{trader.username}</span>
                    <div className="flex items-center gap-2 mt-0.5 font-mono text-[10px]">
                      <span className="text-emerald-400 font-bold">{trader.winRate}% Win</span>
                      <span className="text-neutral-500">•</span>
                      <span className="text-neutral-400">{trader.followersCount} Followers</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {!isMe && (
                    <button
                      onClick={() => onToggleFollow(trader.username)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                        isFollowing
                          ? 'bg-[#1a1a1a] text-neutral-400 border border-[#2a2a2a]'
                          : 'bg-amber-500 hover:bg-amber-400 text-black'
                      }`}
                    >
                      {isFollowing ? 'Mengikuti' : 'Ikuti'}
                    </button>
                  )}
                  {onOpenPromotionPage && (
                    <button
                      onClick={() => onOpenPromotionPage(trader.username)}
                      className="p-1.5 rounded-xl bg-[#161616] hover:bg-[#222222] border border-[#262626] text-neutral-400 hover:text-amber-400 transition-colors cursor-pointer"
                      title={`Buka Halaman Promosi @${trader.username}`}
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Trending Setups Spotlight */}
      <div className="space-y-3">
        <div className="flex items-center justify-between px-1">
          <div className="flex items-center gap-1.5">
            <Flame className="w-4 h-4 text-rose-400" />
            <h3 className="font-bold text-white text-xs uppercase tracking-wider">Trending Live Setups</h3>
          </div>
        </div>

        <div className="space-y-2">
          {trendingPosts.map((post) => (
            <div
              key={post.id}
              onClick={() => onOpenDetail(post)}
              className="bg-[#111111] border border-[#1f1f1f] rounded-2xl p-3 flex items-center justify-between hover:border-neutral-700 transition-all cursor-pointer"
            >
              <div className="flex items-center gap-3">
                <img 
                  src={post.user.avatar} 
                  alt={post.user.username} 
                  className="w-9 h-9 rounded-full object-cover"
                />
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="font-bold text-white text-xs">{post.trade?.symbol && post.trade.symbol !== 'Unknown' ? post.trade.symbol : 'XAUUSD'}</span>
                    <span className={`text-[9px] font-black px-1.5 py-0.2 rounded uppercase ${
                      post.trade.direction === 'BUY' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-rose-500/20 text-rose-300'
                    }`}>
                      {post.trade.direction}
                    </span>
                  </div>
                  <span className="text-[10px] text-neutral-400">oleh @{post.user.username}</span>
                </div>
              </div>

              <div className="text-right font-mono">
                <span className={`text-xs font-bold ${(post.trade.profitUSD ?? 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {(post.trade.profitUSD ?? 0) >= 0 ? '+' : ''}${(post.trade.profitUSD ?? 0).toFixed(2)}
                </span>
                <span className="text-[10px] text-neutral-400 block">
                  {post.likesCount} suka • {post.commentsCount} komentar
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

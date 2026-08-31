import React, { useState } from 'react';
import { 
  ShieldCheck, 
  CheckCircle2, 
  Calendar, 
  TrendingUp, 
  Settings as SettingsIcon, 
  Zap, 
  Sparkles, 
  Share2, 
  Grid, 
  Activity, 
  History, 
  Users,
  ExternalLink,
  Gift,
  Camera,
  Edit3
} from 'lucide-react';
import { User, FeedPost, Trade } from '../types';
import { DynamicFeedTemplate } from '../components/DynamicFeedTemplate';
import { EditAvatarModal } from '../components/EditAvatarModal';
import { getStrategy } from '../data/strategies';

interface ProfileViewProps {
  user: User;
  currentUser: User | null;
  posts: FeedPost[];
  liveTrades: Trade[];
  closedTrades: Trade[];
  onUnlockPost: (post: FeedPost) => void;
  onOpenDetail: (post: FeedPost) => void;
  onOpenFollowSetup: (post: FeedPost) => void;
  onOpenAskAI: (post: FeedPost) => void;
  onOpenComments: (post: FeedPost) => void;
  onToggleLike: (post: FeedPost) => void;
  onToggleSave: (post: FeedPost) => void;
  onToggleFollow: (username: string) => void;
  onEditDescription: (post: FeedPost) => void;
  onOpenEnergy: () => void;
  onOpenReferral: () => void;
  onOpenSettings?: () => void;
  onOpenLogin?: () => void;
  onOpenPromotionPage?: (username: string) => void;
  onOpenWithdrawalModal?: () => void;
  onOpenKycModal?: () => void;
  onUpdateUser?: (updatedUser: User) => void;
  onCloseTrade?: (tradeId: string) => void;
  onOpenPerformance?: (username: string) => void;
}

export const ProfileView: React.FC<ProfileViewProps> = ({
  user,
  currentUser,
  posts,
  liveTrades,
  closedTrades,
  onUnlockPost,
  onOpenDetail,
  onOpenFollowSetup,
  onOpenAskAI,
  onOpenComments,
  onToggleLike,
  onToggleSave,
  onToggleFollow,
  onEditDescription,
  onOpenEnergy,
  onOpenReferral,
  onOpenSettings,
  onOpenLogin,
  onOpenPromotionPage,
  onOpenWithdrawalModal,
  onOpenKycModal,
  onUpdateUser,
  onCloseTrade,
  onOpenPerformance
}) => {
  const [profileTab, setProfileTab] = useState<'posts' | 'live' | 'portfolio'>('posts');
  const [isEditAvatarOpen, setIsEditAvatarOpen] = useState(false);
  const isMe = Boolean(currentUser && currentUser.id === user.id);
  const isFollowing = Boolean(currentUser && (currentUser.followingList || []).includes(user.username));

  // User strategy
  const userStrategy = getStrategy(user.primaryStrategyId || user.strategyDNA);
  const userPosts = posts.filter((p) => p.userId === user.id || p.username === user.username || (p as any).user_id === user.id);
  const userLiveTrades = liveTrades.filter((t) => t.userId === user.id || (t as any).user_id === user.id || userPosts.some((p) => p.trade?.id === t.id && p.trade?.status === 'OPEN'));
  const userClosedTrades = closedTrades.filter((t) => t.userId === user.id || (t as any).user_id === user.id || userPosts.some((p) => p.trade?.id === t.id && p.trade?.status === 'CLOSED'));

  return (
    <div className="w-full max-w-md mx-auto pb-24 px-3 sm:px-0">
      
      {/* Profile Header Card */}
      <div className="bg-[#07130c] rounded-3xl p-4 border border-[#18633c]/40 space-y-4 mb-4 relative overflow-hidden shadow-2xl">
        
        {/* Background Strategy Tint */}
        <div className={`absolute top-0 right-0 w-48 h-48 rounded-full blur-3xl opacity-20 bg-gradient-to-br ${userStrategy.gradient}`} />

        {/* Avatar & Main Identity */}
        <div className="flex items-start justify-between relative z-10">
          <div className="flex gap-3.5 items-center">
            <div className="relative">
              <div 
                onClick={() => {
                  if (isMe) setIsEditAvatarOpen(true);
                }}
                className={`relative group ${isMe ? 'cursor-pointer' : ''}`}
                title={isMe ? 'Klik untuk ubah foto profil' : undefined}
              >
                <img 
                  src={user.avatar} 
                  alt={user.username} 
                  referrerPolicy="no-referrer"
                  className="w-16 h-16 rounded-full object-cover border-2 border-emerald-400/90 shadow-md shadow-emerald-500/20 group-hover:opacity-90 transition-opacity"
                />
                {isMe && (
                  <div className="absolute inset-0 rounded-full bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white backdrop-blur-[1px]">
                    <Camera className="w-5 h-5 text-amber-400 drop-shadow" />
                  </div>
                )}
              </div>
              
              {isMe ? (
                <button
                  onClick={() => setIsEditAvatarOpen(true)}
                  className="absolute -bottom-1 -right-1 w-6 h-6 bg-amber-500 hover:bg-amber-400 rounded-full border-2 border-[#07130c] flex items-center justify-center text-black shadow-md cursor-pointer transition-transform hover:scale-110 active:scale-95"
                  title="Ubah Foto Profil"
                >
                  <Camera className="w-3 h-3 stroke-[2.5]" />
                </button>
              ) : user.cTraderConnected ? (
                <span className="absolute bottom-0 right-0 w-5 h-5 bg-emerald-500 rounded-full border-2 border-[#07130c] flex items-center justify-center" title="Connected to cTrader">
                  <CheckCircle2 className="w-3 h-3 text-black stroke-[3]" />
                </span>
              ) : null}
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <h3 className="font-bold text-white text-base">{user.displayName}</h3>
                {user.isVerified && <ShieldCheck className="w-4 h-4 text-emerald-400" />}
              </div>
              <span className="text-xs text-neutral-400 font-mono">@{user.username}</span>
              {/* Strategy Badge & Edit Avatar Trigger */}
              <div className="mt-1 flex items-center gap-1.5 flex-wrap">
                <span className={`inline-block text-[10px] font-bold ${userStrategy.badgeClass} px-2 py-0.5 rounded-md border`}>
                  {userStrategy.name}
                </span>
                {isMe && (
                  <button
                    onClick={() => setIsEditAvatarOpen(true)}
                    className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-md bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/30 transition-colors cursor-pointer"
                  >
                    <Edit3 className="w-2.5 h-2.5" />
                    <span>Edit Foto</span>
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-1.5">
            {isMe ? (
              <button
                onClick={onOpenSettings}
                className="p-2 rounded-xl bg-[#0d2216] hover:bg-[#143322] text-neutral-300 transition-colors border border-emerald-500/20 cursor-pointer"
                title="Pengaturan"
              >
                <SettingsIcon className="w-4 h-4 text-emerald-400" />
              </button>
            ) : (
              <button
                onClick={() => onToggleFollow(user.username)}
                className={`px-4 py-1.5 rounded-xl font-bold text-xs transition-all cursor-pointer ${
                  isFollowing
                    ? 'bg-[#0d2216] text-neutral-300 border border-emerald-500/20'
                    : 'bg-emerald-500 hover:bg-emerald-400 text-black shadow-md shadow-emerald-500/20'
                }`}
              >
                {isFollowing ? 'Mengikuti' : 'Ikuti'}
              </button>
            )}
          </div>
        </div>

        {/* Bio */}
        <p className="text-xs text-neutral-300 leading-relaxed relative z-10">
          {user.bio || 'Trader aktif cTrader. Berbagi setiap posisi secara otomatis di Scrolic.'}
        </p>

        {onOpenPerformance && (
          <button
            type="button"
            onClick={() => onOpenPerformance(user.username)}
            className="w-full py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black text-xs font-extrabold flex items-center justify-center gap-2 relative z-10"
          >
            <Activity className="w-4 h-4" />
            Performance Trader Detail
          </button>
        )}

        {/* Key Stats Bar */}
        <div className="grid grid-cols-4 gap-2 pt-3 border-t border-[#18633c]/30 text-center font-mono relative z-10">
          <div>
            <span className="text-sm font-black text-white">{user.followersCount}</span>
            <span className="text-[10px] text-neutral-400 block font-sans">Pengikut</span>
          </div>
          <div>
            <span className="text-sm font-black text-white">{user.followingCount}</span>
            <span className="text-[10px] text-neutral-400 block font-sans">Mengikuti</span>
          </div>
          <div>
            <span className="text-sm font-black text-white">{user.totalTradesCount || user.totalTrades || 0}</span>
            <span className="text-[10px] text-neutral-400 block font-sans">Trades</span>
          </div>
          <div>
            <span className="text-sm font-black text-emerald-400">{user.winRate}%</span>
            <span className="text-[10px] text-neutral-400 block font-sans">Win Rate</span>
          </div>
        </div>

        {/* Trader Setup Earnings & Monetization (80% Allocation) */}
        {isMe && (
          <>
            <div className="p-3 rounded-2xl bg-[#092215] border border-amber-500/30 flex items-center justify-between gap-3 relative z-10">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
                  <Zap className="w-4 h-4 fill-amber-400" />
                </div>
                <div>
                  <span className="text-[11px] font-bold text-white block">
                    Pendapatan Setup: {user.tradeEarningsEnergy || 0} Energy
                  </span>
                  <span className="text-[10px] text-amber-300/90 font-mono block">
                    Tarif: Unlock {user.defaultUnlockPrice || 1}⚡ / Follow {user.defaultFollowPrice || 1}⚡ (80% Share)
                  </span>
                </div>
              </div>
              {onOpenSettings && (
                <button
                  onClick={onOpenSettings}
                  className="px-2.5 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-extrabold text-[10px] flex items-center gap-1 transition-all shadow-sm cursor-pointer shrink-0"
                >
                  <span>Atur Biaya</span>
                </button>
              )}
            </div>

            {/* KYC & Instant Commission Withdrawal Action */}
            <div className="p-3 rounded-2xl bg-gradient-to-r from-[#0d2a1a] to-[#07160e] border border-emerald-500/35 flex items-center justify-between gap-3 relative z-10">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0">
                  <ShieldCheck className="w-4 h-4" />
                </div>
                <div>
                  <span className="text-[11px] font-bold text-white block">
                    Penarikan Komisi (BI-FAST)
                  </span>
                  <span className="text-[10px] text-emerald-300/80 block">
                    KYC: {user.kycStatus === 'verified' ? `Terverifikasi (${user.kycFullName})` : 'Belum Verifikasi (Wajib KTP)'}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {user.kycStatus !== 'verified' && onOpenKycModal && (
                  <button
                    onClick={onOpenKycModal}
                    className="px-2.5 py-1.5 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/30 font-bold text-[10px] transition-colors cursor-pointer"
                  >
                    Verifikasi KYC
                  </button>
                )}
                {onOpenWithdrawalModal && (
                  <button
                    onClick={onOpenWithdrawalModal}
                    className="px-3 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-extrabold text-[10px] flex items-center gap-1 transition-all shadow-md shadow-emerald-500/20 cursor-pointer"
                  >
                    <span>Tarik Komisi</span>
                  </button>
                )}
              </div>
            </div>
          </>
        )}

        {/* Promotional / Referral Banner Card */}
        <div className="p-3 rounded-2xl bg-[#0b2014] border border-emerald-500/30 flex items-center justify-between gap-3 relative z-10">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0">
              <Gift className="w-4 h-4" />
            </div>
            <div>
              <span className="text-[11px] font-bold text-white block">
                {isMe ? `Link Promosi: /@${user.username}` : `Halaman Promosi @${user.username}`}
              </span>
              <span className="text-[10px] text-emerald-300/90 font-mono block">
                Bonus Afiliasi Hingga 50% Seumur Hidup
              </span>
            </div>
          </div>
          <button
            onClick={() => {
              if (onOpenPromotionPage) {
                onOpenPromotionPage(user.username);
              } else {
                onOpenReferral();
              }
            }}
            className="px-3 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-extrabold text-[11px] flex items-center gap-1 transition-all shadow-md shadow-emerald-500/20 cursor-pointer shrink-0"
          >
            <span>Buka</span>
            <ExternalLink className="w-3 h-3 stroke-[2.5]" />
          </button>
        </div>
      </div>

      {/* Profile Tabs: Konten Trade / Posisi Live / Portofolio */}
      <div className="flex border-b border-[#18633c]/30 mb-4 bg-[#07130c] rounded-2xl p-1">
        <button
          onClick={() => setProfileTab('posts')}
          className={`flex-1 py-2 text-xs font-bold flex items-center justify-center gap-1.5 rounded-xl transition-all cursor-pointer ${
            profileTab === 'posts'
              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 shadow-sm'
              : 'text-neutral-400 hover:text-neutral-200'
          }`}
        >
          <Grid className="w-3.5 h-3.5" />
          <span>Feed ({userPosts.length})</span>
        </button>
        <button
          onClick={() => setProfileTab('live')}
          className={`flex-1 py-2 text-xs font-bold flex items-center justify-center gap-1.5 rounded-xl transition-all cursor-pointer ${
            profileTab === 'live'
              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 shadow-sm'
              : 'text-neutral-400 hover:text-neutral-200'
          }`}
        >
          <Activity className="w-3.5 h-3.5" />
          <span>Live ({userLiveTrades.length})</span>
        </button>
        <button
          onClick={() => setProfileTab('portfolio')}
          className={`flex-1 py-2 text-xs font-bold flex items-center justify-center gap-1.5 rounded-xl transition-all cursor-pointer ${
            profileTab === 'portfolio'
              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 shadow-sm'
              : 'text-neutral-400 hover:text-neutral-200'
          }`}
        >
          <History className="w-3.5 h-3.5" />
          <span>Portofolio ({userClosedTrades.length})</span>
        </button>
      </div>

      {/* Tab Content */}
      {profileTab === 'posts' && (
        <div className="space-y-4">
          {userPosts.length === 0 ? (
            <div className="text-center py-12 text-neutral-400 text-xs bg-[#07130c] rounded-2xl border border-[#18633c]/30">
              Belum ada postingan trade dari trader ini.
            </div>
          ) : (
            userPosts.map((post) => (
              <DynamicFeedTemplate
                key={post.id}
                post={post}
                currentUser={currentUser}
                onUnlock={onUnlockPost}
                onOpenDetail={onOpenDetail}
                onOpenFollowSetup={onOpenFollowSetup}
                onOpenAskAI={onOpenAskAI}
                onOpenComments={onOpenComments}
                onToggleLike={onToggleLike}
                onToggleSave={onToggleSave}
                onToggleFollow={onToggleFollow}
                onEditDescription={onEditDescription}
              />
            ))
          )}
        </div>
      )}

      {profileTab === 'live' && (
        <div className="space-y-3">
          {userLiveTrades.length === 0 ? (
            <div className="text-center py-12 text-neutral-400 text-xs bg-[#07130c] rounded-2xl border border-[#18633c]/30">
              Tidak ada posisi open trade aktif saat ini.
            </div>
          ) : (
            userPosts
              .filter((p) => p.trade.status === 'OPEN')
              .map((post) => (
                <div key={post.id} className="relative">
                  <DynamicFeedTemplate
                    post={post}
                    currentUser={currentUser}
                    onUnlock={onUnlockPost}
                    onOpenDetail={onOpenDetail}
                    onOpenFollowSetup={onOpenFollowSetup}
                    onOpenAskAI={onOpenAskAI}
                    onOpenComments={onOpenComments}
                    onToggleLike={onToggleLike}
                    onToggleSave={onToggleSave}
                    onToggleFollow={onToggleFollow}
                    onEditDescription={onEditDescription}
                  />
                  {isMe && onCloseTrade && (
                    <div className="mt-1 flex justify-end">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onCloseTrade(post.trade.id || post.id);
                        }}
                        className="px-3 py-1.5 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/40 text-xs font-bold transition-all cursor-pointer flex items-center gap-1 shadow-sm"
                      >
                        <span>Tutup Posisi (Close Trade)</span>
                      </button>
                    </div>
                  )}
                </div>
              ))
          )}
        </div>
      )}

      {profileTab === 'portfolio' && (
        <div className="space-y-2">
          {userClosedTrades.map((t) => (
            <div key={t.id} className="bg-[#07130c] border border-[#18633c]/30 p-3 rounded-2xl flex items-center justify-between text-xs">
              <div>
                <span className="font-bold text-white">{t.symbol} {t.direction}</span>
                <span className="text-[10px] text-neutral-400 block font-mono">{t.duration}</span>
              </div>
              <div className="text-right font-mono">
                <span className={`font-bold ${(t.profitUSD ?? 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {(t.profitUSD ?? 0) >= 0 ? '+' : ''}${(t.profitUSD ?? 0).toFixed(2)}
                </span>
                <span className="text-[10px] text-neutral-400 block">
                  {(t.profitUSD ?? 0) >= 0 ? '+' : ''}{(t.pips ?? 0).toFixed(1)} Pips
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Edit Avatar Modal */}
      {isEditAvatarOpen && currentUser && (
        <EditAvatarModal
          currentUser={currentUser}
          onClose={() => setIsEditAvatarOpen(false)}
          onUpdateUser={(updatedUser) => {
            if (onUpdateUser) onUpdateUser(updatedUser);
            setIsEditAvatarOpen(false);
          }}
        />
      )}
    </div>
  );
};

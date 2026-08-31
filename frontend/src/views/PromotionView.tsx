import React, { useState } from 'react';
import { 
  Sparkles, 
  Gift, 
  Share2, 
  CheckCircle2, 
  Copy, 
  ExternalLink, 
  ArrowRight, 
  ShieldCheck, 
  TrendingUp, 
  Zap, 
  Users,
  Smartphone,
  ChevronLeft
} from 'lucide-react';
import { User } from '../types';
import { triggerHaptic } from '../utils/haptics';
import { ScrolicLogo } from '../components/ScrolicLogo';

interface PromotionViewProps {
  promoterUser: User | null;
  currentUser: User | null;
  onOpenLogin: (referralCode?: string) => void;
  onBackToFeed: () => void;
  onOpenReferralModal: () => void;
}

export const PromotionView: React.FC<PromotionViewProps> = ({
  promoterUser,
  currentUser,
  onOpenLogin,
  onBackToFeed,
  onOpenReferralModal
}) => {
  const [copied, setCopied] = useState(false);
  const promoter = promoterUser || currentUser || {
    username: 'alex_trader',
    displayName: 'Alex Sterling',
    referralCode: 'SCROLIC50',
    avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200&auto=format&fit=crop&q=80',
    winRate: 81.4
  };

  const referralCode = promoter.referralCode || `${promoter.username.toUpperCase()}`;
  const promoUrl = `${window.location.origin}/@${promoter.username}`;

  const handleCopyLink = () => {
    triggerHaptic('medium');
    navigator.clipboard.writeText(promoUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <div className="w-full max-w-md mx-auto pb-28 px-3 sm:px-0 text-white select-none">
      
      {/* Top Bar with Back Button */}
      <div className="pt-2 pb-3 flex items-center justify-between">
        <button
          onClick={onBackToFeed}
          className="flex items-center gap-1 text-xs text-neutral-400 hover:text-white transition-colors cursor-pointer bg-[#0d2216] px-3 py-1.5 rounded-xl border border-emerald-500/20"
        >
          <ChevronLeft className="w-4 h-4" />
          <span>Kembali ke Feed</span>
        </button>
        <span className="text-[11px] font-mono font-bold text-emerald-400">
          /@{promoter.username}
        </span>
      </div>

      {/* Main Hero Card */}
      <div className="relative rounded-3xl bg-[#07130c] border border-[#18633c]/50 p-6 text-center overflow-hidden shadow-2xl mb-4">
        
        {/* Glow backdrop accent */}
        <div className="absolute -top-20 -right-20 w-44 h-44 bg-emerald-500/20 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-20 -left-20 w-44 h-44 bg-[#18633c]/40 rounded-full blur-3xl pointer-events-none" />

        {/* Scrolic Animated Logo */}
        <div className="inline-flex items-center justify-center mb-4">
          <ScrolicLogo size={56} pulseLive />
        </div>

        {/* Exclusive Promo Badge */}
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-xs font-mono font-bold uppercase tracking-wider mb-3">
          <Gift className="w-3.5 h-3.5 text-emerald-400" />
          <span>Undangan Eksklusif Afiliasi 50%</span>
        </div>

        {/* Heading */}
        <h1 className="text-2xl font-black text-white tracking-tight leading-tight mb-2">
          Bergabung Bersama <span className="text-emerald-400 font-extrabold">{promoter.displayName}</span> di Scrolic
        </h1>

        <p className="text-xs text-neutral-300 max-w-xs mx-auto leading-relaxed mb-5">
          Platform Social Trading untuk cTrader. Scroll feed, unlock setup SL/TP, dan mirror order 1-click.
        </p>

        {/* Promoter Profile Snippet */}
        <div className="p-3.5 rounded-2xl bg-[#0d2216] border border-emerald-500/20 flex items-center justify-between mb-5 text-left">
          <div className="flex items-center gap-3">
            <img 
              src={promoter.avatar} 
              alt={promoter.username} 
              className="w-10 h-10 rounded-full object-cover border border-emerald-400/50"
            />
            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-bold text-xs text-white">{promoter.displayName}</span>
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              </div>
              <span className="text-[10px] text-neutral-400 font-mono">@{promoter.username}</span>
            </div>
          </div>
          <div className="text-right font-mono">
            <span className="text-xs font-bold text-emerald-400">{promoter.winRate || 80}% Win</span>
            <span className="text-[9px] text-neutral-400 block font-sans">cTrader Verified</span>
          </div>
        </div>

        {/* Referral Code Box */}
        <div className="p-3 rounded-2xl bg-[#0a1a10] border border-dashed border-emerald-500/40 flex items-center justify-between gap-2 mb-5">
          <div className="text-left">
            <span className="text-[10px] text-neutral-400 block uppercase font-bold">Kode Referral Anda:</span>
            <span className="text-sm font-black font-mono text-emerald-300 tracking-wider">
              {referralCode}
            </span>
          </div>
          <button
            onClick={handleCopyLink}
            className="px-3 py-1.5 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 text-xs font-bold flex items-center gap-1 transition-all cursor-pointer"
          >
            {copied ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copied ? 'Tersalin!' : 'Salin Link'}</span>
          </button>
        </div>

        {/* CTA Button */}
        {currentUser ? (
          <button
            onClick={onOpenReferralModal}
            className="w-full py-3.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-extrabold text-xs shadow-xl shadow-emerald-500/20 flex items-center justify-center gap-2 transition-all active:scale-95 cursor-pointer"
          >
            <Users className="w-4 h-4" />
            <span>Kelola Jaringan 5 Generasi Anda</span>
          </button>
        ) : (
          <div className="space-y-1.5">
            <button
              onClick={() => onOpenLogin(referralCode)}
              className="w-full py-3.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-extrabold text-xs shadow-xl shadow-emerald-500/20 flex items-center justify-center gap-2 transition-all active:scale-95 cursor-pointer"
            >
              <Zap className="w-4 h-4 fill-black" />
              <span>Daftar Sekarang & Klaim 25 Energy Gratis</span>
            </button>
            <p className="text-[10px] text-emerald-400/90 font-medium">
              ⚡ Bonus 25 Energy otomatis masuk setelah verifikasi KYC (KTP) AI berhasil
            </p>
          </div>
        )}
      </div>

      {/* 5-Generation Affiliate Breakdown Benefits */}
      <div className="bg-[#07130c] border border-[#18633c]/40 rounded-3xl p-5 space-y-3 mb-4">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-emerald-400" />
          <h3 className="text-xs font-bold text-white uppercase tracking-wider">
            Struktur Komisi 5 Generasi (50% Pool)
          </h3>
        </div>
        <p className="text-xs text-neutral-400 leading-relaxed">
          Setiap trader yang mendaftar melalui link ini akan masuk ke jaringan Anda, memberi Anda komisi passive income setiap kali mereka top-up Energy:
        </p>

        <div className="grid grid-cols-5 gap-1.5 text-center font-mono pt-2">
          <div className="p-2 rounded-xl bg-[#0d2216] border border-emerald-500/20">
            <span className="text-[9px] text-neutral-400 block font-sans">Gen 1</span>
            <span className="text-xs font-black text-emerald-400">10%</span>
          </div>
          <div className="p-2 rounded-xl bg-[#0d2216] border border-emerald-500/20">
            <span className="text-[9px] text-neutral-400 block font-sans">Gen 2</span>
            <span className="text-xs font-black text-emerald-400">10%</span>
          </div>
          <div className="p-2 rounded-xl bg-[#0d2216] border border-emerald-500/20">
            <span className="text-[9px] text-neutral-400 block font-sans">Gen 3</span>
            <span className="text-xs font-black text-emerald-400">10%</span>
          </div>
          <div className="p-2 rounded-xl bg-[#0d2216] border border-emerald-500/20">
            <span className="text-[9px] text-neutral-400 block font-sans">Gen 4</span>
            <span className="text-xs font-black text-emerald-400">10%</span>
          </div>
          <div className="p-2 rounded-xl bg-[#0d2216] border border-emerald-500/20">
            <span className="text-[9px] text-neutral-400 block font-sans">Gen 5</span>
            <span className="text-xs font-black text-emerald-400">10%</span>
          </div>
        </div>
      </div>

      {/* 3 Core Platform Pillars */}
      <div className="grid grid-cols-3 gap-2 text-center text-xs">
        <div className="p-3 rounded-2xl bg-[#07130c] border border-[#18633c]/30">
          <Smartphone className="w-5 h-5 text-emerald-400 mx-auto mb-1.5" />
          <div className="font-bold text-white text-[11px]">Feed</div>
          <div className="text-[9px] text-neutral-400 mt-0.5">Scroll & pelajari setup live</div>
        </div>
        <div className="p-3 rounded-2xl bg-[#07130c] border border-[#18633c]/30">
          <TrendingUp className="w-5 h-5 text-emerald-400 mx-auto mb-1.5" />
          <div className="font-bold text-white text-[11px]">1-Click Mirroring</div>
          <div className="text-[9px] text-neutral-400 mt-0.5">Kloning posisi ke akun Anda</div>
        </div>
        <div className="p-3 rounded-2xl bg-[#07130c] border border-[#18633c]/30">
          <img 
            src="https://cdn.jsdelivr.net/gh/homarr-labs/dashboard-icons/webp/ctrader.webp" 
            alt="cTrader Verified" 
            className="w-5 h-5 mx-auto mb-1.5 object-contain"
            referrerPolicy="no-referrer"
          />
          <div className="font-bold text-white text-[11px]">cTrader Verified</div>
          <div className="text-[9px] text-neutral-400 mt-0.5">100% data riil dari broker</div>
        </div>
      </div>
    </div>
  );
};

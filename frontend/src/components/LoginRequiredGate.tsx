import React from 'react';
import { 
  Lock, 
  Sparkles, 
  ShieldCheck, 
  Zap, 
  Activity, 
  Users, 
  ArrowRight, 
  TrendingUp 
} from 'lucide-react';
import { ScrolicLogo } from './ScrolicLogo';

interface LoginRequiredGateProps {
  title?: string;
  description?: string;
  featureName?: string;
  onOpenLogin: () => void;
}

export const LoginRequiredGate: React.FC<LoginRequiredGateProps> = ({
  title = 'Akses Database & Portofolio Memerlukan Login',
  description = 'Fitur ini membutuhkan akses database user, sinkronisasi cTrader real-time, dan manajemen saldo Energy.',
  featureName = 'Portofolio & cTrader Live',
  onOpenLogin
}) => {
  return (
    <div className="w-full max-w-md mx-auto py-10 px-4">
      <div className="relative rounded-3xl bg-[#07130c] border border-[#18633c]/40 p-6 text-center overflow-hidden shadow-2xl">
        
        {/* Ambient background glows */}
        <div className="absolute -top-20 -right-20 w-44 h-44 bg-emerald-500/15 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-20 -left-20 w-44 h-44 bg-[#18633c]/30 rounded-full blur-3xl pointer-events-none" />

        {/* Floating Scrolic Logo */}
        <div className="relative inline-flex items-center justify-center mb-5">
          <ScrolicLogo size={64} pulseLive />
        </div>

        {/* Main Headings */}
        <span className="inline-block px-3 py-1 rounded-full bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 text-[11px] font-mono font-bold uppercase tracking-wider mb-2">
          {featureName}
        </span>
        <h2 className="text-xl font-black text-white tracking-tight mb-2">
          {title}
        </h2>
        <p className="text-xs text-neutral-400 max-w-xs mx-auto leading-relaxed mb-6">
          {description}
        </p>

        {/* Benefits Grid */}
        <div className="grid grid-cols-2 gap-2.5 text-left mb-6">
          <div className="p-3 rounded-xl bg-[#0d2216] border border-emerald-500/20">
            <Activity className="w-4 h-4 text-emerald-400 mb-1.5" />
            <div className="text-xs font-bold text-white">cTrader Sync</div>
            <div className="text-[10px] text-neutral-400 leading-tight">1 OP otomatis jadi feed post live.</div>
          </div>
          <div className="p-3 rounded-xl bg-[#0d2216] border border-emerald-500/20">
            <Zap className="w-4 h-4 text-emerald-400 mb-1.5" />
            <div className="text-xs font-bold text-white">Energy Wallet</div>
            <div className="text-[10px] text-neutral-400 leading-tight">Unlock SL/TP & Tanya AI.</div>
          </div>
          <div className="p-3 rounded-xl bg-[#0d2216] border border-emerald-500/20">
            <TrendingUp className="w-4 h-4 text-emerald-400 mb-1.5" />
            <div className="text-xs font-bold text-white">Mirror Order</div>
            <div className="text-[10px] text-neutral-400 leading-tight">Ikuti setup trader terverifikasi.</div>
          </div>
          <div className="p-3 rounded-xl bg-[#0d2216] border border-emerald-500/20">
            <Users className="w-4 h-4 text-emerald-400 mb-1.5" />
            <div className="text-xs font-bold text-white">Affiliate 50%</div>
            <div className="text-[10px] text-neutral-400 leading-tight">Dapatkan komisi Energy 50% Seumur Hidup.</div>
          </div>
        </div>

        <button
          onClick={onOpenLogin}
          className="w-full flex items-center justify-center gap-3 py-3 px-4 rounded-xl bg-emerald-500 text-black font-extrabold text-sm hover:bg-emerald-400 transition-all shadow-xl shadow-emerald-500/20 hover:scale-[1.01] active:scale-[0.99] cursor-pointer"
        >
          <span>Masuk / Daftar</span>
        </button>

        <div className="mt-3 text-[11px] text-neutral-400">
          Gunakan email dan password Anda untuk masuk atau mendaftar.
        </div>
      </div>
    </div>
  );
};

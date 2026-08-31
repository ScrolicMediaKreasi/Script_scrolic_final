import React, { useState } from 'react';
import { Zap, Bell, Activity, Gift, Sparkles, ShieldCheck, ChevronDown, LogIn } from 'lucide-react';
import { User } from '../types';
import { triggerHaptic } from '../utils/haptics';
import { ScrolicLogo } from './ScrolicLogo';

interface NavbarProps {
  currentUser: User | null;
  unreadNotificationsCount: number;
  onOpenEnergy: () => void;
  onOpenNotifications: () => void;
  onOpenLogin: () => void;
  onOpenPromotion?: () => void;
  onOpenAdmin?: () => void;
  onNavigatePublic?: (path: string) => void;
  onLogoClick?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentUser,
  unreadNotificationsCount,
  onOpenEnergy,
  onOpenNotifications,
  onOpenLogin,
  onOpenPromotion,
  onOpenAdmin,
  onNavigatePublic,
  onLogoClick
}) => {
  const [isPublicMenuOpen, setIsPublicMenuOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 w-full backdrop-blur-xl bg-[#07130c]/90 border-b border-[#18633c]/30 select-none shadow-sm shadow-black/40">
      <div className="max-w-md mx-auto px-4 h-14 flex items-center justify-between">
        
        {/* Brand Logo & Live Signal with official Scrolic Icon */}
        <div 
          onClick={() => {
            triggerHaptic('light');
            onLogoClick?.();
          }}
          className="flex items-center gap-2 cursor-pointer group"
        >
          <ScrolicLogo size={32} showText pulseLive />
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2">
          {onNavigatePublic && (
            <div className="relative">
              <button type="button" aria-label="Menu informasi Scrolic" aria-expanded={isPublicMenuOpen} onClick={() => setIsPublicMenuOpen((open) => !open)} className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border border-[#1b432a] bg-[#0c1a11] text-emerald-300 hover:border-emerald-500/50" title="Menu informasi Scrolic">
                <ChevronDown className="h-4 w-4" />
              </button>
              {isPublicMenuOpen && <div className="absolute right-0 top-10 z-50 w-36 rounded-xl border border-emerald-500/30 bg-[#07130c] p-1.5 shadow-xl">
                {['/about', '/pricing', '/faq'].map((path) => (
                  <a key={path} href={path} onClick={() => setIsPublicMenuOpen(false)} className="block rounded-lg px-3 py-2 text-xs font-bold text-neutral-300 hover:bg-emerald-500/10 hover:text-emerald-300">
                    {path.slice(1).toUpperCase()}
                  </a>
                ))}
              </div>}
            </div>
          )}
          {currentUser ? (
            <>
              {/* Admin Dashboard Badge Link (If user is Admin) */}
              {String(currentUser.role || '').toLowerCase() === 'admin' && onOpenAdmin && (
                <button
                  id="btn-nav-admin-dashboard"
                  onClick={() => {
                    triggerHaptic('medium');
                    onOpenAdmin();
                  }}
                  className="px-2 py-1 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-extrabold text-[10px] flex items-center gap-1 shadow-md shadow-amber-500/20 active:scale-95 cursor-pointer transition-all animate-in fade-in duration-200"
                  title="Panel Admin Scrolic"
                >
                  <ShieldCheck className="w-3.5 h-3.5 stroke-[2.5]" />
                  <span>ADMIN</span>
                </button>
              )}

              {/* Quick Promo / Affiliate Trigger */}
              {onOpenPromotion && (
                <button
                  id="btn-nav-promo"
                  onClick={() => {
                    triggerHaptic('medium');
                    onOpenPromotion();
                  }}
                  className="p-1.5 rounded-xl bg-[#0c1a11] border border-[#1b432a] text-emerald-300 hover:text-emerald-200 hover:border-emerald-500/50 hover:bg-[#12281b] transition-all active:scale-95 cursor-pointer flex items-center gap-1"
                  title="Halaman Promosi & Bonus Afiliasi 50%"
                >
                  <Gift className="w-4 h-4 text-emerald-400" />
                  <span className="hidden sm:inline text-[10px] font-bold text-emerald-300">50% Afiliasi</span>
                </button>
              )}

              {/* Energy Balance Pill */}
              <button
                id="btn-nav-energy-wallet"
                onClick={() => {
                  triggerHaptic('light');
                  onOpenEnergy();
                }}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#133320] border border-emerald-500/40 text-emerald-300 hover:border-emerald-400 hover:bg-[#18442a] transition-all cursor-pointer shadow-sm active:scale-95"
              >
                <Zap className="w-3.5 h-3.5 fill-emerald-400 text-emerald-400" />
                <span className="text-xs font-mono font-extrabold">{currentUser.energyBalance}</span>
              </button>

              {/* Notification Bell */}
              <button
                id="btn-nav-notifications"
                onClick={() => {
                  triggerHaptic('light');
                  onOpenNotifications();
                }}
                className="relative p-2 rounded-full bg-[#0c1a11] border border-[#1b432a] text-neutral-300 hover:text-white hover:border-emerald-500/40 transition-all active:scale-95 cursor-pointer"
              >
                <Bell className="w-4 h-4 text-emerald-300" />
                {unreadNotificationsCount > 0 && (
                  <span className="absolute top-1 right-1 w-2 h-2 bg-emerald-400 rounded-full animate-ping" />
                )}
              </button>
            </>
          ) : (
            /* Unauthenticated / Guest View: Promo link & Google Sign In Button */
            <div className="flex items-center gap-2">
              {onOpenPromotion && (
                <button
                  id="btn-nav-guest-promo"
                  onClick={() => {
                    triggerHaptic('light');
                    onOpenPromotion();
                  }}
                  className="p-1.5 px-2.5 rounded-full bg-[#0c1a11] border border-[#1b432a] text-emerald-300 hover:text-white hover:bg-[#12281b] text-xs font-bold transition-all cursor-pointer flex items-center gap-1"
                >
                  <Gift className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Promo 50%</span>
                </button>
              )}
              <button
                id="btn-nav-login"
                data-testid="btn-nav-login"
                onClick={() => {
                  triggerHaptic('medium');
                  onOpenLogin();
                }}
                className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500 hover:bg-emerald-400 text-black font-extrabold text-xs shadow-md shadow-emerald-500/20 transition-all active:scale-95 cursor-pointer"
              >
                <LogIn className="w-3.5 h-3.5" strokeWidth={2.5} />
                <span>Masuk</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};

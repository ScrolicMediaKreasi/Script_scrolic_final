import React, { useState, useEffect } from 'react';
import { Download, X, Zap, Smartphone, CheckCircle2, Share } from 'lucide-react';
import { User } from '../types';
import { triggerHaptic } from '../utils/haptics';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

interface PWAInstallBannerProps {
  currentUser: User | null;
  onUpdateUser?: (updated: User) => void;
  onOpenLogin?: () => void;
}

export const PWAInstallBanner: React.FC<PWAInstallBannerProps> = ({
  currentUser,
  onUpdateUser,
  onOpenLogin
}) => {
  const [isStandalone, setIsStandalone] = useState<boolean>(false);
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isDismissed, setIsDismissed] = useState<boolean>(false);
  const [isInstalling, setIsInstalling] = useState<boolean>(false);
  const [showIosGuide, setShowIosGuide] = useState<boolean>(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  useEffect(() => {
    // 1. Detect if PWA is ALREADY installed / running in standalone mode
    const checkStandalone = () => {
      const isStandaloneMedia = window.matchMedia('(display-mode: standalone)').matches;
      const isNavStandalone = (navigator as any).standalone === true; // iOS Safari
      return isStandaloneMedia || isNavStandalone;
    };

    if (checkStandalone()) {
      setIsStandalone(true);
      return;
    }

    // 2. Check session dismissal
    const dismissed = sessionStorage.getItem('scrolic_pwa_banner_dismissed');
    if (dismissed === 'true') {
      setIsDismissed(true);
    }

    // 3. Listen for BeforeInstallPromptEvent (Android / Chrome / Edge / Desktop)
    const handleBeforeInstallPrompt = (e: BeforeInstallPromptEvent) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt as EventListener);

    // 4. Listen for App Installed Event
    const handleAppInstalled = () => {
      setIsStandalone(true);
      claimInstallBonus();
    };

    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt as EventListener);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const claimInstallBonus = async () => {
    if (!currentUser) return;
    if (currentUser.pwaBonusClaimed) return;

    try {
      const res = await fetch('/api/user/pwa-install-bonus', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-session-user-id': currentUser.id || currentUser.username
        }
      });
      const data = await res.json();
      if (res.ok && data.user && onUpdateUser) {
        onUpdateUser(data.user);
        triggerHaptic('success');
        showToast('🎉 Selamat! Bonus +10 Energy berhasil ditambahkan ke akun Anda!');
      }
    } catch (err) {
      // Silently fail if network offline
    }
  };

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3500);
  };

  const handleDismiss = (e: React.MouseEvent) => {
    e.stopPropagation();
    triggerHaptic('selection');
    setIsDismissed(true);
    sessionStorage.setItem('scrolic_pwa_banner_dismissed', 'true');
  };

  const handleInstallClick = async () => {
    triggerHaptic('medium');

    const isIos = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;

    if (deferredPrompt) {
      setIsInstalling(true);
      try {
        deferredPrompt.prompt();
        const choiceResult = await deferredPrompt.userChoice;
        if (choiceResult.outcome === 'accepted') {
          if (currentUser) await claimInstallBonus();
          setIsDismissed(true);
        }
      } catch (err) {
        // user cancelled or error
      } finally {
        setIsInstalling(false);
        setDeferredPrompt(null);
      }
    } else if (isIos) {
      setShowIosGuide(true);
    } else {
      showToast('Petunjuk: Buka menu titik tiga browser -> Tambahkan ke Layar Utama');
    }
  };

  // If already running inside installed PWA standalone app or dismissed, DO NOT RENDER
  if (isStandalone || isDismissed) {
    return (
      <>
        {toastMsg && (
          <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-emerald-950 border border-emerald-500/40 text-emerald-300 px-4 py-2.5 rounded-2xl shadow-xl text-xs font-semibold flex items-center gap-2 animate-in fade-in slide-in-from-top-4">
            <Zap className="w-4 h-4 text-amber-400 fill-amber-400 animate-bounce" />
            <span>{toastMsg}</span>
          </div>
        )}
      </>
    );
  }

  const bonusClaimed = Boolean(currentUser?.pwaBonusClaimed);

  return (
    <>
      {/* Toast Notification */}
      {toastMsg && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-emerald-950 border border-emerald-500/40 text-emerald-300 px-4 py-2.5 rounded-2xl shadow-xl text-xs font-semibold flex items-center gap-2 animate-in fade-in slide-in-from-top-4">
          <Zap className="w-4 h-4 text-amber-400 fill-amber-400 animate-bounce" />
          <span>{toastMsg}</span>
        </div>
      )}

      {/* Floating Non-Intrusive PWA Install Offer Bar */}
      <div className="fixed bottom-16 sm:bottom-4 left-3 right-3 sm:left-auto sm:right-4 z-40 sm:max-w-md bg-[#09150E]/95 backdrop-blur-md border border-emerald-500/30 rounded-2xl p-3 shadow-2xl transition-all animate-in fade-in slide-in-from-bottom-5">
        <div className="flex items-center justify-between gap-3">
          {/* Small Scrolic Brand Logo */}
          <div className="flex items-center gap-2.5 flex-1 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-emerald-600 via-emerald-400 to-amber-400 p-[2px] shrink-0 shadow-md shadow-emerald-500/20">
              <div className="w-full h-full bg-[#07110A] rounded-[9px] flex items-center justify-center font-black text-emerald-400 text-xs">
                S
              </div>
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <h4 className="text-xs font-bold text-white truncate">Install Scrolic App</h4>
                {!bonusClaimed && (
                  <span className="px-1.5 py-0.2 rounded text-[9px] font-extrabold bg-amber-500/20 text-amber-300 border border-amber-500/40 flex items-center gap-0.5 shrink-0">
                    <Zap className="w-2.5 h-2.5 fill-amber-400" /> +10 Energy
                  </span>
                )}
              </div>
              <p className="text-[10px] text-neutral-400 truncate">
                {bonusClaimed ? 'Pengalaman trading cepat tanpa browser' : 'Dapatkan bonus +10 Energy gratis!'}
              </p>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              onClick={handleInstallClick}
              disabled={isInstalling}
              className="px-3 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-neutral-950 text-xs font-extrabold flex items-center gap-1 shadow-md shadow-emerald-500/20 active:scale-95 transition-all cursor-pointer disabled:opacity-50"
            >
              <Download className="w-3.5 h-3.5" />
              <span>{bonusClaimed ? 'Install' : 'Install (+10)'}</span>
            </button>

            <button
              onClick={handleDismiss}
              className="w-7 h-7 rounded-lg bg-neutral-900/60 hover:bg-neutral-800 border border-white/5 flex items-center justify-center text-neutral-400 hover:text-white transition-colors cursor-pointer"
              title="Tutup penawaran"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* iOS Safari Installation Guide Modal */}
      {showIosGuide && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-4">
          <div className="w-full max-w-sm bg-[#0B150F] border border-emerald-500/30 rounded-3xl p-5 space-y-4 shadow-2xl animate-in fade-in duration-200">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Smartphone className="w-5 h-5 text-emerald-400" />
                <h3 className="font-bold text-white text-sm">Install di iOS Safari</h3>
              </div>
              <button
                onClick={() => setShowIosGuide(false)}
                className="w-7 h-7 rounded-full bg-neutral-900 flex items-center justify-center text-neutral-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs text-neutral-300">
              <div className="flex items-start gap-3 bg-[#112017] p-3 rounded-2xl border border-emerald-500/20">
                <span className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 font-bold flex items-center justify-center text-xs shrink-0">1</span>
                <p>Tekan tombol **Bagikan / Share** (<Share className="w-3.5 h-3.5 inline text-emerald-400" />) di bilah bawah browser Safari Anda.</p>
              </div>

              <div className="flex items-start gap-3 bg-[#112017] p-3 rounded-2xl border border-emerald-500/20">
                <span className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 font-bold flex items-center justify-center text-xs shrink-0">2</span>
                <p>Pilih menu **"Tambahkan ke Layar Utama" / "Add to Home Screen"**.</p>
              </div>

              <div className="flex items-start gap-3 bg-[#112017] p-3 rounded-2xl border border-emerald-500/20">
                <span className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 font-bold flex items-center justify-center text-xs shrink-0">3</span>
                <p>Buka ikon aplikasi Scrolic di layar HP Anda untuk mengklaim **+10 Energy gratis**!</p>
              </div>
            </div>

            <button
              onClick={() => {
                setShowIosGuide(false);
                claimInstallBonus();
              }}
              className="w-full py-2.5 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-neutral-950 text-xs font-bold text-center cursor-pointer"
            >
              Saya Sudah Menambahkan (+Klaim +10 Energy)
            </button>
          </div>
        </div>
      )}
    </>
  );
};

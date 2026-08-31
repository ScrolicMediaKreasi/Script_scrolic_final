import React, { useState } from 'react';
import { X, Edit3, CheckCircle2, Zap, Crown, Lock, Info, Sparkles } from 'lucide-react';
import { FeedPost, User } from '../types';

interface EditDescriptionModalProps {
  post: FeedPost | null;
  currentUser: User | null;
  onClose: () => void;
  onSave: (postId: string, newDescription: string, unlockFee?: number, followFee?: number) => void;
  onOpenSubscription?: () => void;
}

export const EditDescriptionModal: React.FC<EditDescriptionModalProps> = ({
  post,
  currentUser,
  onClose,
  onSave,
  onOpenSubscription
}) => {
  if (!post) return null;

  const isPremium = Boolean(currentUser && currentUser.subscriptionTier && currentUser.subscriptionTier !== 'free');

  const [desc, setDesc] = useState(post.customDescription || post.autoDescription || '');
  const [unlockFee, setUnlockFee] = useState<number>(post.unlockFee || 1);
  const [followFee, setFollowFee] = useState<number>(post.followFee || 1);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Revenue calculation
  const unlockTraderShare = Math.round(unlockFee * 0.8 * 100) / 100;
  const unlockPlatformFee = Math.round((unlockFee - unlockTraderShare) * 100) / 100;

  const followTraderShare = Math.round(followFee * 0.8 * 100) / 100;
  const followPlatformFee = Math.round((followFee - followTraderShare) * 100) / 100;

  const handleSave = async () => {
    setIsSaving(true);
    setErrorMessage(null);
    try {
      const res = await fetch(`/api/posts/${post.id}/setup-config`, {
        method: 'PATCH',
        headers: { 
          'Content-Type': 'application/json',
          'x-session-user-id': currentUser?.id || ''
        },
        body: JSON.stringify({ 
          customDescription: desc,
          unlockFee: isPremium ? unlockFee : 1,
          followFee: isPremium ? followFee : 1
        })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || data.error || 'Gagal menyimpan konfigurasi');
      }
      onSave(post.id, desc, data.unlockFee || unlockFee, data.followFee || followFee);
      onClose();
    } catch (err: any) {
      setErrorMessage(err.message);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-200">
      <div 
        id="edit-setup-modal"
        className="w-full max-w-lg bg-[#0A0A0A] border border-[#1f1f1f] rounded-t-3xl sm:rounded-2xl p-5 shadow-2xl relative max-h-[92vh] flex flex-col overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-[#1f1f1f] mb-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <Zap className="w-4 h-4 fill-amber-400" />
            </div>
            <div>
              <h3 className="font-bold text-white text-sm">Pengaturan Setup & Monetisasi</h3>
              <p className="text-[11px] text-neutral-400">Tentukan deskripsi & biaya unlock/ikuti setup</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-full bg-[#161616] border border-[#222222] flex items-center justify-center text-neutral-400 hover:text-white cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="space-y-4 overflow-y-auto pr-1 flex-1 text-xs">
          
          {errorMessage && (
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300">
              {errorMessage}
            </div>
          )}

          {/* 1. Custom Description */}
          <div className="space-y-1.5">
            <label className="text-neutral-300 font-bold flex items-center gap-1.5">
              <Edit3 className="w-3.5 h-3.5 text-amber-400" />
              <span>Deskripsi & Catatan Analisis</span>
            </label>
            <textarea
              id="textarea-post-desc"
              rows={3}
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              className="w-full bg-[#141414] border border-[#222222] rounded-xl p-3 text-xs text-white placeholder:text-neutral-600 focus:outline-none focus:border-amber-500 leading-relaxed"
              placeholder="Contoh: Menunggu konfirmasi engulfing H4 di area demand..."
            />
          </div>

          {/* 2. Biaya Unlock Setup (1-10 Energy) */}
          <div className="bg-[#121212] border border-[#222222] rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <span className="font-bold text-white text-xs block">Biaya Unlock Setup</span>
                <span className="text-[11px] text-neutral-400">Untuk membuka parameter SL/TP & Entry</span>
              </div>
              <div className="flex items-center gap-1 bg-amber-500/15 border border-amber-500/30 px-2.5 py-1 rounded-lg">
                <Zap className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                <span className="font-mono font-bold text-amber-300 text-xs">{unlockFee} Energy</span>
              </div>
            </div>

            {isPremium ? (
              <div className="space-y-2">
                <input
                  id="slider-unlock-fee"
                  type="range"
                  min="1"
                  max="10"
                  step="1"
                  value={unlockFee}
                  onChange={(e) => setUnlockFee(parseInt(e.target.value, 10))}
                  className="w-full accent-amber-500 cursor-pointer"
                />
                <div className="flex justify-between items-center text-[10px] text-neutral-400 font-mono">
                  <span>1 Energy</span>
                  <div className="flex gap-1">
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((num) => (
                      <button
                        key={num}
                        type="button"
                        onClick={() => setUnlockFee(num)}
                        className={`w-5 h-5 rounded flex items-center justify-center text-[10px] font-bold transition-colors cursor-pointer ${
                          unlockFee === num 
                            ? 'bg-amber-500 text-black' 
                            : 'bg-[#1b1b1b] text-neutral-400 hover:text-white'
                        }`}
                      >
                        {num}
                      </button>
                    ))}
                  </div>
                  <span>10 Energy</span>
                </div>
              </div>
            ) : (
              <div className="p-3 bg-amber-500/5 border border-amber-500/20 rounded-xl space-y-2">
                <div className="flex items-center gap-2 text-neutral-300">
                  <Lock className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  <span>Akun Free dikunci pada standar <strong>1 Energy</strong>.</span>
                </div>
                {onOpenSubscription && (
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onOpenSubscription();
                    }}
                    className="w-full py-1.5 px-3 rounded-lg bg-gradient-to-r from-amber-500 to-amber-600 text-black text-[11px] font-black flex items-center justify-center gap-1 cursor-pointer"
                  >
                    <Crown className="w-3 h-3 fill-black" />
                    <span>Upgrade ke Premium untuk Atur 1-10 Energy</span>
                  </button>
                )}
              </div>
            )}

            {/* Split breakdown */}
            <div className="grid grid-cols-2 gap-2 pt-2 border-t border-[#1f1f1f] text-[11px]">
              <div className="bg-[#161616] p-2 rounded-lg">
                <span className="text-neutral-400 block">Penghasilan Anda (80%)</span>
                <span className="font-mono font-bold text-emerald-400 text-xs">+{unlockTraderShare} Energy</span>
              </div>
              <div className="bg-[#161616] p-2 rounded-lg">
                <span className="text-neutral-400 block">Platform Fee (20%)</span>
                <span className="font-mono font-bold text-neutral-400 text-xs">{unlockPlatformFee} Energy</span>
              </div>
            </div>
          </div>

          {/* 3. Biaya Ikuti Setup (1-10 Energy) */}
          <div className="bg-[#121212] border border-[#222222] rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <span className="font-bold text-white text-xs block">Biaya Ikuti Setup</span>
                <span className="text-[11px] text-neutral-400">Saat user menyalin/mirror order trading Anda</span>
              </div>
              <div className="flex items-center gap-1 bg-emerald-500/15 border border-emerald-500/30 px-2.5 py-1 rounded-lg">
                <Zap className="w-3.5 h-3.5 fill-emerald-400 text-emerald-400" />
                <span className="font-mono font-bold text-emerald-300 text-xs">{followFee} Energy</span>
              </div>
            </div>

            {isPremium ? (
              <div className="space-y-2">
                <input
                  id="slider-follow-fee"
                  type="range"
                  min="1"
                  max="10"
                  step="1"
                  value={followFee}
                  onChange={(e) => setFollowFee(parseInt(e.target.value, 10))}
                  className="w-full accent-emerald-500 cursor-pointer"
                />
                <div className="flex justify-between items-center text-[10px] text-neutral-400 font-mono">
                  <span>1 Energy</span>
                  <div className="flex gap-1">
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((num) => (
                      <button
                        key={num}
                        type="button"
                        onClick={() => setFollowFee(num)}
                        className={`w-5 h-5 rounded flex items-center justify-center text-[10px] font-bold transition-colors cursor-pointer ${
                          followFee === num 
                            ? 'bg-emerald-500 text-black' 
                            : 'bg-[#1b1b1b] text-neutral-400 hover:text-white'
                        }`}
                      >
                        {num}
                      </button>
                    ))}
                  </div>
                  <span>10 Energy</span>
                </div>
              </div>
            ) : (
              <div className="p-3 bg-emerald-500/5 border border-emerald-500/20 rounded-xl space-y-2">
                <div className="flex items-center gap-2 text-neutral-300">
                  <Lock className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  <span>Akun Free dikunci pada standar <strong>1 Energy</strong>.</span>
                </div>
                {onOpenSubscription && (
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onOpenSubscription();
                    }}
                    className="w-full py-1.5 px-3 rounded-lg bg-gradient-to-r from-emerald-500 to-emerald-600 text-black text-[11px] font-black flex items-center justify-center gap-1 cursor-pointer"
                  >
                    <Crown className="w-3 h-3 fill-black" />
                    <span>Upgrade ke Premium untuk Atur 1-10 Energy</span>
                  </button>
                )}
              </div>
            )}

            {/* Split breakdown */}
            <div className="grid grid-cols-2 gap-2 pt-2 border-t border-[#1f1f1f] text-[11px]">
              <div className="bg-[#161616] p-2 rounded-lg">
                <span className="text-neutral-400 block">Penghasilan Anda (80%)</span>
                <span className="font-mono font-bold text-emerald-400 text-xs">+{followTraderShare} Energy</span>
              </div>
              <div className="bg-[#161616] p-2 rounded-lg">
                <span className="text-neutral-400 block">Platform Fee (20%)</span>
                <span className="font-mono font-bold text-neutral-400 text-xs">{followPlatformFee} Energy</span>
              </div>
            </div>
          </div>

          {/* Policy info */}
          <div className="flex items-start gap-2 p-3 rounded-xl bg-[#141414] border border-[#222222] text-neutral-400 text-[11px]">
            <Info className="w-4 h-4 text-sky-400 shrink-0 mt-0.5" />
            <p>
              Alokasi penghasilan <strong>80% Trader</strong> dan <strong>20% Platform Fee</strong> berlaku otomatis untuk setiap transaksi unlock dan ikuti setup Anda, baik pada akun Free maupun Premium.
            </p>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex gap-2 justify-end pt-3 border-t border-[#1f1f1f] mt-2">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-[#161616] hover:bg-[#222222] border border-[#262626] text-xs font-semibold text-neutral-300 cursor-pointer"
          >
            Batal
          </button>
          <button
            id="btn-save-post-config"
            disabled={isSaving}
            onClick={handleSave}
            className="px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-xs font-bold text-black flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>{isSaving ? 'Menyimpan...' : 'Simpan Perubahan'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};

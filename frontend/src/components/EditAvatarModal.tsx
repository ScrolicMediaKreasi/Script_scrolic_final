import React, { useState, useRef } from 'react';
import { 
  X, 
  Upload, 
  Image as ImageIcon, 
  Sparkles, 
  Check, 
  Camera, 
  RefreshCw,
  AlertCircle
} from 'lucide-react';
import { User } from '../types';
import { triggerHaptic } from '../utils/haptics';

interface EditAvatarModalProps {
  currentUser: User;
  onClose: () => void;
  onUpdateUser: (updatedUser: User) => void;
}

const PRESET_AVATARS = [
  'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=250&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=250&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=250&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=250&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=250&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1580489944761-15a19d654956?w=250&auto=format&fit=crop&q=80',
  'https://api.dicebear.com/7.x/bottts/svg?seed=AlphaTrader',
  'https://api.dicebear.com/7.x/bottts/svg?seed=GoldSniper',
  'https://api.dicebear.com/7.x/bottts/svg?seed=CyberScalp',
  'https://api.dicebear.com/7.x/bottts/svg?seed=BullMaster',
  'https://api.dicebear.com/7.x/personas/svg?seed=Alex',
  'https://api.dicebear.com/7.x/personas/svg?seed=Jordan'
];

/**
 * Resizes and compresses uploaded image files to a 300x300 JPEG data URL
 * to prevent payload overflow (413 Payload Too Large) and slow backend saves.
 */
const compressImageToDataUrl = (file: File, maxWidth = 300, maxHeight = 300, quality = 0.85): Promise<string> => {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const src = (e.target?.result as string) || '';
      if (!src) {
        resolve('');
        return;
      }
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > maxWidth) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          }
        } else {
          if (height > maxHeight) {
            width = Math.round((width * maxHeight) / height);
            height = maxHeight;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(src);
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = () => resolve(src);
      img.src = src;
    };
    reader.onerror = () => resolve('');
    reader.readAsDataURL(file);
  });
};

export const EditAvatarModal: React.FC<EditAvatarModalProps> = ({
  currentUser,
  onClose,
  onUpdateUser
}) => {
  const [selectedAvatar, setSelectedAvatar] = useState<string>(currentUser.avatar);
  const [customUrl, setCustomUrl] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'presets' | 'upload' | 'url'>('presets');
  const [isSaving, setIsSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Handle file upload with automatic canvas compression
  const processFile = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      setErrorMsg('Format file harus berupa gambar (JPG, PNG, WebP, GIF)');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setErrorMsg('Ukuran file maksimal 10MB');
      return;
    }
    setErrorMsg(null);
    try {
      const compressed = await compressImageToDataUrl(file, 300, 300, 0.85);
      if (compressed) {
        setSelectedAvatar(compressed);
        triggerHaptic('selection');
      } else {
        setErrorMsg('Gagal membaca gambar.');
      }
    } catch {
      setErrorMsg('Gagal memproses file gambar.');
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) processFile(file);
  };

  const handleApplyUrl = () => {
    if (!customUrl.trim()) return;
    setSelectedAvatar(customUrl.trim());
    triggerHaptic('selection');
  };

  const handleSave = async () => {
    if (!selectedAvatar) return;
    setIsSaving(true);
    setErrorMsg(null);
    try {
      const userId = currentUser.id || currentUser.username;
      const res = await fetch('/api/user/profile', {
        method: 'PATCH',
        headers: { 
          'Content-Type': 'application/json',
          'x-session-user-id': userId
        },
        body: JSON.stringify({ avatar: selectedAvatar })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || data.detail || data.message || 'Gagal mengubah foto profil');
      }

      const updatedUser = data.user ? { ...currentUser, ...data.user } : { ...currentUser, avatar: selectedAvatar };
      onUpdateUser(updatedUser);
      triggerHaptic('success');
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || 'Gagal mengubah foto profil');
      triggerHaptic('error');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div 
        id="edit-avatar-modal"
        className="w-full max-w-md bg-[#0D0D0D] border border-[#222222] rounded-3xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]"
      >
        {/* Header */}
        <div className="p-4 border-b border-[#1f1f1f] flex items-center justify-between bg-[#111111]">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <Camera className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-white text-sm">Ubah Foto Profil</h3>
              <p className="text-[11px] text-neutral-400">Pilih preset, unggah foto, atau gunakan URL</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full bg-[#1c1c1c] text-neutral-400 hover:text-white transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 overflow-y-auto space-y-5 flex-1">
          {/* Current vs New Preview */}
          <div className="flex flex-col items-center justify-center py-2">
            <div className="relative group">
              <div className="w-24 h-24 rounded-full p-[3px] bg-gradient-to-tr from-amber-500 via-emerald-400 to-indigo-500 shadow-xl shadow-amber-500/20 animate-pulse">
                <img 
                  src={selectedAvatar} 
                  alt="Preview Avatar" 
                  referrerPolicy="no-referrer"
                  className="w-full h-full rounded-full object-cover bg-neutral-900"
                />
              </div>
              <button 
                onClick={() => fileInputRef.current?.click()}
                className="absolute bottom-0 right-0 p-2 rounded-full bg-amber-500 text-black shadow-lg hover:scale-110 active:scale-95 transition-all cursor-pointer"
                title="Ganti Foto"
              >
                <Camera className="w-3.5 h-3.5" />
              </button>
            </div>
            <span className="text-xs font-bold text-white mt-2.5">@{currentUser.username}</span>
            <span className="text-[11px] text-neutral-400">Pratinjau Foto Profil Baru</span>
          </div>

          {errorMsg && (
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Tab Selector */}
          <div className="grid grid-cols-3 gap-1 bg-[#161616] p-1 rounded-2xl border border-[#262626]">
            <button
              onClick={() => { setActiveTab('presets'); triggerHaptic('selection'); }}
              className={`py-2 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                activeTab === 'presets' ? 'bg-amber-500 text-black shadow-md' : 'text-neutral-400 hover:text-white'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Pilihan</span>
            </button>
            <button
              onClick={() => { setActiveTab('upload'); triggerHaptic('selection'); }}
              className={`py-2 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                activeTab === 'upload' ? 'bg-amber-500 text-black shadow-md' : 'text-neutral-400 hover:text-white'
              }`}
            >
              <Upload className="w-3.5 h-3.5" />
              <span>Unggah</span>
            </button>
            <button
              onClick={() => { setActiveTab('url'); triggerHaptic('selection'); }}
              className={`py-2 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                activeTab === 'url' ? 'bg-amber-500 text-black shadow-md' : 'text-neutral-400 hover:text-white'
              }`}
            >
              <ImageIcon className="w-3.5 h-3.5" />
              <span>Link URL</span>
            </button>
          </div>

          {/* Tab 1: Presets Grid */}
          {activeTab === 'presets' && (
            <div className="space-y-2">
              <span className="text-[11px] font-semibold text-neutral-400 block">Pilih Avatar Khas Trader:</span>
              <div className="grid grid-cols-4 gap-3 max-h-48 overflow-y-auto p-1">
                {PRESET_AVATARS.map((url, idx) => {
                  const isSelected = selectedAvatar === url;
                  return (
                    <button
                      key={idx}
                      onClick={() => {
                        setSelectedAvatar(url);
                        triggerHaptic('selection');
                      }}
                      className={`relative rounded-2xl overflow-hidden aspect-square border-2 transition-all group cursor-pointer ${
                        isSelected 
                          ? 'border-amber-400 scale-105 shadow-md shadow-amber-500/30 ring-2 ring-amber-400/50' 
                          : 'border-[#262626] hover:border-neutral-500'
                      }`}
                    >
                      <img 
                        src={url} 
                        alt={`Avatar ${idx}`} 
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover bg-neutral-900 group-hover:scale-110 transition-transform" 
                      />
                      {isSelected && (
                        <div className="absolute inset-0 bg-amber-500/30 flex items-center justify-center backdrop-blur-[1px]">
                          <div className="w-5 h-5 rounded-full bg-amber-400 text-black flex items-center justify-center">
                            <Check className="w-3.5 h-3.5 stroke-[3]" />
                          </div>
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Tab 2: Upload File */}
          {activeTab === 'upload' && (
            <div className="space-y-3">
              <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handleFileChange} 
                accept="image/*" 
                className="hidden" 
              />
              <div
                onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`p-6 rounded-2xl border-2 border-dashed flex flex-col items-center justify-center text-center cursor-pointer transition-all ${
                  isDragging 
                    ? 'border-amber-400 bg-amber-500/10' 
                    : 'border-[#2e2e2e] bg-[#141414] hover:border-amber-500/60 hover:bg-[#181818]'
                }`}
              >
                <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/25 flex items-center justify-center text-amber-400 mb-3">
                  <Upload className="w-6 h-6" />
                </div>
                <span className="text-xs font-bold text-white mb-1">Klik atau seret foto ke sini</span>
                <span className="text-[10px] text-neutral-400">Mendukung JPG, PNG, WebP hingga 5MB</span>
              </div>
            </div>
          )}

          {/* Tab 3: Direct URL */}
          {activeTab === 'url' && (
            <div className="space-y-3">
              <label className="block text-[11px] font-semibold text-neutral-400">Tempel URL Gambar Langsung:</label>
              <div className="flex gap-2">
                <input
                  type="url"
                  value={customUrl}
                  onChange={(e) => setCustomUrl(e.target.value)}
                  placeholder="https://example.com/my-photo.jpg"
                  className="flex-1 bg-[#161616] border border-[#2a2a2a] rounded-xl px-3 py-2 text-xs text-white placeholder:text-neutral-600 focus:outline-none focus:border-amber-400"
                />
                <button
                  type="button"
                  onClick={handleApplyUrl}
                  className="px-3.5 py-2 rounded-xl bg-[#222222] hover:bg-[#2c2c2c] text-white text-xs font-bold transition-colors cursor-pointer"
                >
                  Terapkan
                </button>
              </div>
              <p className="text-[10px] text-neutral-500">Pastikan tautan dapat diakses secara publik (contoh: Gravatar, Imgur, Cloudinary, dll).</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-[#1f1f1f] bg-[#111111] flex gap-2">
          <button
            onClick={onClose}
            className="w-1/3 py-2.5 rounded-xl bg-[#1c1c1c] hover:bg-[#242424] text-neutral-300 font-bold text-xs transition-colors cursor-pointer"
          >
            Batal
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving || selectedAvatar === currentUser.avatar}
            className={`w-2/3 py-2.5 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition-all shadow-md cursor-pointer ${
              selectedAvatar !== currentUser.avatar
                ? 'bg-amber-500 hover:bg-amber-400 text-black shadow-amber-500/20'
                : 'bg-[#222222] text-neutral-500 cursor-not-allowed'
            }`}
          >
            {isSaving ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                <span>Menyimpan...</span>
              </>
            ) : (
              <>
                <Check className="w-4 h-4 stroke-[2.5]" />
                <span>Simpan Foto Profil</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

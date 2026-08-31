import React from 'react';
import { 
  Bell, 
  Check, 
  Zap, 
  Users, 
  Activity, 
  Heart, 
  MessageSquare, 
  ShieldCheck,
  CheckCheck
} from 'lucide-react';
import { Notification, User } from '../types';

interface NotificationsViewProps {
  notifications: Notification[];
  currentUser: User | null;
  onMarkAllAsRead: () => void;
  onSelectNotification?: (notif: Notification) => void;
  onOpenEnergy: () => void;
  onOpenReferral: () => void;
}

export const NotificationsView: React.FC<NotificationsViewProps> = ({
  notifications,
  currentUser,
  onMarkAllAsRead,
  onSelectNotification,
  onOpenEnergy,
  onOpenReferral
}) => {
  const getIcon = (type: string) => {
    switch (type) {
      case 'WITHDRAWAL':
      case 'KYC_VERIFIED':
        return <ShieldCheck className="w-4 h-4 text-emerald-400" />;
      case 'TRADE_OPENED':
      case 'TRADE_CLOSED':
      case 'TRADE_EARNING':
        return <Activity className="w-4 h-4 text-emerald-400" />;
      case 'FOLLOW':
        return <Users className="w-4 h-4 text-blue-400" />;
      case 'AFFILIATE_COMMISSION':
      case 'ENERGY_TOPUP':
      case 'PREMIUM_UPGRADE':
        return <Zap className="w-4 h-4 text-amber-400" />;
      case 'LIKE':
        return <Heart className="w-4 h-4 text-rose-400" />;
      case 'COMMENT':
        return <MessageSquare className="w-4 h-4 text-purple-400" />;
      default:
        return <Bell className="w-4 h-4 text-neutral-400" />;
    }
  };

  return (
    <div className="w-full max-w-md mx-auto pb-24 px-3 sm:px-0">
      
      {/* Header */}
      <div className="pt-2 pb-3 mb-3 flex items-center justify-between">
        <div>
          <h2 className="text-xl font-black text-white font-display">Notifikasi</h2>
          <p className="text-xs text-neutral-400">Aktivitas cTrader, Mirror, dan Komisi</p>
        </div>
        {notifications.length > 0 && (
          <button
            onClick={onMarkAllAsRead}
            className="text-xs text-amber-400 hover:underline flex items-center gap-1 font-semibold cursor-pointer"
          >
            <CheckCheck className="w-3.5 h-3.5" />
            <span>Tandai Semua Dibaca</span>
          </button>
        )}
      </div>

      {/* List */}
      <div className="space-y-2">
        {notifications.length === 0 ? (
          <div className="text-center py-16 bg-[#111111] rounded-2xl border border-[#1f1f1f] p-5">
            <Bell className="w-8 h-8 text-neutral-600 mx-auto mb-2" />
            <h4 className="text-white font-bold text-xs mb-1">Belum Ada Notifikasi</h4>
            <p className="text-[11px] text-neutral-400">
              Setiap trade baru, interaksi followers, dan komisi afiliasi akan muncul di sini.
            </p>
          </div>
        ) : (
          notifications.map((n) => (
            <div
              key={n.id}
              onClick={() => {
                if (onSelectNotification) {
                  onSelectNotification(n);
                }
                if (n.type === 'AFFILIATE_COMMISSION' || n.type === 'ENERGY_TOPUP' || n.type === 'PREMIUM_UPGRADE') {
                  onOpenEnergy();
                } else if (n.type === 'FOLLOW' || n.type === 'WITHDRAWAL' || n.type === 'KYC_VERIFIED') {
                  onOpenReferral();
                }
              }}
              className={`p-3.5 rounded-2xl border transition-all flex items-start gap-3 cursor-pointer ${
                n.isRead 
                  ? 'bg-[#0f0f0f] border-[#1a1a1a] opacity-80' 
                  : 'bg-[#141414] border-amber-500/30 shadow-sm hover:border-amber-500/50'
              }`}
            >
              <div className="p-2 rounded-xl bg-[#1a1a1a] border border-[#262626] shrink-0 mt-0.5">
                {getIcon(n.type)}
              </div>
              <div className="flex-1 space-y-0.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    {!n.isRead && (
                      <span className="w-2 h-2 rounded-full bg-amber-400 inline-block animate-pulse" />
                    )}
                    <h4 className="font-bold text-white text-xs">{n.title}</h4>
                  </div>
                  <span className="text-[10px] text-neutral-500 font-mono">
                    {new Date(n.createdAt).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
                <p className="text-xs text-neutral-300 leading-relaxed">{n.message}</p>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

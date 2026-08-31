import React from 'react';
import { Home, Compass, BarChart3, Newspaper, User as UserIcon } from 'lucide-react';
import { triggerHaptic } from '../utils/haptics';

export type NavTab = 'feed' | 'explore' | 'dashboard' | 'news' | 'profile';

interface BottomNavProps {
  currentTab: NavTab;
  onChangeTab: (tab: NavTab) => void;
  unreadCount?: number;
}

export const BottomNav: React.FC<BottomNavProps> = ({
  currentTab,
  onChangeTab,
  unreadCount = 0
}) => {
  const handleTabClick = (tab: NavTab) => {
    triggerHaptic('light');
    onChangeTab(tab);
  };

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 backdrop-blur-2xl bg-[#07130c]/95 border-t border-[#18633c]/30 pb-safe select-none shadow-2xl shadow-black">
      <div className="max-w-md mx-auto px-2 h-16 flex items-center justify-around relative">
        
        {/* Feed Tab */}
        <button
          id="tab-btn-feed"
          onClick={() => handleTabClick('feed')}
          className={`flex flex-col items-center justify-center gap-1 py-1 px-2.5 rounded-xl transition-all active:scale-90 cursor-pointer ${
            currentTab === 'feed' ? 'text-emerald-400 font-bold' : 'text-neutral-400 hover:text-neutral-200'
          }`}
        >
          <Home className="w-5 h-5" />
          <span className="text-[10px] font-semibold">Feed</span>
        </button>

        {/* Explore Tab */}
        <button
          id="tab-btn-explore"
          onClick={() => handleTabClick('explore')}
          className={`flex flex-col items-center justify-center gap-1 py-1 px-2.5 rounded-xl transition-all active:scale-90 cursor-pointer ${
            currentTab === 'explore' ? 'text-emerald-400 font-bold' : 'text-neutral-400 hover:text-neutral-200'
          }`}
        >
          <Compass className="w-5 h-5" />
          <span className="text-[10px] font-semibold">Explore</span>
        </button>

        {/* Dashboard Tab */}
        <button
          id="tab-btn-dashboard"
          onClick={() => handleTabClick('dashboard')}
          className={`flex flex-col items-center justify-center gap-1 py-1 px-2.5 rounded-xl transition-all active:scale-90 cursor-pointer ${
            currentTab === 'dashboard' ? 'text-emerald-400 font-bold' : 'text-neutral-400 hover:text-neutral-200'
          }`}
        >
          <BarChart3 className="w-5 h-5" />
          <span className="text-[10px] font-semibold">Dashboard</span>
        </button>

        {/* News & Economic Calendar Tab */}
        <button
          id="tab-btn-news"
          onClick={() => handleTabClick('news')}
          className={`relative flex flex-col items-center justify-center gap-1 py-1 px-2.5 rounded-xl transition-all active:scale-90 cursor-pointer ${
            currentTab === 'news' ? 'text-emerald-400 font-bold' : 'text-neutral-400 hover:text-neutral-200'
          }`}
        >
          <div className="relative">
            <Newspaper className="w-5 h-5" />
            <span className="absolute -top-0.5 -right-1 w-2 h-2 bg-emerald-400 rounded-full" />
          </div>
          <span className="text-[10px] font-semibold">News</span>
        </button>

        {/* Profile Tab */}
        <button
          id="tab-btn-profile"
          onClick={() => handleTabClick('profile')}
          className={`flex flex-col items-center justify-center gap-1 py-1 px-2.5 rounded-xl transition-all active:scale-90 cursor-pointer ${
            currentTab === 'profile' ? 'text-emerald-400 font-bold' : 'text-neutral-400 hover:text-neutral-200'
          }`}
        >
          <UserIcon className="w-5 h-5" />
          <span className="text-[10px] font-semibold">Profil</span>
        </button>
      </div>
    </nav>
  );
};

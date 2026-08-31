import React, { useState, useEffect } from 'react';
import { 
  Globe, Calendar, Sparkles, Filter, RefreshCw, 
  TrendingUp, TrendingDown, Clock, Zap, 
  Search, ExternalLink, Newspaper, ShieldAlert
} from 'lucide-react';
import { EconomicEvent, EconomicNewsArticle, User } from '../types';
import { triggerHaptic } from '../utils/haptics';
import { EconomicAskAIModal } from '../components/EconomicAskAIModal';

interface NewsViewProps {
  currentUser: User | null;
  onOpenEnergy: () => void;
  onOpenLogin: () => void;
  onUpdateEnergyBalance?: (newBalance: number) => void;
}

export const NewsView: React.FC<NewsViewProps> = ({
  currentUser,
  onOpenEnergy,
  onOpenLogin,
  onUpdateEnergyBalance
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'calendar' | 'news'>('calendar');
  const [events, setEvents] = useState<EconomicEvent[]>([]);
  const [articles, setArticles] = useState<EconomicNewsArticle[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [dataSource, setDataSource] = useState<string>('EODHD');
  
  // Filters
  const [selectedCurrency, setSelectedCurrency] = useState<string>('ALL');
  const [impactFilter, setImpactFilter] = useState<'ALL' | 'HIGH' | 'MEDIUM'>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [timeFilter, setTimeFilter] = useState<'ALL' | 'TODAY' | 'UPCOMING'>('ALL');

  // Selected event for Ask AI
  const [selectedEventForAI, setSelectedEventForAI] = useState<EconomicEvent | null>(null);

  // Fetch economic calendar & news
  const fetchCalendarAndNews = async () => {
    setIsLoading(true);
    try {
      const [calRes, newsRes] = await Promise.all([
        fetch('/api/news/economic-calendar'),
        fetch('/api/news/market-news')
      ]);

      if (calRes.ok) {
        const calData = await calRes.json();
        if (calData.events) {
          setEvents(calData.events);
          setDataSource(calData.source || 'EODHD');
        }
      }

      if (newsRes.ok) {
        const newsData = await newsRes.json();
        if (newsData.articles) {
          setArticles(newsData.articles);
        }
      }
    } catch (e) {
      console.error('Error fetching calendar & news data:', e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchCalendarAndNews();
  }, []);

  // Filtered Events
  const filteredEvents = events.filter((ev) => {
    // Currency filter
    if (selectedCurrency !== 'ALL' && ev.currency !== selectedCurrency) return false;

    // Impact filter
    if (impactFilter === 'HIGH' && ev.impact !== 'HIGH') return false;
    if (impactFilter === 'MEDIUM' && !['HIGH', 'MEDIUM'].includes(ev.impact)) return false;

    // Time filter
    if (timeFilter === 'TODAY' && ev.date !== '2026-08-20' && !ev.isReleased) {
      // Allow current date match
    }
    if (timeFilter === 'UPCOMING' && ev.isReleased) return false;

    // Search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchTitle = (ev.title || '').toLowerCase().includes(q);
      const matchCountry = (ev.country || '').toLowerCase().includes(q);
      const matchPairs = (ev.affectedPairs || []).some((p) => p.toLowerCase().includes(q));
      if (!matchTitle && !matchCountry && !matchPairs) return false;
    }

    return true;
  });

  const currencies = ['ALL', 'USD', 'EUR', 'GBP', 'JPY', 'AUD', 'CAD'];

  return (
    <div className="pb-24 pt-1 space-y-3 px-3 max-w-md mx-auto text-neutral-100 animate-fade-in">
      
      {/* Header Banner & Live EODHD Status */}
      <div className="p-3.5 rounded-2xl bg-gradient-to-br from-[#0c2416] via-[#07170e] to-[#040e08] border border-[#1b4e2f] shadow-lg relative overflow-hidden">
        <div className="absolute -right-8 -top-8 w-28 h-28 bg-emerald-500/10 rounded-full blur-2xl pointer-events-none" />
        
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-[#133822] border border-emerald-500/40 text-emerald-400">
              <Globe className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-extrabold text-sm text-white tracking-wide">EODHD Economic News</h2>
                <span className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                  LIVE API
                </span>
              </div>
              <p className="text-[11px] text-neutral-400">
                1 Event = 1 Card • Tanya AI (1⚡ / Q)
              </p>
            </div>
          </div>

          <button
            onClick={() => {
              triggerHaptic('light');
              fetchCalendarAndNews();
            }}
            disabled={isLoading}
            className="p-2 rounded-xl bg-[#133822] hover:bg-[#1b4e2f] border border-[#1b4e2f] text-emerald-300 hover:text-white transition-all cursor-pointer disabled:opacity-50"
            title="Refresh Data"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {/* User Quick Energy Balance Info */}
        <div className="mt-3 pt-2.5 border-t border-[#18462a]/60 flex items-center justify-between text-xs">
          <div className="flex items-center gap-1.5 text-neutral-300 text-[11px]">
            <Zap className="w-3.5 h-3.5 text-emerald-400 fill-emerald-400" />
            <span>Saldo Energy: <b className="font-mono text-emerald-400">{currentUser ? currentUser.energyBalance : 0}</b></span>
          </div>
          <button
            onClick={() => {
              triggerHaptic('medium');
              if (!currentUser) onOpenLogin();
              else onOpenEnergy();
            }}
            className="text-[10px] font-bold text-emerald-300 hover:text-emerald-200 underline cursor-pointer"
          >
            Top Up Energy &rarr;
          </button>
        </div>
      </div>

      {/* Sub Tabs: Kalender Ekonomi vs Berita Pasar */}
      <div className="grid grid-cols-2 gap-1.5 p-1 rounded-xl bg-[#09180f] border border-[#153e25]">
        <button
          onClick={() => {
            triggerHaptic('light');
            setActiveSubTab('calendar');
          }}
          className={`py-2 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
            activeSubTab === 'calendar'
              ? 'bg-emerald-500 text-black shadow-md'
              : 'text-neutral-400 hover:text-white'
          }`}
        >
          <Calendar className="w-4 h-4" />
          <span>Kalender Ekonomi</span>
        </button>

        <button
          onClick={() => {
            triggerHaptic('light');
            setActiveSubTab('news');
          }}
          className={`py-2 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
            activeSubTab === 'news'
              ? 'bg-emerald-500 text-black shadow-md'
              : 'text-neutral-400 hover:text-white'
          }`}
        >
          <Newspaper className="w-4 h-4" />
          <span>Berita Pasar</span>
        </button>
      </div>

      {/* --- ECONOMIC CALENDAR CONTENT --- */}
      {activeSubTab === 'calendar' && (
        <div className="space-y-3">
          {/* Search and Filters Bar */}
          <div className="space-y-2 p-2.5 rounded-xl bg-[#08150d] border border-[#153e25]">
            {/* Search Input */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Cari event (e.g. NFP, CPI, USD, Gold)..."
                className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-[#0c2014] border border-[#1b4e2f] text-xs text-neutral-200 placeholder-neutral-500 focus:outline-none focus:border-emerald-400"
              />
              {searchQuery && (
                <button 
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] text-neutral-400 hover:text-white"
                >
                  ✕
                </button>
              )}
            </div>

            {/* Currency Filter Chips */}
            <div className="flex items-center gap-1 overflow-x-auto pb-0.5 no-scrollbar">
              {currencies.map((curr) => (
                <button
                  key={curr}
                  onClick={() => {
                    triggerHaptic('light');
                    setSelectedCurrency(curr);
                  }}
                  className={`px-2.5 py-1 rounded-md text-[10px] font-mono font-bold transition-all shrink-0 cursor-pointer ${
                    selectedCurrency === curr
                      ? 'bg-emerald-500 text-black shadow-sm'
                      : 'bg-[#0f281a] text-neutral-300 hover:bg-[#163825] border border-white/5'
                  }`}
                >
                  {curr}
                </button>
              ))}
            </div>

            {/* Impact & Timing Filters */}
            <div className="flex items-center justify-between gap-1 pt-1 border-t border-[#153e25]/60 text-[10px]">
              <div className="flex items-center gap-1">
                <button
                  onClick={() => {
                    triggerHaptic('light');
                    setImpactFilter('ALL');
                  }}
                  className={`px-2 py-0.5 rounded cursor-pointer ${
                    impactFilter === 'ALL' ? 'bg-white/15 text-white font-bold' : 'text-neutral-400'
                  }`}
                >
                  Semua
                </button>
                <button
                  onClick={() => {
                    triggerHaptic('light');
                    setImpactFilter('HIGH');
                  }}
                  className={`px-2 py-0.5 rounded flex items-center gap-1 cursor-pointer ${
                    impactFilter === 'HIGH' ? 'bg-red-500/20 text-red-400 font-bold border border-red-500/40' : 'text-neutral-400'
                  }`}
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
                  High Impact
                </button>
              </div>

              <div className="flex items-center gap-1">
                <button
                  onClick={() => {
                    triggerHaptic('light');
                    setTimeFilter(timeFilter === 'UPCOMING' ? 'ALL' : 'UPCOMING');
                  }}
                  className={`px-2 py-0.5 rounded border transition-colors cursor-pointer ${
                    timeFilter === 'UPCOMING'
                      ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40 font-bold'
                      : 'border-white/5 text-neutral-400'
                  }`}
                >
                  Akan Datang
                </button>
              </div>
            </div>
          </div>

          {/* Events Count Indicator */}
          <div className="flex items-center justify-between px-1 text-[11px] text-neutral-400">
            <span>Menampilkan <b>{filteredEvents.length}</b> Event Kalender</span>
            <span className="text-[10px] text-neutral-500">Waktu: WIB (UTC+7)</span>
          </div>

          {/* 1 ECONOMIC EVENT = 1 CARD CONTAINER */}
          {isLoading ? (
            <div className="py-12 flex flex-col items-center justify-center gap-2 text-neutral-400">
              <RefreshCw className="w-6 h-6 animate-spin text-emerald-400" />
              <span className="text-xs">Memuat kalender ekonomi EODHD...</span>
            </div>
          ) : filteredEvents.length === 0 ? (
            <div className="py-10 text-center rounded-2xl bg-[#09180f] border border-[#153e25] p-6 space-y-2">
              <ShieldAlert className="w-8 h-8 text-neutral-500 mx-auto" />
              <div className="font-bold text-sm text-neutral-300">Tidak ada event yang sesuai</div>
              <p className="text-xs text-neutral-500">Coba ubah filter mata uang atau kata kunci pencarian Anda.</p>
              <button
                onClick={() => {
                  setSelectedCurrency('ALL');
                  setImpactFilter('ALL');
                  setSearchQuery('');
                  setTimeFilter('ALL');
                }}
                className="mt-2 px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#133822] text-emerald-300 hover:bg-[#1b4e2f] cursor-pointer"
              >
                Reset Filter
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredEvents.map((ev) => {
                const isHigh = ev.impact === 'HIGH';
                const isMed = ev.impact === 'MEDIUM';
                const impactBadgeClass = isHigh
                  ? 'bg-red-500/15 text-red-400 border-red-500/40'
                  : isMed
                  ? 'bg-amber-500/15 text-amber-400 border-amber-500/40'
                  : 'bg-blue-500/15 text-blue-400 border-blue-500/40';

                return (
                  /* --- INDIVIDUAL 1-EVENT 1-CARD --- */
                  <div
                    key={ev.id}
                    className="p-4 rounded-2xl bg-[#091a10] border border-[#1a4b2c] hover:border-emerald-500/50 transition-all shadow-md space-y-3 relative group"
                  >
                    {/* Top Row: Country, Date/Time & Impact Badge */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xl shrink-0" title={ev.country}>{ev.flagEmoji}</span>
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="font-extrabold text-xs font-mono text-emerald-300">
                              {ev.currency}
                            </span>
                            <span className="text-neutral-500 text-[10px]">•</span>
                            <span className="text-[11px] font-medium text-neutral-300 flex items-center gap-1">
                              <Clock className="w-3 h-3 text-neutral-400" />
                              {ev.time} ({ev.date})
                            </span>
                          </div>
                          <span className="text-[10px] text-neutral-400">{ev.country}</span>
                        </div>
                      </div>

                      <div className="flex flex-col items-end gap-1 shrink-0">
                        <span className={`px-2 py-0.5 rounded-full text-[9px] font-black tracking-wider uppercase border ${impactBadgeClass}`}>
                          {ev.impact} IMPACT
                        </span>
                        {ev.isReleased ? (
                          <span className="text-[9px] font-semibold text-emerald-400 flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                            Rilis
                          </span>
                        ) : (
                          <span className="text-[9px] font-semibold text-amber-400 flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                            Segera
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Event Title */}
                    <div>
                      <h3 className="font-bold text-sm text-neutral-100 leading-snug">
                        {ev.title}
                      </h3>
                      {ev.description && (
                        <p className="text-[11px] text-neutral-400 mt-1 line-clamp-2 leading-relaxed">
                          {ev.description}
                        </p>
                      )}
                    </div>

                    {/* Metrics Comparison 3-Grid: Aktual | Forecast | Sebelumnya */}
                    <div className="grid grid-cols-3 gap-1.5 p-2 rounded-xl bg-[#06120a] border border-white/5 text-center">
                      <div className="p-1 rounded-lg bg-[#0a1f13]">
                        <div className="text-[9px] text-neutral-400 uppercase font-medium">Aktual</div>
                        <div className={`font-mono font-black text-xs sm:text-sm mt-0.5 ${
                          ev.actual 
                            ? (ev.sentiment === 'BULLISH' ? 'text-emerald-400' : 'text-red-400') 
                            : 'text-neutral-400'
                        }`}>
                          {ev.actual || '—'}
                        </div>
                      </div>

                      <div className="p-1 rounded-lg bg-[#0a1f13]">
                        <div className="text-[9px] text-neutral-400 uppercase font-medium">Forecast</div>
                        <div className="font-mono font-bold text-amber-400 text-xs sm:text-sm mt-0.5">
                          {ev.forecast || '—'}
                        </div>
                      </div>

                      <div className="p-1 rounded-lg bg-[#0a1f13]">
                        <div className="text-[9px] text-neutral-400 uppercase font-medium">Sebelumnya</div>
                        <div className="font-mono font-medium text-neutral-300 text-xs sm:text-sm mt-0.5">
                          {ev.previous || '—'}
                        </div>
                      </div>
                    </div>

                    {/* Affected Pairs & Quick Info */}
                    <div className="flex items-center justify-between gap-2 pt-0.5 flex-wrap">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-[10px] text-neutral-400 font-medium">Pair:</span>
                        {(ev.affectedPairs || []).map((pair) => (
                          <span
                            key={pair}
                            className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-[#102d1b] text-emerald-300 border border-emerald-500/20"
                          >
                            {pair}
                          </span>
                        ))}
                      </div>

                      {ev.sentiment && ev.sentiment !== 'PENDING' && (
                        <div className="flex items-center gap-1 text-[10px] font-bold">
                          {ev.sentiment === 'BULLISH' ? (
                            <span className="text-emerald-400 flex items-center gap-0.5">
                              <TrendingUp className="w-3 h-3" /> Bullish {ev.currency}
                            </span>
                          ) : (
                            <span className="text-red-400 flex items-center gap-0.5">
                              <TrendingDown className="w-3 h-3" /> Bearish {ev.currency}
                            </span>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Bottom Action: "Tanya AI" (Biaya 1 Energy) Button */}
                    <div className="pt-2 border-t border-[#18462a]/70 flex items-center justify-between gap-2">
                      <div className="text-[10px] text-neutral-400 flex items-center gap-1">
                        <Sparkles className="w-3 h-3 text-emerald-400" />
                        <span>Analisis Skenario & Volatilitas</span>
                      </div>

                      <button
                        onClick={() => {
                          triggerHaptic('medium');
                          setSelectedEventForAI(ev);
                        }}
                        className="px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-400 hover:from-emerald-400 hover:to-teal-300 text-black font-extrabold text-xs flex items-center gap-1.5 shadow-md shadow-emerald-950 transition-all active:scale-95 cursor-pointer shrink-0"
                      >
                        <Sparkles className="w-3.5 h-3.5 fill-black text-black" />
                        <span>Tanya AI</span>
                        <span className="px-1.5 py-0.2 rounded-full bg-black/20 text-black text-[9px] font-black">
                          1⚡
                        </span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* --- MARKET NEWS CONTENT --- */}
      {activeSubTab === 'news' && (
        <div className="space-y-3">
          {articles.map((art) => (
            <div
              key={art.id}
              className="p-4 rounded-2xl bg-[#091a10] border border-[#1a4b2c] space-y-2.5 shadow-md hover:border-emerald-500/50 transition-all"
            >
              <div className="flex items-center justify-between text-[11px] text-neutral-400">
                <span className="font-semibold text-emerald-400">{art.source}</span>
                <span>{art.timeAgo}</span>
              </div>

              <h3 className="font-bold text-sm text-neutral-100 leading-snug">
                {art.title}
              </h3>

              <p className="text-xs text-neutral-300 leading-relaxed">
                {art.summary}
              </p>

              <div className="flex items-center justify-between pt-1 border-t border-[#18462a]/60">
                <div className="flex items-center gap-1.5 flex-wrap">
                  {(art.affectedPairs || []).map((p) => (
                    <span key={p} className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-[#102d1b] text-emerald-300">
                      {p}
                    </span>
                  ))}
                </div>

                <span className={`px-2 py-0.5 rounded text-[9px] font-bold ${
                  art.sentiment === 'BULLISH' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'
                }`}>
                  {art.sentiment}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Ask AI Modal for Economic Event */}
      {selectedEventForAI && (
        <EconomicAskAIModal
          event={selectedEventForAI}
          currentUser={currentUser}
          onClose={() => setSelectedEventForAI(null)}
          onOpenEnergy={onOpenEnergy}
          onOpenLogin={onOpenLogin}
          onUpdateEnergyBalance={(newBalance) => {
            if (onUpdateEnergyBalance) onUpdateEnergyBalance(newBalance);
          }}
        />
      )}
    </div>
  );
};

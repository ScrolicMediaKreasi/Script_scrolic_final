import React, { useState } from 'react';
import { Sparkles, X, Zap, Send, BrainCircuit, AlertCircle, CheckCircle, RefreshCw, MessageSquare } from 'lucide-react';
import { EconomicEvent, User } from '../types';
import { triggerHaptic } from '../utils/haptics';

interface EconomicAskAIModalProps {
  event: EconomicEvent;
  currentUser: User | null;
  onClose: () => void;
  onOpenEnergy: () => void;
  onOpenLogin: () => void;
  onUpdateEnergyBalance?: (newBalance: number) => void;
}

export const EconomicAskAIModal: React.FC<EconomicAskAIModalProps> = ({
  event,
  currentUser,
  onClose,
  onOpenEnergy,
  onOpenLogin,
  onUpdateEnergyBalance
}) => {
  const [question, setQuestion] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [answer, setAnswer] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const affectedPairsList = Array.isArray(event.affectedPairs) && event.affectedPairs.length > 0 
    ? event.affectedPairs 
    : ['XAUUSD', 'EURUSD', 'GBPUSD'];

  const presetQuestions = [
    `Bagaimana proyeksi dampak ${event.title || 'Event'} ke ${affectedPairsList.slice(0, 3).join(' & ')}?`,
    `Apa skenario trading jika data Aktual > Forecast vs Aktual < Forecast?`,
    `Apakah aman open posisi scalping saat rilis news ${event.title || 'Event'}?`,
    `Rekomendasi SL dan mitigasi resiko slippage untuk event ${event.impact || 'High'} Impact ini?`
  ];

  const handleAsk = async (queryText?: string) => {
    const finalQuestion = (queryText || question).trim();
    if (!currentUser) {
      onOpenLogin();
      return;
    }

    if (currentUser.energyBalance < 1) {
      setError('Energy Anda tidak mencukupi (Butuh 1 Energy per pertanyaan)');
      triggerHaptic('warning');
      return;
    }

    setIsLoading(true);
    setError(null);
    triggerHaptic('medium');

    try {
      const res = await fetch('/api/ai/ask-economic', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventTitle: event.title,
          currency: event.currency,
          impact: event.impact,
          actual: event.actual,
          forecast: event.forecast,
          previous: event.previous,
          affectedPairs: affectedPairsList,
          question: finalQuestion || undefined
        })
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Gagal memproses analisis AI');
      }

      const cleanText = (data.answer || '').replace(/\*/g, '').trim();
      setAnswer(cleanText);
      if (typeof data.energyBalance === 'number' && onUpdateEnergyBalance) {
        onUpdateEnergyBalance(data.energyBalance);
      }
      triggerHaptic('success');
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Terjadi kesalahan saat memanggil Gemini AI');
      triggerHaptic('error');
    } finally {
      setIsLoading(false);
    }
  };

  const impactColor = 
    event.impact === 'HIGH' ? 'text-red-400 bg-red-950/60 border-red-500/40' :
    event.impact === 'MEDIUM' ? 'text-amber-400 bg-amber-950/60 border-amber-500/40' :
    'text-blue-400 bg-blue-950/60 border-blue-500/40';

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/80 backdrop-blur-md animate-fade-in">
      <div className="w-full max-w-lg bg-[#0a1810] border border-[#1b4e2f] rounded-t-3xl sm:rounded-2xl p-5 shadow-2xl flex flex-col max-h-[92vh] overflow-hidden text-neutral-100 animate-slide-up">
        
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-[#18462a]">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-[#133320] border border-emerald-500/40 text-emerald-400">
              <BrainCircuit className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-sm sm:text-base text-neutral-100 flex items-center gap-1.5">
                  <span>{event.flagEmoji}</span>
                  <span>Tanya Gemini AI Macro</span>
                </h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 flex items-center gap-1">
                  <Zap className="w-3 h-3 fill-emerald-400" />
                  1 Energy
                </span>
              </div>
              <p className="text-[11px] text-neutral-400 line-clamp-1">
                {event.title} • {event.time}
              </p>
            </div>
          </div>

          <button
            onClick={() => {
              triggerHaptic('light');
              onClose();
            }}
            className="p-1.5 rounded-full bg-[#12281b] text-neutral-400 hover:text-white hover:bg-[#1a3826] transition-all cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto py-3 space-y-3.5 pr-1 text-xs">
          {/* Target Event Context Pill */}
          <div className="p-3 rounded-xl bg-[#0c1f15] border border-[#18462a] space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-neutral-300 flex items-center gap-1.5">
                <span className="text-base">{event.flagEmoji}</span>
                <span className="font-bold text-white">{event.currency}</span> - {event.title}
              </span>
              <span className={`px-2 py-0.5 rounded-md text-[10px] font-black border ${impactColor}`}>
                {event.impact} IMPACT
              </span>
            </div>

            <div className="grid grid-cols-3 gap-2 py-1.5 px-2.5 rounded-lg bg-[#07130c] border border-white/5 text-center">
              <div>
                <div className="text-[10px] text-neutral-400">Aktual</div>
                <div className="font-mono font-bold text-white text-xs">{event.actual || '-'}</div>
              </div>
              <div>
                <div className="text-[10px] text-neutral-400">Forecast</div>
                <div className="font-mono font-bold text-amber-400 text-xs">{event.forecast || '-'}</div>
              </div>
              <div>
                <div className="text-[10px] text-neutral-400">Sebelumnya</div>
                <div className="font-mono font-bold text-neutral-300 text-xs">{event.previous || '-'}</div>
              </div>
            </div>

            <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
              <span className="text-[10px] text-neutral-400 font-medium">Pair Terkait:</span>
              {affectedPairsList.map((p) => (
                <span key={p} className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-[#133320] text-emerald-300 border border-emerald-500/30">
                  {p}
                </span>
              ))}
            </div>
          </div>

          {/* User Energy Balance Indicator */}
          {currentUser && (
            <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-[#12281b]/70 border border-[#1b4e2f]">
              <div className="flex items-center gap-2">
                <Zap className="w-4 h-4 text-emerald-400 fill-emerald-400" />
                <span className="text-neutral-300 text-[11px]">
                  Saldo Energy Anda: <b className="text-emerald-400 font-mono">{currentUser.energyBalance}</b>
                </span>
              </div>
              {currentUser.energyBalance < 1 ? (
                <button
                  onClick={() => {
                    triggerHaptic('medium');
                    onOpenEnergy();
                  }}
                  className="px-2.5 py-1 rounded-lg text-[10px] font-bold bg-amber-500 text-black hover:bg-amber-400 transition-all cursor-pointer flex items-center gap-1"
                >
                  <Zap className="w-3 h-3 fill-black" />
                  Top Up Energy
                </button>
              ) : (
                <span className="text-[10px] text-emerald-400 font-semibold">Cukup (Biaya 1⚡)</span>
              )}
            </div>
          )}

          {/* Preset Quick Questions */}
          {!answer && (
            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold text-neutral-300 flex items-center gap-1">
                <MessageSquare className="w-3.5 h-3.5 text-emerald-400" />
                Pilih Pertanyaan Cepat:
              </label>
              <div className="grid grid-cols-1 gap-1.5">
                {presetQuestions.map((q, idx) => (
                  <button
                    key={idx}
                    disabled={isLoading}
                    onClick={() => {
                      setQuestion(q);
                      handleAsk(q);
                    }}
                    className="p-2.5 rounded-xl bg-[#0e2417] hover:bg-[#153823] border border-[#18462a] text-left text-[11px] text-neutral-200 hover:text-white transition-all cursor-pointer flex items-start gap-2 group active:scale-[0.99]"
                  >
                    <span className="p-1 rounded bg-[#133320] text-emerald-400 group-hover:bg-emerald-500 group-hover:text-black transition-colors shrink-0">
                      <Sparkles className="w-3 h-3" />
                    </span>
                    <span className="leading-snug">{q}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* AI Response Display */}
          {answer && (
            <div className="p-3.5 rounded-xl bg-[#07150d] border border-emerald-500/40 space-y-2 animate-fade-in shadow-inner">
              <div className="flex items-center justify-between pb-2 border-b border-[#18462a]">
                <div className="flex items-center gap-1.5 text-emerald-400 font-bold text-xs">
                  <CheckCircle className="w-4 h-4" />
                  <span>Jawaban Analis Gemini AI</span>
                </div>
                <button
                  onClick={() => {
                    setAnswer(null);
                    setQuestion('');
                  }}
                  className="text-[10px] text-neutral-400 hover:text-emerald-300 flex items-center gap-1 cursor-pointer"
                >
                  <RefreshCw className="w-3 h-3" />
                  Tanya Ulang
                </button>
              </div>
              <div className="text-neutral-200 text-xs leading-relaxed whitespace-pre-line font-sans space-y-1">
                {answer}
              </div>
            </div>
          )}

          {/* Error display */}
          {error && (
            <div className="p-3 rounded-xl bg-red-950/50 border border-red-500/50 text-red-300 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
              <span className="text-xs">{error}</span>
            </div>
          )}
        </div>

        {/* Bottom Input Field for Custom Questions */}
        <div className="pt-3 border-t border-[#18462a] flex items-center gap-2">
          <input
            type="text"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !isLoading && question.trim()) {
                handleAsk();
              }
            }}
            placeholder="Tanya apapun tentang news ini... (1⚡)"
            disabled={isLoading}
            className="flex-1 px-3.5 py-2.5 rounded-xl bg-[#0c1f15] border border-[#1b4e2f] text-neutral-100 placeholder-neutral-500 text-xs focus:outline-none focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400"
          />

          <button
            onClick={() => handleAsk()}
            disabled={isLoading || !question.trim()}
            className="px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 disabled:pointer-events-none text-black font-bold text-xs flex items-center gap-1.5 transition-all shadow-md active:scale-95 cursor-pointer shrink-0"
          >
            {isLoading ? (
              <RefreshCw className="w-4 h-4 animate-spin text-black" />
            ) : (
              <>
                <span>Tanya</span>
                <Send className="w-3.5 h-3.5" />
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

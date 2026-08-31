import React, { useState } from 'react';
import { X, Sparkles, Send, Bot, User as UserIcon, AlertTriangle, Zap, CheckCircle2 } from 'lucide-react';
import { FeedPost, User } from '../types';

interface AskAIModalProps {
  post: FeedPost | null;
  currentUser: User;
  onClose: () => void;
  onQuestionAsked?: () => void;
  performanceContext?: { traderUsername: string; performance: unknown };
  onEnergyDeducted?: (newBalance: number) => void;
}

interface AIMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

export const AskAIModal: React.FC<AskAIModalProps> = ({
  post,
  currentUser,
  onClose,
  onQuestionAsked,
  performanceContext,
  onEnergyDeducted
}) => {
  const trade = post?.trade;
  const user = post?.user;
  const strategy = post?.strategy;
  const tradeProfit = trade?.profitUSD ?? 0;
  const tradePips = trade?.pips ?? 0;
  const [messages, setMessages] = useState<AIMessage[]>([
    {
      id: 'msg_welcome',
      role: 'assistant',
      content: performanceContext
        ? `Halo! Saya Scrolic AI. Saya siap menganalisis performance trader @${performanceContext.traderUsername} berdasarkan data historis yang tersedia.`
        : `Halo! Saya Scrolic AI. Saya siap menganalisis live trade ${trade?.symbol || 'ini'} ${trade?.direction || ''} milik @${user?.username || 'trader'} yang menggunakan strategi ${strategy?.name || 'General'}. Tanyakan apa saja mengenai kondisi posisi, level risiko, atau validitas setup ini!`,
      timestamp: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
    }
  ]);
  const [inputQuestion, setInputQuestion] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  if (!post && !performanceContext) return null;

  const quickQuestions = [
    ...(performanceContext ? [
      'Seberapa konsisten performa trader ini?',
      'Apa pola profit dan loss yang terlihat?',
      'Risiko apa yang paling menonjol dari histori ini?',
      'Apa kekuatan strategi berdasarkan data?'
    ] : [
      'Apakah posisi ini masih sesuai setup?',
      'Apa risiko terbesar posisi ini?',
      'Bagaimana evaluasi kondisi R:R saat ini?',
      'Apa yang berubah sejak posisi dibuka?'
    ])
  ];

  const handleSend = async (questionText: string) => {
    const q = questionText.trim();
    if (!q || isLoading) return;

    if (currentUser.energyBalance < 1) {
      setErrorMessage('Energy Anda tidak mencukupi (1 Energy per pertanyaan). Silakan top up Energy.');
      return;
    }

    setErrorMessage('');
    const userMsg: AIMessage = {
      id: `msg_usr_${Date.now()}`,
      role: 'user',
      content: q,
      timestamp: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputQuestion('');
    setIsLoading(true);

    try {
      const response = await fetch(performanceContext ? '/api/ai/ask-performance' : '/api/ai/ask-trade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-session-user-id': currentUser.id },
        body: JSON.stringify({
          ...(performanceContext
            ? { session_id: currentUser.id, traderUsername: performanceContext.traderUsername, performance: performanceContext.performance, question: q }
            : { postId: post!.id, question: q })
        })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Gagal memproses pertanyaan');
      }

      const cleanAnswer = (data.answer || '').replace(/\*/g, '').trim();

      const aiMsg: AIMessage = {
        id: `msg_ai_${Date.now()}`,
        role: 'assistant',
        content: cleanAnswer,
        timestamp: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
      };

      setMessages((prev) => [...prev, aiMsg]);
      if (typeof data.energyBalance === 'number') onEnergyDeducted?.(data.energyBalance);
      if (onQuestionAsked) onQuestionAsked();
    } catch (err: any) {
      setErrorMessage(err.message || 'Terjadi kesalahan saat memanggil AI.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-200">
      <div 
        id="ask-ai-sheet"
        className="w-full max-w-lg bg-[#0A0A0A] border border-[#1f1f1f] rounded-t-3xl sm:rounded-2xl max-h-[92vh] flex flex-col overflow-hidden shadow-2xl relative"
      >
        {/* Header */}
        <div className="p-4 border-b border-[#1f1f1f] flex items-center justify-between bg-[#0e0e0e]">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-purple-500/15 border border-purple-500/30 flex items-center justify-center text-purple-300">
              <Sparkles className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <h3 className="font-bold text-white text-sm">Tanya Scrolic AI</h3>
                <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-purple-500/20 text-purple-300 border border-purple-500/30">
                  Gemini 3.7 Flash
                </span>
              </div>
              <p className="text-[11px] text-neutral-400">
                {performanceContext ? `Analisis Performance @${performanceContext.traderUsername}` : `Analisis Kontekstual Trade #${post?.tradeId ? post.tradeId.slice(-6) : (post?.id ? post.id.slice(-6) : 'LIVE')}`}
              </p>
            </div>
          </div>
          <button
            id="btn-close-ai-modal"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-[#161616] border border-[#222222] hover:bg-[#222222] flex items-center justify-center text-neutral-400 hover:text-white transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Trade Context Micro-Bar */}
        <div className="bg-[#111111] px-4 py-2 border-b border-[#1f1f1f] flex items-center justify-between text-xs font-mono text-neutral-300">
          <div className="flex items-center gap-2">
            <span className="font-bold text-white">{performanceContext ? `@${performanceContext.traderUsername}` : (trade?.symbol || 'Trade')}</span>
            {!performanceContext && <span className={trade?.direction === 'BUY' ? 'text-emerald-400' : 'text-rose-400'}>{trade?.direction || '-'}</span>}
            <span className="text-neutral-500">•</span>
            <span className="text-amber-300">{performanceContext ? 'Performance' : (strategy?.name || 'General')}</span>
          </div>
          <div className="text-right">
            <span className={tradeProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
              {performanceContext ? 'Data historis' : `${tradeProfit >= 0 ? '+' : ''}${tradePips.toFixed(1)} Pips`}
            </span>
          </div>
        </div>

        {/* Chat Stream View */}
        <div className="p-4 overflow-y-auto space-y-3.5 flex-1 no-scrollbar text-xs">
          {messages.map((msg) => (
            <div 
              key={msg.id}
              className={`flex gap-2.5 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              {msg.role === 'assistant' && (
                <div className="w-7 h-7 rounded-lg bg-purple-600/20 border border-purple-500/30 flex items-center justify-center text-purple-300 flex-shrink-0 mt-0.5">
                  <Bot className="w-4 h-4" />
                </div>
              )}
              <div className={`max-w-[85%] rounded-2xl p-3.5 leading-relaxed ${
                msg.role === 'user' 
                  ? 'bg-purple-600 text-white rounded-br-none shadow-md' 
                  : 'bg-[#141414] border border-[#222222] text-neutral-200 rounded-bl-none shadow-sm'
              }`}>
                <div className="whitespace-pre-wrap">{msg.content}</div>
                <span className="block mt-1 text-[9px] opacity-60 text-right">
                  {msg.timestamp}
                </span>
              </div>
              {msg.role === 'user' && (
                <div className="w-7 h-7 rounded-lg bg-[#1a1a1a] border border-[#262626] flex items-center justify-center text-neutral-300 flex-shrink-0 mt-0.5">
                  <UserIcon className="w-4 h-4" />
                </div>
              )}
            </div>
          ))}

          {isLoading && (
            <div className="flex gap-2.5 items-center text-purple-300 text-xs">
              <div className="w-7 h-7 rounded-lg bg-purple-600/20 flex items-center justify-center">
                <Sparkles className="w-4 h-4 animate-spin" />
              </div>
              <span className="animate-pulse">Scrolic AI sedang menganalisis data live position...</span>
            </div>
          )}

          {errorMessage && (
            <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-red-300 text-xs flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}
        </div>

        {/* Quick Question Chips */}
        <div className="p-3 border-t border-[#1f1f1f] bg-[#0c0c0c]">
          <span className="text-[10px] text-neutral-400 block mb-1.5 font-semibold">
            Pertanyaan Rekomendasi (1 Energy):
          </span>
          <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-1">
            {quickQuestions.map((q, idx) => (
              <button
                key={idx}
                onClick={() => handleSend(q)}
                disabled={isLoading}
                className="whitespace-nowrap px-2.5 py-1 rounded-lg bg-[#141414] hover:bg-purple-950/40 border border-[#222222] hover:border-purple-500/40 text-[11px] text-neutral-300 hover:text-purple-200 transition-all cursor-pointer disabled:opacity-50"
              >
                {q}
              </button>
            ))}
          </div>
        </div>

        {/* Input Bar */}
        <div className="p-3 border-t border-[#1f1f1f] bg-[#0e0e0e] flex items-center gap-2">
          <input
            id="input-ai-prompt"
            type="text"
            placeholder="Tanyakan analisis posisi ini (1 Energy)..."
            value={inputQuestion}
            onChange={(e) => setInputQuestion(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend(inputQuestion)}
            className="flex-1 bg-[#141414] border border-[#222222] rounded-xl px-3 py-2.5 text-xs text-white placeholder:text-neutral-500 focus:outline-none focus:border-purple-500"
          />
          <button
            id="btn-submit-ai"
            onClick={() => handleSend(inputQuestion)}
            disabled={!inputQuestion.trim() || isLoading}
            className="px-3.5 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold flex items-center gap-1 transition-all disabled:opacity-40 cursor-pointer shadow-md shadow-purple-600/20"
          >
            <Send className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Disclaimer */}
        <div className="px-3 py-1.5 bg-[#080808] text-[10px] text-neutral-500 text-center border-t border-[#161616]">
          Disclaimer: Analisis AI bersifat edukatif & independen, bukan rekomendasi finansial mutlak.
        </div>
      </div>
    </div>
  );
};

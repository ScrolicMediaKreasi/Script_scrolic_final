import React, { useState, useEffect } from 'react';
import { X, Send, Heart, MessageSquare } from 'lucide-react';
import { FeedPost, User, Comment } from '../types';

interface CommentsDrawerProps {
  post: FeedPost | null;
  currentUser: User | null;
  onClose: () => void;
  onCommentAdded: (postId: string, comment: Comment) => void;
}

export const CommentsDrawer: React.FC<CommentsDrawerProps> = ({
  post,
  currentUser,
  onClose,
  onCommentAdded
}) => {
  if (!post) return null;

  const [comments, setComments] = useState<Comment[]>([]);
  const [inputText, setInputText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    fetch(`/api/posts/${post.id}/comments`)
      .then((res) => res.json())
      .then((data) => {
        if (data.comments) setComments(data.comments);
      })
      .catch((err) => console.error(err));
  }, [post.id]);

  const handleSend = async () => {
    const text = inputText.trim();
    if (!text || isSubmitting) return;

    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/posts/${post.id}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: text })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Gagal mengirim komentar');
      setComments((prev) => [...prev, data.comment]);
      setInputText('');
      onCommentAdded(post.id, data.comment);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-200">
      <div 
        id="comments-drawer"
        className="w-full max-w-md bg-[#0A0A0A] border border-[#1f1f1f] rounded-t-3xl sm:rounded-2xl max-h-[85vh] flex flex-col overflow-hidden shadow-2xl relative"
      >
        {/* Header */}
        <div className="p-4 border-b border-[#1f1f1f] flex items-center justify-between bg-[#0e0e0e]">
          <div className="flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-amber-400" />
            <h3 className="font-bold text-white text-sm">Diskusi Komunitas</h3>
            <span className="text-xs text-neutral-400 font-mono">({comments.length})</span>
          </div>
          <button
            id="btn-close-comments"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-[#161616] border border-[#222222] hover:bg-[#222222] flex items-center justify-center text-neutral-400 hover:text-white transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Comment List */}
        <div className="p-4 overflow-y-auto space-y-3.5 flex-1 no-scrollbar text-xs">
          {comments.length === 0 ? (
            <div className="text-center py-10 text-neutral-500">
              Belum ada komentar untuk trade ini. Jadilah yang pertama berdiskusi!
            </div>
          ) : (
            comments.map((c) => (
              <div key={c.id} className="flex gap-2.5 items-start">
                <img 
                  src={c.user.avatar} 
                  alt={c.user.username} 
                  className="w-8 h-8 rounded-full object-cover border border-[#2a2a2a] mt-0.5 flex-shrink-0"
                />
                <div className="flex-1 bg-[#111111] border border-[#1f1f1f] rounded-xl p-2.5">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-bold text-neutral-200 text-xs">@{c.user.username}</span>
                    <span className="text-[10px] text-neutral-500 font-mono">
                      {new Date(c.createdAt).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <p className="text-neutral-300 leading-relaxed text-xs">{c.content}</p>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Input Bar */}
        <div className="p-3 border-t border-[#1f1f1f] bg-[#0c0c0c] flex items-center gap-2">
          <input
            id="input-comment-text"
            type="text"
            placeholder="Tulis pendapat atau pertanyaan setup ini..."
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            className="flex-1 bg-[#141414] border border-[#222222] rounded-xl px-3 py-2.5 text-xs text-white placeholder:text-neutral-500 focus:outline-none focus:border-amber-500"
          />
          <button
            id="btn-send-comment"
            onClick={handleSend}
            disabled={!inputText.trim() || isSubmitting}
            className="px-3.5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black text-xs font-bold flex items-center gap-1 transition-all disabled:opacity-40 cursor-pointer"
          >
            <Send className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};

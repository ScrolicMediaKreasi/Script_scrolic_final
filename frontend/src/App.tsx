import React, { useState, useEffect, useRef } from 'react';
import { Navbar } from './components/Navbar';
import { BottomNav, NavTab } from './components/BottomNav';
import { FeedView } from './views/FeedView';
import { DashboardView } from './views/DashboardView';
import { ProfileView } from './views/ProfileView';
import { TraderPerformanceView, TraderPerformanceData } from './views/TraderPerformanceView';
import { ExploreView } from './views/ExploreView';
import { NotificationsView } from './views/NotificationsView';
import { SettingsView } from './views/SettingsView';
import { PromotionView } from './views/PromotionView';
import { NewsView } from './views/NewsView';
import { AdminDashboardView } from './views/AdminDashboardView';

// Modals & Drawers
import { TradeDetailModal } from './components/TradeDetailModal';
import { FollowSetupModal } from './components/FollowSetupModal';
import { AskAIModal } from './components/AskAIModal';
import { EnergyModal } from './components/EnergyModal';
import { ReferralModal } from './components/ReferralModal';
import { CommentsDrawer } from './components/CommentsDrawer';
import { EditDescriptionModal } from './components/EditDescriptionModal';
import { AuthModal } from './components/AuthModal';
import { KycVerificationModal } from './components/KycVerificationModal';
import { WithdrawalModal } from './components/WithdrawalModal';
import { CTraderGatewayModal } from './components/CTraderGatewayModal';
import { SubscriptionModal } from './components/SubscriptionModal';
import { PWAInstallBanner } from './components/PWAInstallBanner';
import { LegalPage } from './components/LegalPage';
import { ResetPasswordPage } from './components/ResetPasswordPage';
import { PublicInfoPage } from './components/PublicInfoPage';

import { User, FeedPost, Trade, Notification } from './types';
import { getStrategy } from './data/strategies';
import { triggerHaptic } from './utils/haptics';
import { feedCache } from './services/feedCache';
import { notificationClient } from './services/notificationClient';
import { socketClient, LivePositionUpdate, PositionClosedPayload } from './services/socketClient';
import { livePositionStore } from './services/livePositionStore';
import { readCookie } from './utils/authFetch';
import { ShieldCheck, Zap, Lock, LogIn, ArrowRight } from 'lucide-react';

export default function App() {
  // Navigation State
  const [currentTab, setCurrentTab] = useState<NavTab | 'notifications'>('feed');
  const [viewingProfileUsername, setViewingProfileUsername] = useState<string | null>(null);
  const [performanceUsername, setPerformanceUsername] = useState<string | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isAdminDashboardOpen, setIsAdminDashboardOpen] = useState(false);
  const [isPromotionViewOpen, setIsPromotionViewOpen] = useState(false);
  const [promoterUsername, setPromoterUsername] = useState<string | null>(null);

  // Core App Data State
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMorePosts, setHasMorePosts] = useState<boolean>(false);
  const [isLoadingMore, setIsLoadingMore] = useState<boolean>(false);
  const [isLoadingFeed, setIsLoadingFeed] = useState<boolean>(true);

  const [users, setUsers] = useState<User[]>([]);
  const [liveTrades, setLiveTrades] = useState<Trade[]>([]);
  const [closedTrades, setClosedTrades] = useState<Trade[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadBadgeCount, setUnreadBadgeCount] = useState<number>(0);

  // Modals Open State
  const [selectedDetailPost, setSelectedDetailPost] = useState<FeedPost | null>(null);
  const [selectedFollowSetupPost, setSelectedFollowSetupPost] = useState<FeedPost | null>(null);
  const [selectedAskAIPost, setSelectedAskAIPost] = useState<FeedPost | null>(null);
  const [selectedPerformanceAI, setSelectedPerformanceAI] = useState<TraderPerformanceData | null>(null);
  const [selectedCommentsPost, setSelectedCommentsPost] = useState<FeedPost | null>(null);
  const [selectedEditDescPost, setSelectedEditDescPost] = useState<FeedPost | null>(null);
  const [isEnergyModalOpen, setIsEnergyModalOpen] = useState(false);
  const [isSubscriptionModalOpen, setIsSubscriptionModalOpen] = useState(false);
  const [isReferralModalOpen, setIsReferralModalOpen] = useState(false);
  const [isKycModalOpen, setIsKycModalOpen] = useState(false);
  const [isWithdrawalModalOpen, setIsWithdrawalModalOpen] = useState(false);
  const [isCTraderGatewayModalOpen, setIsCTraderGatewayModalOpen] = useState(false);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [authPromptReason, setAuthPromptReason] = useState<string | null>(null);
  const [initialReferralCode, setInitialReferralCode] = useState<string | null>(null);
  const [legalPage, setLegalPage] = useState<'terms' | 'privacy' | null>(null);
  const [resetPasswordToken, setResetPasswordToken] = useState<string | null>(null);
  const [publicInfoPage, setPublicInfoPage] = useState<'about' | 'pricing' | 'faq' | null>(null);

  const openAdminDashboard = () => {
    if (String(currentUser?.role || '').toLowerCase() !== 'admin') {
      setAuthPromptReason(currentUser ? 'Akses khusus Administrator' : 'Masuk sebagai Administrator untuk membuka panel admin');
      setIsAuthModalOpen(true);
      return;
    }
    setIsAdminDashboardOpen(true);
    setIsPromotionViewOpen(false);
    setIsSettingsOpen(false);
  };

  const openReferralNetwork = () => {
    if (!currentUser) {
      setAuthPromptReason('Masuk untuk mengelola jaringan referral 5 generasi Anda');
      setIsAuthModalOpen(true);
      return;
    }
    setIsReferralModalOpen(true);
  };

  // Check URL pathname for `/@username` or query params on load
  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const refCode = searchParams.get('ref') || searchParams.get('referrer') || searchParams.get('r');
    if (refCode) {
      const cleanRef = refCode.replace(/^@/, '').trim();
      localStorage.setItem('scrolic_ref_code', cleanRef);
      setInitialReferralCode(cleanRef);
    }

    if (searchParams.get('ctrader_connected') === 'true') {
      setIsCTraderGatewayModalOpen(true);
      window.history.replaceState({}, document.title, window.location.pathname);
    }

    const pathname = window.location.pathname;
    if (pathname === '/terms' || pathname === '/privacy-policy' || pathname === '/privacy') {
      setLegalPage(pathname === '/terms' ? 'terms' : 'privacy');
      return;
    }
    if (pathname === '/reset-password') {
      setResetPasswordToken(searchParams.get('token') || '');
      return;
    }
    if (pathname === '/about' || pathname === '/pricing' || pathname === '/faq') {
      setPublicInfoPage(pathname.slice(1) as 'about' | 'pricing' | 'faq');
      return;
    }
    const performanceMatch = pathname.match(/^\/u\/([^/]+)\/performance\/?$/);
    if (performanceMatch) {
      setPerformanceUsername(decodeURIComponent(performanceMatch[1]));
      return;
    }
    if (pathname.startsWith('/@')) {
      const username = pathname.slice(2);
      if (username) {
        const cleanUser = username.trim();
        setPromoterUsername(cleanUser);
        setIsPromotionViewOpen(true);
        localStorage.setItem('scrolic_ref_code', cleanUser);
        setInitialReferralCode(cleanUser);
      }
    }

    const handlePopState = () => {
      const path = window.location.pathname;
      const perfMatch = path.match(/^\/u\/([^/]+)\/performance\/?$/);
      if (perfMatch) {
        setPerformanceUsername(decodeURIComponent(perfMatch[1]));
        return;
      }
      setPerformanceUsername(null);
      const profMatch = path.match(/^\/u\/([^/]+)\/?$/);
      if (profMatch) {
        setViewingProfileUsername(decodeURIComponent(profMatch[1]));
        setCurrentTab('profile');
        return;
      }
      if (path === '/terms' || path === '/privacy-policy' || path === '/privacy') {
        setLegalPage(path === '/terms' ? 'terms' : 'privacy');
        return;
      }
      setLegalPage(null);
      if (path === '/about' || path === '/pricing' || path === '/faq') {
        setPublicInfoPage(path.slice(1) as 'about' | 'pricing' | 'faq');
        return;
      }
      setPublicInfoPage(null);
      setIsPromotionViewOpen(false);
      setIsSettingsOpen(false);
      setIsAdminDashboardOpen(false);
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // 1. Instant Cache Loading (IndexedDB First Strategy)
  useEffect(() => {
    async function loadLocalCache() {
      try {
        const cached = await feedCache.getCachedFeed();
        if (cached && cached.length > 0) {
          const enrichedCached = cached.map((p) => ({
            ...p,
            strategy: getStrategy(p.strategy?.id || p.trade?.strategyId || (p as any).strategyId)
          }));
          setPosts(enrichedCached);
        }
      } catch (e) {
        console.warn('[Cache] Could not load from IndexedDB:', e);
      }
    }
    loadLocalCache();
  }, []);

  // 2. Fetch fresh initial data from Express Server
  const fetchInitialData = async () => {
    try {
      const savedUserId = readCookie('scrolic_uid') || localStorage.getItem('scrolic_user_id');
      const headers: Record<string, string> = {};
      if (savedUserId) {
        headers['x-session-user-id'] = savedUserId;
      }

      // Fast Notification Snapshot (<50ms)
      if (savedUserId) {
        notificationClient.getSnapshot(savedUserId).then((snap) => {
          if (snap?.unread_count !== undefined) {
            setUnreadBadgeCount(snap.unread_count);
          }
        }).catch(() => {});
      }

      // Execute all core endpoint fetches in parallel for ultra-fast startup (<100ms)
      const [meRes, feedRes, usersRes, notifRes] = await Promise.all([
        fetch('/api/user/me', { headers }).catch(() => null),
        fetch('/api/feed?limit=8').catch(() => null),
        fetch('/api/users').catch(() => null),
        fetch('/api/notifications', { headers }).catch(() => null)
      ]);

      if (meRes && meRes.ok) {
        const meData = await meRes.json().catch(() => ({}));
        if (meData?.user) {
          setCurrentUser(meData.user);
          const resolvedUserId = meData.user.id || meData.user.username;
          localStorage.setItem('scrolic_user_id', resolvedUserId);
          document.cookie = `scrolic_uid=${encodeURIComponent(resolvedUserId)}; path=/; max-age=31536000; SameSite=Lax`;
        } else if (savedUserId) {
          setCurrentUser(null);
        }
      }

      if (feedRes && feedRes.ok) {
        const feedData = await feedRes.json().catch(() => ({}));
        if (feedData?.posts) {
          const enrichedPosts = (feedData.posts as FeedPost[]).map((p) => ({
            ...p,
            strategy: getStrategy(p.strategy?.id || p.trade?.strategyId || (p as any).strategyId)
          }));
          setPosts(enrichedPosts);
          setNextCursor(feedData.next_cursor || null);
          setHasMorePosts(Boolean(feedData.has_more));
          feedCache.setCachedFeed(enrichedPosts);
        }
      }

      if (usersRes && usersRes.ok) {
        const usersData = await usersRes.json().catch(() => ({}));
        if (usersData?.users) {
          setUsers(usersData.users);
        }
      }

      if (notifRes && notifRes.ok) {
        const notifData = await notifRes.json().catch(() => ({}));
        if (notifData?.notifications) {
          setNotifications(notifData.notifications);
        }
        if (notifData?.snapshot?.unread_count !== undefined) {
          setUnreadBadgeCount(notifData.snapshot.unread_count);
        }
      }
    } catch (err) {
      console.error('Error fetching app data:', err);
    } finally {
      setIsLoadingFeed(false);
    }
  };

  useEffect(() => {
    fetchInitialData();
  }, []);

  // 2.6 Realtime SSE Stream & Web Push Multi-Device Listener
  useEffect(() => {
    if (!currentUser?.id) return;

    // Register Web Push with VAPID
    notificationClient.registerPush(currentUser.id);

    // Connect Realtime SSE Stream
    const unsubscribeStream = notificationClient.connectRealtimeStream(currentUser.id, (event) => {
      if (event.type === 'NOTIFICATION_RECEIVED') {
        if (event.snapshot?.unread_count !== undefined) {
          setUnreadBadgeCount(event.snapshot.unread_count);
        } else {
          setUnreadBadgeCount((prev) => prev + 1);
        }
        if (event.notification) {
          setNotifications((prev) => {
            const exists = prev.some((n) => n.id === event.notification.id);
            if (exists) return prev;
            return [event.notification, ...prev];
          });
          triggerHaptic('success');
        }
      } else if (event.type === 'SNAPSHOT_UPDATED') {
        if (event.snapshot?.unread_count !== undefined) {
          setUnreadBadgeCount(event.snapshot.unread_count);
        }
        if (event.readNotificationId) {
          setNotifications((prev) =>
            prev.map((n) => (n.id === event.readNotificationId ? { ...n, isRead: true } : n))
          );
        } else if ((event as any).allRead) {
          setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
        }
      }
    });

    // Handle Service Worker Notification Click Deep-Link message
    const handleSwMessage = (e: MessageEvent) => {
      if (e.data?.type === 'NOTIFICATION_CLICK_EVENT') {
        setCurrentTab('notifications');
        setIsPromotionViewOpen(false);
        setIsSettingsOpen(false);
        setIsAdminDashboardOpen(false);
      }
    };
    navigator.serviceWorker?.addEventListener('message', handleSwMessage);

    return () => {
      unsubscribeStream();
      navigator.serviceWorker?.removeEventListener('message', handleSwMessage);
    };
  }, [currentUser?.id]);

  // 3. Infinite Scroll / Cursor Pagination: Fetch next page of posts
  const handleLoadMorePosts = async () => {
    if (!hasMorePosts || !nextCursor || isLoadingMore) return;
    setIsLoadingMore(true);

    try {
      const res = await fetch(`/api/feed?limit=8&cursor=${encodeURIComponent(nextCursor)}`);
      const data = await res.json();

      if (data.posts && data.posts.length > 0) {
        const enrichedNew = (data.posts as FeedPost[]).map((p) => ({
          ...p,
          strategy: getStrategy(p.strategy?.id || p.trade?.strategyId || (p as any).strategyId)
        }));

        setPosts((prev) => {
          // Deduplicate by ID
          const existingIds = new Set(prev.map((p) => p.id));
          const toAdd = enrichedNew.filter((p) => !existingIds.has(p.id));
          const updated = [...prev, ...toAdd];
          feedCache.setCachedFeed(updated);
          return updated;
        });

        setNextCursor(data.next_cursor || null);
        setHasMorePosts(Boolean(data.has_more));
      } else {
        setHasMorePosts(false);
      }
    } catch (err) {
      console.error('Error loading more posts:', err);
    } finally {
      setIsLoadingMore(false);
    }
  };

  // 4. Real-time Socket.IO Live Feed & Position Update Subscriptions
  // 4. Real-time Socket.IO Live Feed, Portfolio & Account Subscriptions
  useEffect(() => {
    if (!currentUser?.id) {
      socketClient.disconnect();
      return;
    }

    // Initialize socket connection with room bindings
    socketClient.connect(currentUser.id, currentUser.cTraderAccountId);

    // 4.1 On new post pushed by any trader via cTrader
    const unsubNewPost = socketClient.onNewPost((newPost: FeedPost) => {
      const enriched = {
        ...newPost,
        strategy: getStrategy(newPost.strategy?.id || newPost.trade?.strategyId || (newPost as any).strategyId)
      };

      setPosts((prev) => {
        const exists = prev.some((p) => p.id === enriched.id);
        if (exists) {
          return prev.map((p) => (p.id === enriched.id ? enriched : p));
        }
        const updated = [enriched, ...prev];
        feedCache.setCachedFeed(updated);
        return updated;
      });

      triggerHaptic('success');
    });

    // 4.1b On post update (position closed/sl/tp or price tick)
    const unsubPostUpdated = socketClient.onPostUpdated((updatedPost: FeedPost) => {
      const enriched = {
        ...updatedPost,
        strategy: getStrategy(updatedPost.strategy?.id || updatedPost.trade?.strategyId || (updatedPost as any).strategyId)
      };

      setPosts((prev) => {
        const exists = prev.some((p) => p.id === enriched.id);
        if (exists) {
          return prev.map((p) => (p.id === enriched.id ? enriched : p));
        }
        return [enriched, ...prev];
      });
    });

    // 4.2 On official SCROLIC V7 cTrader Realtime Position Update (Position-ID strict matching)
    const unsubCTraderUpdate = socketClient.onCTraderPositionUpdate((update) => {
      livePositionStore.dispatchUpdate(update);
    });

    // 4.3 On position price/pips/PnL update from live cTrader ProtoOA tick
    const unsubPositionUpdate = socketClient.onPositionUpdate((update: LivePositionUpdate) => {
      livePositionStore.dispatchUpdate(update);
    });

    // 4.4 On position closed settlement (moves from Live OP to Portfolio History)
    const unsubPositionClosed = socketClient.onPositionClosed((payload: PositionClosedPayload) => {
      setPosts((prev) =>
        prev.map((p) => {
          const matchId = payload.postId || payload.positionId || payload.tradeId;
          const isMatch = p.id === matchId || p.trade.id === matchId || p.trade.id === payload.positionId || p.id === payload.positionId;
          if (isMatch) {
            return {
              ...p,
              trade: {
                ...p.trade,
                status: 'CLOSED',
                closePrice: payload.closePrice ?? p.trade.closePrice,
                profitUSD: payload.profit ?? p.trade.profitUSD,
                closeTime: payload.closedAt ?? new Date().toISOString()
              }
            };
          }
          return p;
        })
      );
      triggerHaptic('selection');
    });

    // 4.5 On Account Metrics Update (Realtime Balance & Equity)
    const unsubAccountMetrics = socketClient.onAccountMetrics((metrics) => {
      const activeAccountId = currentUser?.cTraderAccountId || '';
      const metricAccountId = metrics.accountId || metrics.ctidTraderAccountId;
      if (currentUser && (String(metricAccountId) === String(activeAccountId) || String(metricAccountId) === activeAccountId.replace(/^cTrader-/, ''))) {
        setCurrentUser((prev) => {
          if (!prev) return null;
          return {
            ...prev,
            cTraderAccounts: prev.cTraderAccounts?.map((acc) =>
              acc.accountId === metrics.accountId
                ? { ...acc, balance: metrics.balance, currency: metrics.currency }
                : acc
            )
          };
        });
      }
    });

    // 4.6 On Reconnect: Fetch Latest Snapshot automatically
    const unsubReconnect = socketClient.onReconnect(() => {
      console.log('[Socket] Reconnected - Fetching fresh snapshot...');
      fetchInitialData();
    });

    return () => {
      unsubNewPost();
      unsubCTraderUpdate();
      unsubPositionUpdate();
      unsubPositionClosed();
      unsubAccountMetrics();
      unsubReconnect();
    };
  }, [currentUser?.id, currentUser?.cTraderAccountId]);

  // Update liveTrades and closedTrades filtered strictly by active currentUser (Portfolio Isolation)
  useEffect(() => {
    if (!currentUser) {
      setLiveTrades([]);
      setClosedTrades([]);
      return;
    }

    const isUserTrade = (p: FeedPost) =>
      p.userId === currentUser.id ||
      p.user?.username === currentUser.username ||
      p.user?.id === currentUser.id;

    const userPosts = posts.filter(isUserTrade);
    const opens = userPosts.filter((p) => p.trade.status === 'OPEN').map((p) => p.trade);
    const closeds = userPosts.filter((p) => p.trade.status === 'CLOSED').map((p) => p.trade);

    setLiveTrades(opens);
    setClosedTrades(closeds);
  }, [posts, currentUser?.id, currentUser?.username]);

  // Auth gate helper
  const requireAuth = (reason: string, action: () => void) => {
    if (!currentUser) {
      setAuthPromptReason(reason);
      setIsAuthModalOpen(true);
      return;
    }
    action();
  };

  // --- Handlers ---

  // 1. Unlock Post with Energy
  const handleUnlockPost = async (post: FeedPost) => {
    requireAuth('Buka kunci Stop Loss & Take Profit tersembunyi dengan Energy', async () => {
      try {
        const res = await fetch(`/api/posts/${post.id}/unlock`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-session-user-id': currentUser?.id || '' }
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error?.message || data.error || 'Gagal membuka kunci post');

        // Update local post state
        setPosts((prev) =>
          prev.map((p) => (p.id === post.id ? { ...p, isUnlocked: true, trade: data.post?.trade || p.trade } : p))
        );
        // Update user energy balance
        if (data.energyBalance !== undefined && currentUser) {
          setCurrentUser({ ...currentUser, energyBalance: data.energyBalance });
        }
        triggerHaptic('success');
      } catch (err: any) {
        alert(err.message);
        if (err.message && err.message.includes('Energy tidak mencukupi')) {
          setIsEnergyModalOpen(true);
        }
      }
    });
  };

  // 2. Toggle Like
  const handleToggleLike = async (post: FeedPost) => {
    requireAuth('Masuk untuk menyukai dan berinteraksi dengan trade', async () => {
      try {
        const res = await fetch(`/api/posts/${post.id}/like`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-session-user-id': currentUser?.id || '' }
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);

        setPosts((prev) =>
          prev.map((p) =>
            p.id === post.id
              ? {
                  ...p,
                  isLiked: data.isLiked,
                  likesCount: data.likesCount
                }
              : p
          )
        );
      } catch (err: any) {
        console.error(err);
      }
    });
  };

  // 3. Toggle Save
  const handleToggleSave = async (post: FeedPost) => {
    requireAuth('Masuk untuk menyimpan setup trade', async () => {
      try {
        const res = await fetch(`/api/posts/${post.id}/save`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-session-user-id': currentUser?.id || '' }
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);

        setPosts((prev) =>
          prev.map((p) => (p.id === post.id ? { ...p, isSaved: data.isSaved } : p))
        );
      } catch (err: any) {
        console.error(err);
      }
    });
  };

  // 4. Toggle Follow
  const handleToggleFollow = async (targetUsername: string) => {
    requireAuth('Masuk untuk mengikuti trader', async () => {
      try {
        const res = await fetch(`/api/users/${targetUsername}/follow`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-session-user-id': currentUser?.id || '' }
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);

        // Update current user following list
        if (currentUser) {
          const list = new Set(currentUser.followingList || []);
          if (data.isFollowing) {
            list.add(targetUsername);
          } else {
            list.delete(targetUsername);
          }
          setCurrentUser({
            ...currentUser,
            followingList: Array.from(list),
            followingCount: data.isFollowing
              ? (currentUser.followingCount || 0) + 1
              : Math.max(0, (currentUser.followingCount || 1) - 1)
          });
        }

        // Update posts isFollowed
        setPosts((prev) =>
          prev.map((p) =>
            p.user.username === targetUsername
              ? {
                  ...p,
                  user: {
                    ...p.user,
                    followersCount: data.targetFollowersCount
                  },
                  isFollowed: data.isFollowing
                }
              : p
          )
        );

        // Update users list
        setUsers((prev) =>
          prev.map((u) =>
            u.username === targetUsername
              ? { ...u, followersCount: data.targetFollowersCount }
              : u
          )
        );
      } catch (err: any) {
        alert(err.message);
      }
    });
  };

  // 5. Mirror Trade execution callback
  const handleFollowExecuted = (orderEvent: any) => {
    triggerHaptic('success');
    fetchInitialData();
  };

  // 6. Comments added callback
  const handleCommentAdded = (postId: string, comment: any) => {
    setPosts((prev) =>
      prev.map((p) =>
        p.id === postId ? { ...p, commentsCount: (p.commentsCount || 0) + 1 } : p
      )
    );
  };

  // 7. Edit description saved callback
  const handleDescriptionSaved = (postId: string, newDescription: string, unlockFee?: number, followFee?: number) => {
    setPosts((prev) =>
      prev.map((p) =>
        p.id === postId
          ? {
              ...p,
              customDescription: newDescription,
              unlockFee: unlockFee !== undefined ? unlockFee : p.unlockFee,
              followFee: followFee !== undefined ? followFee : p.followFee
            }
          : p
      )
    );
  };

  // 8. Close Trade callback
  const handleCloseTrade = async (tradeId: string) => {
    try {
      const res = await fetch(`/api/ctrader/positions/${encodeURIComponent(tradeId)}/close`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-session-user-id': currentUser?.id || '' },
        body: JSON.stringify({ positionId: tradeId })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Gagal menutup posisi');
      fetchInitialData();
      triggerHaptic('success');
    } catch (err: any) {
      alert(err.message);
    }
  };

  // 9. Notifications Mark All Read & Mark Single Read
  const handleMarkAllNotificationsAsRead = async () => {
    try {
      setUnreadBadgeCount(0);
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
      await fetch('/api/notifications/read-all', {
        method: 'POST',
        headers: { 'x-session-user-id': currentUser?.id || '' }
      });
    } catch (err) {
      console.error(err);
    }
  };

  const handleSelectNotification = async (notif: Notification) => {
    if (!notif.isRead) {
      try {
        setUnreadBadgeCount((prev) => Math.max(0, prev - 1));
        setNotifications((prev) =>
          prev.map((n) => (n.id === notif.id ? { ...n, isRead: true } : n))
        );
        await fetch(`/api/notifications/${notif.id}/read`, {
          method: 'POST',
          headers: { 'x-session-user-id': currentUser?.id || '' }
        });
      } catch (err) {
        console.error(err);
      }
    }
  };

  // 10. Login Success handler
  const handleLoginSuccess = (user: User) => {
    const uid = user.id || user.username;
    localStorage.setItem('scrolic_user_id', uid);
    document.cookie = `scrolic_uid=${encodeURIComponent(uid)}; path=/; max-age=31536000; SameSite=Lax`;
    setCurrentUser(user);
    setIsAuthModalOpen(false);
    setAuthPromptReason(null);
    fetchInitialData();
  };

  // 11. Logout
  const handleLogout = async () => {
    try {
      localStorage.removeItem('scrolic_user_id');
      document.cookie = 'scrolic_uid=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax';
      await fetch('/api/auth/logout', { method: 'POST' });
      setCurrentUser(null);
      setIsSettingsOpen(false);
      fetchInitialData();
    } catch (e) {
      console.error(e);
    }
  };

  // 12. User Update
  const handleUpdateUser = (updatedUser: User) => {
    setCurrentUser(updatedUser);
    setUsers((prev) => prev.map((u) => (u.id === updatedUser.id ? updatedUser : u)));
    setPosts((prev) =>
      prev.map((p) =>
        p.userId === updatedUser.id ? { ...p, user: { ...p.user, ...updatedUser } } : p
      )
    );
  };

  // Active target user for profile view
  const activeProfileUser = viewingProfileUsername
    ? users.find((u) => u.username === viewingProfileUsername || u.id === viewingProfileUsername) || currentUser
    : currentUser;
  const activePerformanceUser = performanceUsername
    ? users.find((u) => u.username === performanceUsername || u.id === performanceUsername) || (currentUser?.username === performanceUsername ? currentUser : {
        id: performanceUsername,
        username: performanceUsername,
        displayName: `@${performanceUsername}`,
        avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
        bio: '',
        role: 'user' as const,
        isBanned: false,
        isVerified: false,
        kycStatus: 'unverified' as const,
        cTraderConnected: false,
        followersCount: 0,
        followingCount: 0,
        followingList: [],
        totalTrades: 0,
        totalTradesCount: 0,
        winRate: 0,
        totalProfitUSD: 0,
        totalPips: 0,
        energyBalance: 0,
        referralCode: performanceUsername.toUpperCase(),
        referralsCount: 0,
        affiliateEarningsEnergy: 0,
        tradeEarningsEnergy: 0,
        defaultUnlockFee: 5,
        defaultFollowFee: 15,
        defaultUnlockPrice: 5,
        defaultFollowPrice: 15,
        createdAt: new Date().toISOString()
      })
    : null;

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  if (legalPage) {
    return (
      <LegalPage
        kind={legalPage}
        onBack={() => {
          window.history.pushState({}, document.title, '/');
          setLegalPage(null);
        }}
      />
    );
  }

  if (resetPasswordToken !== null) {
    return <ResetPasswordPage token={resetPasswordToken} onBack={() => {
      window.history.pushState({}, document.title, '/');
      setResetPasswordToken(null);
    }} />;
  }

  if (publicInfoPage) {
    return <PublicInfoPage kind={publicInfoPage} onBack={() => { window.history.pushState({}, document.title, '/'); setPublicInfoPage(null); }} onNavigate={(path) => { window.history.pushState({}, document.title, path); setPublicInfoPage(path.slice(1) as 'about' | 'pricing' | 'faq'); }} onOpenLogin={() => { window.history.pushState({}, document.title, '/'); setPublicInfoPage(null); setIsAuthModalOpen(true); }} />;
  }

  return (
    <div className="min-h-screen bg-[#050505] text-neutral-100 font-sans antialiased flex flex-col selection:bg-amber-500 selection:text-black">
      
      {/* Top Navbar */}
      <Navbar
        currentUser={currentUser}
        unreadNotificationsCount={unreadBadgeCount}
        onOpenEnergy={() => setIsEnergyModalOpen(true)}
        onOpenNotifications={() => {
          setPerformanceUsername(null);
          setIsPromotionViewOpen(false);
          setIsSettingsOpen(false);
          setIsAdminDashboardOpen(false);
          setCurrentTab('notifications');
          window.history.pushState({}, document.title, '/');
        }}
        onOpenLogin={() => {
          setAuthPromptReason(null);
          setIsAuthModalOpen(true);
        }}
        onOpenPromotion={() => {
          setPerformanceUsername(null);
          setPromoterUsername(currentUser ? currentUser.username : 'alex_trader');
          setIsPromotionViewOpen(true);
          setIsAdminDashboardOpen(false);
          setIsSettingsOpen(false);
          window.history.pushState({}, document.title, `/@${currentUser ? currentUser.username : 'alex_trader'}`);
        }}
        onOpenAdmin={() => {
          setPerformanceUsername(null);
          openAdminDashboard();
        }}
        onLogoClick={() => {
          setPerformanceUsername(null);
          setIsPromotionViewOpen(false);
          setIsSettingsOpen(false);
          setIsAdminDashboardOpen(false);
          setViewingProfileUsername(null);
          setCurrentTab('feed');
          window.history.pushState({}, document.title, '/');
        }}
        onNavigatePublic={(path) => { 
          setPerformanceUsername(null);
          window.history.pushState({}, document.title, path); 
          setPublicInfoPage(path.slice(1) as 'about' | 'pricing' | 'faq'); 
        }}
      />

      {/* Main Viewport Container */}
      <main className="flex-1 w-full max-w-md mx-auto pt-2">
        {/* Promotion / Landing View */}
        {isAdminDashboardOpen ? (
          <AdminDashboardView
            currentUser={currentUser}
            onBackToFeed={() => {
              setIsAdminDashboardOpen(false);
              setCurrentTab('feed');
            }}
            onRefreshCurrentUser={fetchInitialData}
          />
        ) : isPromotionViewOpen ? (
          <PromotionView
            promoterUser={
              promoterUsername
                ? users.find((u) => u.username === promoterUsername) || currentUser
                : currentUser
            }
            currentUser={currentUser}
            onOpenLogin={(refCode) => {
              if (refCode) setInitialReferralCode(refCode);
              setAuthPromptReason('Klaim bonus 25 Energy & diskon copy trade');
              setIsAuthModalOpen(true);
            }}
            onBackToFeed={() => {
              setIsPromotionViewOpen(false);
              setCurrentTab('feed');
            }}
            onOpenReferralModal={openReferralNetwork}
          />
        ) : isSettingsOpen ? (
          <SettingsView
            currentUser={currentUser}
            onUpdateUser={handleUpdateUser}
            onOpenEnergy={() => setIsEnergyModalOpen(true)}
            onOpenReferral={openReferralNetwork}
            onOpenSubscription={() => setIsSubscriptionModalOpen(true)}
            onOpenKycModal={() => setIsKycModalOpen(true)}
            onOpenWithdrawalModal={() => setIsWithdrawalModalOpen(true)}
            onOpenAdmin={openAdminDashboard}
            onLogout={handleLogout}
          />
        ) : performanceUsername && activePerformanceUser ? (
          <TraderPerformanceView
            user={activePerformanceUser}
            currentUser={currentUser}
            onBack={() => {
              setPerformanceUsername(null);
              window.history.pushState({}, document.title, `/u/${activePerformanceUser.username}`);
              setViewingProfileUsername(activePerformanceUser.username);
              setCurrentTab('profile');
            }}
            onAskAI={(performance) => {
              if (!currentUser) {
                setAuthPromptReason('Masuk untuk menggunakan Tanya AI Performance');
                setIsAuthModalOpen(true);
                return;
              }
              setSelectedPerformanceAI(performance);
            }}
          />
        ) : currentTab === 'feed' ? (
          <FeedView
            posts={posts}
            currentUser={currentUser}
            isLoading={isLoadingFeed}
            hasMore={hasMorePosts}
            isLoadingMore={isLoadingMore}
            onLoadMore={handleLoadMorePosts}
            onUnlockPost={handleUnlockPost}
            onOpenDetail={(post) => setSelectedDetailPost(post)}
            onOpenFollowSetup={(post) => {
              requireAuth('Masuk untuk mirror follow trade', () => {
                setSelectedFollowSetupPost(post);
              });
            }}
            onOpenAskAI={(post) => {
              requireAuth('Tanya Gemini AI untuk validasi setup teknikal', () => {
                setSelectedAskAIPost(post);
              });
            }}
            onOpenComments={(post) => setSelectedCommentsPost(post)}
            onToggleLike={handleToggleLike}
            onToggleSave={handleToggleSave}
            onToggleFollow={handleToggleFollow}
            onEditDescription={(post) => setSelectedEditDescPost(post)}
            onViewProfile={(username) => {
              setViewingProfileUsername(username);
              setPerformanceUsername(null);
              window.history.pushState({}, document.title, `/u/${encodeURIComponent(username)}`);
              setCurrentTab('profile');
            }}
            onOpenPerformance={(username) => {
              setPerformanceUsername(username);
              window.history.pushState({}, document.title, `/u/${encodeURIComponent(username)}/performance`);
            }}
            onRefreshFeed={fetchInitialData}
            onOpenLogin={() => {
              setAuthPromptReason(null);
              setIsAuthModalOpen(true);
            }}
          />
        ) : currentTab === 'explore' ? (
          <ExploreView
            users={users}
            posts={posts}
            currentUser={currentUser}
            onViewProfile={(username) => {
              setViewingProfileUsername(username);
              setPerformanceUsername(null);
              window.history.pushState({}, document.title, `/u/${encodeURIComponent(username)}`);
              setCurrentTab('profile');
            }}
            onToggleFollow={handleToggleFollow}
            onOpenDetail={(post) => setSelectedDetailPost(post)}
            onOpenPromotionPage={(username) => {
              setPromoterUsername(username);
              setIsPromotionViewOpen(true);
            }}
          />
        ) : currentTab === 'dashboard' ? (
          <DashboardView
            currentUser={currentUser}
            liveTrades={liveTrades}
            closedTrades={closedTrades}
            posts={posts}
            onOpenEnergy={() => setIsEnergyModalOpen(true)}
            onOpenReferral={openReferralNetwork}
            onOpenCTraderGateway={() => setIsCTraderGatewayModalOpen(true)}
            onUpdateUser={handleUpdateUser}
            onCloseTrade={handleCloseTrade}
            onRefreshFeed={fetchInitialData}
            onOpenLogin={() => {
              setAuthPromptReason('Masuk untuk mengakses Dashboard cTrader & portofolio');
              setIsAuthModalOpen(true);
            }}
          />
        ) : currentTab === 'news' ? (
          <NewsView
            currentUser={currentUser}
            onOpenEnergy={() => setIsEnergyModalOpen(true)}
            onOpenLogin={() => {
              setAuthPromptReason('Masuk untuk menggunakan fitur Tanya AI Berita');
              setIsAuthModalOpen(true);
            }}
            onUpdateEnergyBalance={(newBalance) => {
              if (currentUser) {
                setCurrentUser({ ...currentUser, energyBalance: newBalance });
              }
            }}
          />
        ) : currentTab === 'notifications' ? (
          <NotificationsView
            notifications={notifications}
            currentUser={currentUser}
            onMarkAllAsRead={handleMarkAllNotificationsAsRead}
            onSelectNotification={handleSelectNotification}
            onOpenEnergy={() => setIsEnergyModalOpen(true)}
            onOpenReferral={openReferralNetwork}
          />
        ) : currentTab === 'profile' && activeProfileUser ? (
          <ProfileView
            user={activeProfileUser}
            currentUser={currentUser}
            posts={posts}
            liveTrades={liveTrades}
            closedTrades={closedTrades}
            onUnlockPost={handleUnlockPost}
            onOpenDetail={(post) => setSelectedDetailPost(post)}
            onOpenFollowSetup={(post) => {
              requireAuth('Masuk untuk mirror follow trade', () => {
                setSelectedFollowSetupPost(post);
              });
            }}
            onOpenAskAI={(post) => {
              requireAuth('Tanya AI untuk setup ini', () => {
                setSelectedAskAIPost(post);
              });
            }}
            onOpenComments={(post) => setSelectedCommentsPost(post)}
            onToggleLike={handleToggleLike}
            onToggleSave={handleToggleSave}
            onToggleFollow={handleToggleFollow}
            onEditDescription={(post) => setSelectedEditDescPost(post)}
            onOpenEnergy={() => setIsEnergyModalOpen(true)}
            onOpenReferral={openReferralNetwork}
            onOpenSettings={() => setIsSettingsOpen(true)}
            onOpenLogin={() => {
              setAuthPromptReason(null);
              setIsAuthModalOpen(true);
            }}
            onOpenPromotionPage={(username) => {
              setPromoterUsername(username);
              setIsPromotionViewOpen(true);
            }}
            onOpenWithdrawalModal={() => setIsWithdrawalModalOpen(true)}
            onOpenKycModal={() => setIsKycModalOpen(true)}
            onUpdateUser={handleUpdateUser}
            onCloseTrade={handleCloseTrade}
            onOpenPerformance={(username) => {
              setPerformanceUsername(username);
              window.history.pushState({}, document.title, `/u/${encodeURIComponent(username)}/performance`);
            }}
          />
        ) : currentTab === 'profile' && !activeProfileUser ? (
          /* Guest Profile Prompt: Elegant login gate when user is logged out */
          <div className="w-full max-w-md mx-auto p-4 pb-24 text-center">
            <div className="bg-[#07130c] border border-[#18633c]/40 rounded-3xl p-6 shadow-2xl relative overflow-hidden">
              <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center mx-auto mb-4 text-emerald-400">
                <ShieldCheck className="w-8 h-8" />
              </div>
              <h3 className="text-lg font-black text-white mb-2">Profil & Portofolio cTrader</h3>
              <p className="text-xs text-neutral-400 max-w-xs mx-auto mb-6 leading-relaxed">
                Masuk untuk melihat statistik trading Anda, menghubungkan akun cTrader Open API, serta mengelola komisi afiliasi 5 generasi.
              </p>

              <button
                onClick={() => {
                  triggerHaptic('medium');
                  setAuthPromptReason('Masuk untuk mengakses profil dan menghubungkan cTrader');
                  setIsAuthModalOpen(true);
                }}
                className="w-full py-3 px-4 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-black font-black text-xs flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20 transition-all active:scale-95 cursor-pointer mb-3"
              >
                <LogIn className="w-4 h-4" />
                <span>Masuk / Daftar</span>
                <ArrowRight className="w-4 h-4 ml-auto" />
              </button>

              <div className="flex items-center justify-center gap-4 text-[10px] text-neutral-400 pt-2 border-t border-white/5">
                <span className="flex items-center gap-1">
                  <Zap className="w-3 h-3 text-amber-400" /> +25 Energy Gratis
                </span>
                <span>•</span>
                <span className="flex items-center gap-1">
                  <Lock className="w-3 h-3 text-emerald-400" /> cTrader API Aman
                </span>
              </div>
            </div>
          </div>
        ) : null}
      </main>

      {/* Bottom Sticky Navigation */}
      <BottomNav
        currentTab={currentTab}
        onChangeTab={(tab) => {
          setPerformanceUsername(null);
          setIsPromotionViewOpen(false);
          setIsSettingsOpen(false);
          setIsAdminDashboardOpen(false);
          if (tab === 'profile' && !currentUser) {
            // If user is not logged in, prompt auth or switch to profile prompt
            setViewingProfileUsername(null);
            setCurrentTab('profile');
            window.history.pushState({}, document.title, '/');
            return;
          }
          setCurrentTab(tab);
          if (tab === 'profile') {
            setViewingProfileUsername(null); // Reset to own profile
            window.history.pushState({}, document.title, currentUser ? `/u/${encodeURIComponent(currentUser.username)}` : '/');
          } else {
            window.history.pushState({}, document.title, '/');
          }
        }}
        unreadCount={unreadCount}
      />

      {/* --- MODALS & DRAWERS --- */}

      {/* 1. Trade Detail Modal */}
      {selectedDetailPost && (
        <TradeDetailModal
          post={selectedDetailPost}
          currentUser={currentUser}
          onClose={() => setSelectedDetailPost(null)}
          onUnlock={handleUnlockPost}
          onOpenFollowSetup={(post) => {
            setSelectedDetailPost(null);
            requireAuth('Masuk untuk follow trade', () => {
              setSelectedFollowSetupPost(post);
            });
          }}
          onOpenAskAI={(post) => {
            setSelectedDetailPost(null);
            requireAuth('Tanya AI untuk setup ini', () => {
              setSelectedAskAIPost(post);
            });
          }}
        />
      )}

      {/* 2. Follow Setup Modal */}
      {selectedFollowSetupPost && (
        <FollowSetupModal
          post={selectedFollowSetupPost}
          currentUser={currentUser}
          onClose={() => setSelectedFollowSetupPost(null)}
          onNavigateToDashboard={() => {
            setSelectedFollowSetupPost(null);
            setSelectedDetailPost(null);
            setIsSettingsOpen(false);
            setIsPromotionViewOpen(false);
            setViewingProfileUsername(null);
            setCurrentTab('dashboard');
          }}
          onFollowExecuted={handleFollowExecuted}
          onOpenEnergyModal={() => {
            setSelectedFollowSetupPost(null);
            setIsEnergyModalOpen(true);
          }}
          onOpenCTraderModal={() => {
            setSelectedFollowSetupPost(null);
            setIsCTraderGatewayModalOpen(true);
          }}
        />
      )}

      {/* 3. Ask AI Modal (Gemini 2.5) */}
      {selectedAskAIPost && (
        <AskAIModal
          post={selectedAskAIPost}
          currentUser={currentUser}
          onClose={() => setSelectedAskAIPost(null)}
          onEnergyDeducted={(newBalance) => {
            if (currentUser) {
              setCurrentUser({ ...currentUser, energyBalance: newBalance });
            }
          }}
        />
      )}

      {selectedPerformanceAI && currentUser && (
        <AskAIModal
          post={null}
          currentUser={currentUser}
          performanceContext={{
            traderUsername: selectedPerformanceAI.profile.username,
            performance: selectedPerformanceAI
          }}
          onClose={() => setSelectedPerformanceAI(null)}
          onEnergyDeducted={(newBalance) => setCurrentUser((prev) => prev ? { ...prev, energyBalance: newBalance } : prev)}
        />
      )}

      {/* 4. Comments Drawer */}
      {selectedCommentsPost && (
        <CommentsDrawer
          post={selectedCommentsPost}
          currentUser={currentUser}
          onClose={() => setSelectedCommentsPost(null)}
          onCommentAdded={handleCommentAdded}
        />
      )}

      {/* 5. Edit Description Modal */}
      {selectedEditDescPost && (
        <EditDescriptionModal
          post={selectedEditDescPost}
          currentUser={currentUser}
          onClose={() => setSelectedEditDescPost(null)}
          onSave={handleDescriptionSaved}
          onOpenSubscription={() => setIsEnergyModalOpen(true)}
        />
      )}

      {/* 6. Energy Wallet Modal (Mayar.id integration) */}
      {isEnergyModalOpen && currentUser && (
        <EnergyModal
          currentUser={currentUser}
          onClose={() => setIsEnergyModalOpen(false)}
          onOpenWithdrawalModal={() => {
            setIsEnergyModalOpen(false);
            setIsWithdrawalModalOpen(true);
          }}
          onOpenKycModal={() => {
            setIsEnergyModalOpen(false);
            setIsKycModalOpen(true);
          }}
          onTopupSuccess={(newBalance) => {
            if (currentUser) {
              setCurrentUser({ ...currentUser, energyBalance: newBalance, energy: newBalance });
            }
          }}
        />
      )}

      {/* 6.5. VIP Subscription Modal (Pay with Energy) */}
      {isSubscriptionModalOpen && currentUser && (
        <SubscriptionModal
          currentUser={currentUser}
          onClose={() => setIsSubscriptionModalOpen(false)}
          onOpenEnergyModal={() => {
            setIsSubscriptionModalOpen(false);
            setIsEnergyModalOpen(true);
          }}
          onSuccess={(updatedUser) => {
            handleUpdateUser(updatedUser);
          }}
        />
      )}

      {/* 7. Referral Network Modal (5 Generations) */}
      {isReferralModalOpen && currentUser && (
        <ReferralModal
          currentUser={currentUser}
          onClose={() => setIsReferralModalOpen(false)}
          onOpenPromotionPage={(username) => {
            setIsReferralModalOpen(false);
            setPromoterUsername(username);
            setIsPromotionViewOpen(true);
          }}
          onOpenWithdrawalModal={() => {
            setIsReferralModalOpen(false);
            setIsWithdrawalModalOpen(true);
          }}
          onOpenKycModal={() => {
            setIsReferralModalOpen(false);
            setIsKycModalOpen(true);
          }}
        />
      )}

      {/* 8. KYC AI Verification Modal (Gemini OCR) */}
      {isKycModalOpen && currentUser && (
        <KycVerificationModal
          currentUser={currentUser}
          onClose={() => setIsKycModalOpen(false)}
          onVerificationSuccess={(updatedUser) => {
            handleUpdateUser(updatedUser);
          }}
          onProceedToWithdraw={() => {
            setIsWithdrawalModalOpen(true);
          }}
        />
      )}

      {/* 9. Commission Withdrawal Modal (Instant BI-FAST) */}
      {isWithdrawalModalOpen && currentUser && (
        <WithdrawalModal
          currentUser={currentUser}
          onClose={() => setIsWithdrawalModalOpen(false)}
          onOpenKycModal={() => {
            setIsKycModalOpen(true);
          }}
          onWithdrawalSuccess={(newBalance) => {
            setCurrentUser({
              ...currentUser,
              energyBalance: newBalance,
              energy: newBalance
            });
          }}
        />
      )}

      {/* 10. cTrader Open API Gateway Modal */}
      {isCTraderGatewayModalOpen && currentUser && (
        <CTraderGatewayModal
          currentUser={currentUser}
          onClose={() => setIsCTraderGatewayModalOpen(false)}
          onUpdateUser={(updated) => {
            handleUpdateUser(updated);
          }}
        />
      )}

      {/* 11. Authentication Modal (Google 1-Tap) */}
      <AuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
        onLoginSuccess={handleLoginSuccess}
        promptReason={authPromptReason}
        initialReferralCode={initialReferralCode}
      />

      {/* 12. Non-Intrusive PWA App Install Banner with +10 Energy Bonus */}
      <PWAInstallBanner
        currentUser={currentUser}
        onUpdateUser={handleUpdateUser}
        onOpenLogin={() => {
          setAuthPromptReason('Masuk untuk klaim bonus +10 Energy install App PWA');
          setIsAuthModalOpen(true);
        }}
      />
    </div>
  );
}

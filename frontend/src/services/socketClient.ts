import { io, Socket } from 'socket.io-client';
import { FeedPost } from '../types';

export interface LivePositionUpdate {
  eventId?: string;
  sequence?: number;
  timestamp?: number;
  postId: string;
  tradeId?: string;
  positionId?: string;
  symbol: string;
  currentPrice: number;
  progress: number;
  profit: number;
  profitUsd?: number;
  profitPercent: number;
  pips: number;
  volumeLot?: number;
  status: 'OPEN' | 'CLOSED';
}

export interface PositionClosedPayload {
  eventId?: string;
  sequence?: number;
  timestamp?: number;
  postId: string;
  tradeId?: string;
  positionId?: string;
  closePrice: number;
  profit: number;
  closedAt: string;
  status?: 'CLOSED';
}

export interface AccountMetricsPayload {
  eventId?: string;
  sequence?: number;
  timestamp?: number;
  accountId: string;
  ctidTraderAccountId?: number;
  balance: number;
  equity: number;
  unrealizedPnL: number;
  usedMargin: number;
  freeMargin: number;
  marginLevel: number | null;
  leverage: number;
  currency: string;
  moneyDigits?: number;
  openPositionsCount: number;
  isStale: boolean;
  staleReason?: string | null;
}

export interface ConnectionStatusPayload {
  eventId?: string;
  sequence?: number;
  timestamp?: number;
  state: 'DISCONNECTED' | 'CONNECTING' | 'CONNECTED' | 'AUTHENTICATED' | 'DEGRADED' | 'RECONNECTING';
  isBrokerConnected: boolean;
  isAuthenticated: boolean;
  environment: string;
  transport?: string;
  host?: string;
  lastHeartbeatReceivedAt?: string | null;
  lastMessageAt?: string | null;
  reconnectCount?: number;
  lastError?: string | null;
}

export interface EnergyUpdatePayload {
  userId: string;
  energyBalance: number;
  addedEnergy?: number;
}

export interface CTraderPositionUpdatePayload {
  eventId?: string;
  sequence?: number;
  timestamp?: number;
  positionId: string;
  postId?: string;
  tradeId?: string;
  symbol: string;
  side: 'BUY' | 'SELL';
  direction?: 'BUY' | 'SELL';
  entry: number;
  current: number;
  currentPrice?: number;
  bid?: number;
  ask?: number;
  pips: number;
  volumeLot?: number;
  profitUsd: number;
  profit?: number;
  profitPercent?: number;
  sl?: number;
  tp?: number;
  stopLoss?: number;
  takeProfit?: number;
  progress?: number;
  status?: 'OPEN' | 'CLOSED';
}

class SocketClient {
  private socket: Socket | null = null;
  private newPostListeners: Set<(post: FeedPost) => void> = new Set();
  private postUpdatedListeners: Set<(post: FeedPost) => void> = new Set();
  private positionUpdateListeners: Set<(update: LivePositionUpdate) => void> = new Set();
  private cTraderPositionListeners: Set<(payload: CTraderPositionUpdatePayload) => void> = new Set();
  private positionClosedListeners: Set<(payload: PositionClosedPayload) => void> = new Set();
  private accountMetricsListeners: Set<(payload: AccountMetricsPayload) => void> = new Set();
  private connectionStatusListeners: Set<(payload: ConnectionStatusPayload) => void> = new Set();
  private cTraderLogListeners: Set<(log: any) => void> = new Set();
  private energyUpdateListeners: Set<(payload: EnergyUpdatePayload) => void> = new Set();
  private reconnectListeners: Set<() => void> = new Set();
  private isConnecting: boolean = false;
  private currentUserId: string | null = null;
  private currentAccountId: string | null = null;

  public connect(userId?: string, accountId?: string): void {
    if (userId && this.currentUserId && userId !== this.currentUserId) {
      this.disconnect();
    }
    if (userId) this.currentUserId = userId;
    if (accountId) this.currentAccountId = accountId;

    if (this.socket?.connected || this.isConnecting) {
      if (this.socket?.connected) {
        this.joinRooms();
      }
      return;
    }
    this.isConnecting = true;

    try {
      this.socket = io({
        path: '/socket.io',
        transports: ['websocket', 'polling'],
        auth: {
          userId: this.currentUserId
        },
        reconnection: true,
        reconnectionAttempts: Infinity,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        timeout: 10000
      });

      this.socket.on('connect', () => {
        this.isConnecting = false;
        console.log(`[SocketClient] Connected to Scrolic Real-time Feed Socket: ${this.socket?.id}`);
        this.joinRooms();
        this.reconnectListeners.forEach((cb) => {
          try {
            cb();
          } catch (e) {
            console.error('[SocketClient] reconnectListener error:', e);
          }
        });
      });

      // Standardized Events
      this.socket.on('feed:new_post', (post: FeedPost) => {
        this.newPostListeners.forEach((cb) => {
          try {
            cb(post);
          } catch (err) {
            console.error('[SocketClient] feed:new_post error:', err);
          }
        });
      });

      this.socket.on('feed_post_created', (data: { post: FeedPost }) => {
        const post = data.post || (data as any);
        this.newPostListeners.forEach((cb) => {
          try {
            cb(post);
          } catch (err) {
            console.error('[SocketClient] feed_post_created error:', err);
          }
        });
      });

      this.socket.on('feed_post_updated', (data: { post: FeedPost }) => {
        const post = data.post || (data as any);
        this.postUpdatedListeners.forEach((cb) => {
          try {
            cb(post);
          } catch (err) {
            console.error('[SocketClient] feed_post_updated error:', err);
          }
        });
      });

      this.socket.on('feed:position_update', (update: LivePositionUpdate) => {
        this.positionUpdateListeners.forEach((cb) => {
          try {
            cb(update);
          } catch (err) {
            console.error('[SocketClient] feed:position_update error:', err);
          }
        });
      });

      this.socket.on('ctrader:position:update', (payload: CTraderPositionUpdatePayload) => {
        this.cTraderPositionListeners.forEach((cb) => {
          try {
            cb(payload);
          } catch (err) {
            console.error('[SocketClient] ctrader:position:update error:', err);
          }
        });
      });

      this.socket.on('feed:position_closed', (payload: PositionClosedPayload) => {
        this.positionClosedListeners.forEach((cb) => {
          try {
            cb(payload);
          } catch (err) {
            console.error('[SocketClient] feed:position_closed error:', err);
          }
        });
      });

      // Private Account Metrics Event (Isolated Room)
      this.socket.on('account:metrics_update', (metrics: AccountMetricsPayload) => {
        this.accountMetricsListeners.forEach((cb) => {
          try {
            cb(metrics);
          } catch (err) {
            console.error('[SocketClient] account:metrics_update error:', err);
          }
        });
      });

      this.socket.on('ctrader:account_update', (metrics: AccountMetricsPayload) => {
        this.accountMetricsListeners.forEach((cb) => {
          try {
            cb(metrics);
          } catch (err) {
            console.error('[SocketClient] ctrader:account_update error:', err);
          }
        });
      });

      // Connection Diagnostics Event
      this.socket.on('connection:status_update', (status: ConnectionStatusPayload) => {
        this.connectionStatusListeners.forEach((cb) => {
          try {
            cb(status);
          } catch (err) {
            console.error('[SocketClient] connection:status_update error:', err);
          }
        });
      });

      this.socket.on('ctrader:connection_update', (status: ConnectionStatusPayload) => {
        this.connectionStatusListeners.forEach((cb) => {
          try {
            cb(status);
          } catch (err) {
            console.error('[SocketClient] ctrader:connection_update error:', err);
          }
        });
      });

      this.socket.on('ctrader:log', (log: any) => {
        this.cTraderLogListeners.forEach((cb) => {
          try {
            cb(log);
          } catch (err) {
            console.error('[SocketClient] ctrader:log error:', err);
          }
        });
      });

      this.socket.on('user:energy_update', (payload: EnergyUpdatePayload) => {
        this.energyUpdateListeners.forEach((cb) => {
          try {
            cb(payload);
          } catch (err) {
            console.error('[SocketClient] user:energy_update error:', err);
          }
        });
      });

      this.socket.on('disconnect', (reason) => {
        this.isConnecting = false;
        console.log('[SocketClient] Disconnected from server:', reason);
      });
    } catch (err) {
      this.isConnecting = false;
      console.warn('[SocketClient] Socket.IO initialization warning:', err);
    }
  }

  public disconnect(): void {
    this.currentUserId = null;
    this.currentAccountId = null;
    this.isConnecting = false;
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }

  public joinUserRoom(userId: string): void {
    this.currentUserId = userId;
    if (this.socket?.connected) {
      this.socket.emit('join:user_room', { userId });
    }
  }

  public joinAccountRoom(accountId: string): void {
    const previousAccountId = this.currentAccountId;
    this.currentAccountId = accountId;
    if (this.socket?.connected) {
      if (previousAccountId && previousAccountId !== accountId) {
        this.socket.emit('leave:account_room', { accountId: previousAccountId });
      }
      this.socket.emit('join:account_room', { accountId });
    }
  }

  private joinRooms(): void {
    if (this.currentUserId) {
      this.socket?.emit('join:user_room', { userId: this.currentUserId });
    }
    if (this.currentAccountId) {
      this.socket?.emit('join:account_room', { accountId: this.currentAccountId });
    }
  }

  public onNewPost(callback: (post: FeedPost) => void): () => void {
    this.newPostListeners.add(callback);
    return () => this.newPostListeners.delete(callback);
  }

  public onPostUpdated(callback: (post: FeedPost) => void): () => void {
    this.postUpdatedListeners.add(callback);
    return () => this.postUpdatedListeners.delete(callback);
  }

  public onPositionUpdate(callback: (update: LivePositionUpdate) => void): () => void {
    this.positionUpdateListeners.add(callback);
    return () => this.positionUpdateListeners.delete(callback);
  }

  public onCTraderPositionUpdate(callback: (payload: CTraderPositionUpdatePayload) => void): () => void {
    this.cTraderPositionListeners.add(callback);
    return () => this.cTraderPositionListeners.delete(callback);
  }

  public onPositionClosed(callback: (payload: PositionClosedPayload) => void): () => void {
    this.positionClosedListeners.add(callback);
    return () => this.positionClosedListeners.delete(callback);
  }

  public onAccountMetrics(callback: (payload: AccountMetricsPayload) => void): () => void {
    this.accountMetricsListeners.add(callback);
    return () => this.accountMetricsListeners.delete(callback);
  }

  public onConnectionStatus(callback: (payload: ConnectionStatusPayload) => void): () => void {
    this.connectionStatusListeners.add(callback);
    return () => this.connectionStatusListeners.delete(callback);
  }

  public onEnergyUpdate(callback: (payload: EnergyUpdatePayload) => void): () => void {
    this.energyUpdateListeners.add(callback);
    return () => this.energyUpdateListeners.delete(callback);
  }

  public onCTraderLog(callback: (log: any) => void): () => void {
    this.cTraderLogListeners.add(callback);
    return () => this.cTraderLogListeners.delete(callback);
  }

  public onReconnect(callback: () => void): () => void {
    this.reconnectListeners.add(callback);
    return () => this.reconnectListeners.delete(callback);
  }

}

export const socketClient = new SocketClient();

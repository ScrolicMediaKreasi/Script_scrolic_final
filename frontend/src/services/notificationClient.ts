// Client-side Notification & Web Push Service

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export interface NotificationSnapshotData {
  unread_count: number;
  total_count: number;
  updated_at?: string;
}

export interface RealtimeNotificationEvent {
  type: string;
  snapshot?: NotificationSnapshotData;
  notification?: any;
  readNotificationId?: string;
  allRead?: boolean;
}

export class NotificationClient {
  private eventSource: EventSource | null = null;
  private reconnectTimer: any = null;

  /**
   * Fast Unread Badge Snapshot (<100ms)
   */
  async getSnapshot(userId?: string): Promise<NotificationSnapshotData> {
    try {
      const headers: Record<string, string> = {};
      if (userId) headers['x-session-user-id'] = userId;

      const res = await fetch('/api/notifications/snapshot', { headers });
      const data = await res.json();
      if (data.snapshot) {
        return {
          unread_count: Number(data.snapshot.unread_count) || 0,
          total_count: Number(data.snapshot.total_count) || 0,
          updated_at: data.snapshot.updated_at
        };
      }
    } catch (err) {
      console.warn('[NotificationClient] getSnapshot error:', err);
    }
    return { unread_count: 0, total_count: 0 };
  }

  /**
   * Real-time Server-Sent Events (SSE) Live Connection
   */
  connectRealtimeStream(
    userId: string,
    onMessage: (event: RealtimeNotificationEvent) => void
  ): () => void {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (!userId) return () => {};

    const url = `/api/notifications/stream?userId=${encodeURIComponent(userId)}`;
    
    try {
      this.eventSource = new EventSource(url);

      this.eventSource.onmessage = (e) => {
        try {
          if (!e.data || e.data.startsWith(':')) return; // Ignore heartbeats
          const parsed = JSON.parse(e.data);
          onMessage(parsed);
        } catch (parseErr) {
          console.warn('[NotificationClient] SSE parse error:', parseErr);
        }
      };

      this.eventSource.onerror = () => {
        if (this.eventSource) {
          this.eventSource.close();
          this.eventSource = null;
        }
        // Auto-reconnect with 5s delay
        this.reconnectTimer = setTimeout(() => {
          this.connectRealtimeStream(userId, onMessage);
        }, 5000);
      };
    } catch (err) {
      console.warn('[NotificationClient] SSE connection init failed:', err);
    }

    return () => {
      if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
      if (this.eventSource) {
        this.eventSource.close();
        this.eventSource = null;
      }
    };
  }

  /**
   * Register Service Worker & Web Push Subscription (Multi-Device)
   */
  async registerPush(userId: string): Promise<boolean> {
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
      return false;
    }

    try {
      // 1. Register Service Worker
      const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
      await navigator.serviceWorker.ready;

      // 2. Check or request Notification permission
      let permission = Notification.permission;
      if (permission === 'default') {
        permission = await Notification.requestPermission();
      }

      if (permission !== 'granted') {
        return false;
      }

      // 3. Fetch VAPID Public Key from server
      const vapidRes = await fetch('/api/notifications/vapid-public-key');
      const vapidData = await vapidRes.json();
      const publicKey = vapidData.publicKey;

      if (!publicKey) {
        return false;
      }

      // 4. Subscribe with PushManager
      const convertedKey = urlBase64ToUint8Array(publicKey);
      let subscription = await registration.pushManager.getSubscription();

      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: convertedKey
        });
      }

      // 5. Send subscription to server
      const subJson = subscription.toJSON();
      if (subJson.endpoint && subJson.keys) {
        await fetch('/api/notifications/subscribe', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-session-user-id': userId
          },
          body: JSON.stringify({
            subscription: {
              endpoint: subJson.endpoint,
              keys: {
                p256dh: subJson.keys.p256dh,
                auth: subJson.keys.auth
              }
            },
            deviceId: navigator.userAgent.slice(0, 50)
          })
        });
        return true;
      }
    } catch (err: any) {
      console.warn('[NotificationClient] Push registration error (safe ignore in sandboxed environments):', err.message);
    }
    return false;
  }
}

export const notificationClient = new NotificationClient();

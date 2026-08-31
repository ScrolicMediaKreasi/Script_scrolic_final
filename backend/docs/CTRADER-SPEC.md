# cTrader Open API Specification & Runtime Architecture
**Version**: 2.0 (Tahap 0 & Tahap 2 Implementation)  
**Sole Runtime Owner**: Python FastAPI (`:8001`)  
**Official Reference Documentation**:  
- [cTrader Open API Documentation](https://help.ctrader.com/open-api/)  
- [cTrader Connection Specification](https://help.ctrader.com/open-api/connection/)  
- [cTrader Open API FAQ](https://help.ctrader.com/open-api/faq/)  

---

## 1. Runtime Ownership & Architecture
- **Single Runtime**: Python FastAPI on port `:8001` owns all cTrader Open API integrations (OAuth, WebSocket / TCP TLS connections, Protobuf messages, Account & Position synchronization, execution events).
- **Node.js**: Node runtime is decommissioned from owning cTrader integration state. Health endpoints report `node_alive: false` and declare FastAPI as the single owner.
- **Independence**: The persistent broker connection runs in the FastAPI backend process and does NOT depend on browser tabs or frontend active sessions.

---

## 2. Official Endpoints & Port Validation
The integration connects exclusively to official Spotware endpoints based on `CTRADER_ENV` (`demo` or `live`):

| Environment | Host | TCP TLS (Protobuf) | WebSocket Secure (WSS) | REST API |
|---|---|---|---|---|
| **Demo** | `demo.ctraderapi.com` | `5035` | `wss://demo.ctraderapi.com:5036` | `https://demo.ctraderapi.com` |
| **Live** | `live.ctraderapi.com` (`live1.p.ctrader.com`) | `5035` | `wss://live.ctraderapi.com:5036` | `https://live.ctraderapi.com` |

> **Port Distinction**:
> - **Port 5035**: Dedicated to raw TCP over SSL/TLS with 4-byte big-endian length prefix framing (`ProtoMessage`).
> - **Port 5036**: Dedicated to WebSocket Secure (WSS) frames.

---

## 3. Connection Lifecycle & States
The persistent client (`CTraderClient`) manages connection states via a strict finite state machine:

```
[DISCONNECTED] -> [CONNECTING] -> [CONNECTED] -> [AUTHENTICATED]
      ^                                |               |
      |                                v               v
      +---------- [RECONNECTING] <-- [DEGRADED] <------+
```

- `DISCONNECTED`: Initial state or stopped cleanly.
- `CONNECTING`: Socket handshake / TLS negotiation in progress.
- `CONNECTED`: Transport connected; application authorization pending.
- `AUTHENTICATED`: `ProtoOAApplicationAuthReq` (2100) and authorized accounts (`2102`) succeeded.
- `DEGRADED`: Heartbeat response missing for > 35-40 seconds.
- `RECONNECTING`: Connection lost; exponential backoff active.

---

## 4. Heartbeat Protocol
- **Interval**: Sent every **20 seconds**.
- **Message**: `ProtoHeartbeatEvent` (payloadType `51`).
- **Timeout Monitoring**: If no incoming message or heartbeat response is received within **40 seconds**, connection enters `DEGRADED` state and triggers immediate reconnection.

---

## 5. Reconnection & Exponential Backoff
- **Formula**: `delay = min(2.0 * (2 ** (retry_count - 1)), 60.0)`
- **Initial Delay**: 2.0s
- **Max Delay**: 60.0s
- **Post-Reconnect Workflow**:
  1. Establish TCP TLS (5035) or WebSocket (5036).
  2. Send `ProtoOAApplicationAuthReq` (2100) with `clientId` and `clientSecret`.
  3. Send `ProtoOAAccountAuthReq` (2102) for all active user accounts.
  4. Send `ProtoOAReconcileReq` (2124) to synchronize active open positions and orders.
  5. Reset retry count to 0 and transition to `AUTHENTICATED`.

---

## 6. Observability, Diagnostics & Metrics
Diagnostics endpoints:
- `GET /api/ctrader/connection/status`
- `GET /api/ctrader/diagnostics`

Exposed Metrics Schema:
```json
{
  "state": "AUTHENTICATED",
  "is_broker_connected": true,
  "is_authenticated": true,
  "environment": "demo",
  "transport": "WEBSOCKET",
  "host": "demo.ctraderapi.com",
  "tcp_port": 5035,
  "ws_port": 5036,
  "connected_at": "2026-08-26T20:00:00Z",
  "authenticated_at": "2026-08-26T20:00:01Z",
  "last_heartbeat_sent_at": "2026-08-26T20:00:20Z",
  "last_heartbeat_received_at": "2026-08-26T20:00:20Z",
  "last_message_at": "2026-08-26T20:00:20Z",
  "reconnect_count": 0,
  "last_error": null,
  "last_error_at": null,
  "authenticated_accounts": ["cTrader-47601047"]
}
```

---

## 7. Security & Credential Safety
- All tokens, client secrets, and authorization codes are masked in logs using `mask_credential()`.
- Access and refresh tokens are stored securely in the database and never transmitted in unauthenticated diagnostic payloads.

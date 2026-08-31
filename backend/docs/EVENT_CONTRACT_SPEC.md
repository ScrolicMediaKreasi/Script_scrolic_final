# Scrolic Realtime WebSocket & Socket.IO Event Contract Specification
**Version**: 2.0 (Tahap 8 Standardization)  
**Protocol**: ASGI Socket.IO & WebSocket over FastAPI (`:8001`)  
**Standard**: Strict camelCase, Idempotency Event Keys, Sequence Monotonicity, and Room Isolation.

---

## 1. Event Naming & Purpose

| Event Name | Scope / Target Room | Direction | Purpose |
|---|---|---|---|
| `feed:new_post` | Public (`*`) | Server -> Client | Broadcasts newly opened trading setup / execution post to the social feed. |
| `feed:position_update` | Public (`*`) | Server -> Client | Streams live tick valuations, pips, current prices, and progress updates. |
| `feed:position_closed` | Public (`*`) | Server -> Client | Notifies clients that an open trading setup has closed with final realized PnL. |
| `account:metrics_update` | Private (`user_{userId}` / `account_{accountId}`) | Server -> Client | Emits private account balance, floating equity, margin, and free margin. |
| `connection:status_update` | Public / Diagnostics | Server -> Client | Streams broker connection lifecycle state changes and heartbeat health. |
| `join:user_room` | Client Request | Client -> Server | Client joins their private user room for receiving confidential portfolio metrics. |

---

## 2. Standard Event Envelope Properties
Every event payload MUST include the following metadata envelope fields:
- `eventId` (`string`): Unique event idempotency key (e.g., `evt_1724700000000_a1b2c3d4`).
- `sequence` (`number`): Monotonically increasing sequence integer.
- `timestamp` (`number`): Unix millisecond timestamp.

---

## 3. Detailed Payload Schemas

### 3.1 `feed:new_post`
```json
{
  "eventId": "post_new_1724700000000_a1b2c3d4",
  "sequence": 104,
  "timestamp": 1724700000000,
  "postId": "post-ctrader-47601047-11223344",
  "tradeId": "11223344",
  "positionId": "11223344",
  "userId": "user-alex",
  "username": "alex_trader",
  "avatar": "https://images.unsplash.com/...",
  "accountId": "cTrader-47601047",
  "symbol": "XAUUSD",
  "market": "Commodity",
  "strategyId": "breakout",
  "positionType": "BUY",
  "status": "OPEN",
  "entryPrice": 2914.50,
  "currentPrice": 2914.50,
  "stopLoss": 2900.00,
  "takeProfit": 2950.00,
  "progress": 50,
  "profit": 0.00,
  "profitPercent": 0.00,
  "lot": 1.00,
  "pips": 0.0,
  "duration": "Live OP",
  "openedAt": "2026-08-26T20:20:00.000Z",
  "visibility": "LOCKED",
  "unlockPrice": 1,
  "followPrice": 1,
  "isSimulation": false,
  "source": "broker_ctrader",
  "autoDescription": "⚡ Posisi Terbuka (OP) cTrader: BUY 1.0 Lot XAUUSD @ 2914.5"
}
```

---

### 3.2 `feed:position_update`
```json
{
  "eventId": "pos_upd_1724700002000_b2c3d4e5",
  "sequence": 105,
  "timestamp": 1724700002000,
  "postId": "post-ctrader-47601047-11223344",
  "tradeId": "11223344",
  "positionId": "11223344",
  "symbol": "XAUUSD",
  "side": "BUY",
  "direction": "BUY",
  "entry": 2914.50,
  "current": 2918.20,
  "currentPrice": 2918.20,
  "bid": 2918.20,
  "ask": 2918.40,
  "pips": 37.0,
  "profit": 370.00,
  "profitUsd": 370.00,
  "profitPercent": 12.69,
  "stopLoss": 2900.00,
  "takeProfit": 2950.00,
  "progress": 60,
  "status": "OPEN"
}
```

---

### 3.3 `feed:position_closed`
```json
{
  "eventId": "pos_close_1724700010000_c3d4e5f6",
  "sequence": 106,
  "timestamp": 1724700010000,
  "postId": "post-ctrader-47601047-11223344",
  "tradeId": "11223344",
  "positionId": "11223344",
  "closePrice": 2930.00,
  "profit": 1550.00,
  "closedAt": "2026-08-26T20:25:00.000Z",
  "status": "CLOSED"
}
```

---

### 3.4 `account:metrics_update` (Private Confidential Room)
> **Security Guard**: Emitted strictly to `user_{userId}` or `account_{accountId}` rooms. NEVER broadcast to public feed!
```json
{
  "eventId": "acct_upd_1724700005000_d4e5f6a7",
  "sequence": 107,
  "timestamp": 1724700005000,
  "accountId": "cTrader-47601047",
  "ctidTraderAccountId": 47601047,
  "balance": 5420.50,
  "equity": 5790.50,
  "unrealizedPnL": 370.00,
  "usedMargin": 582.90,
  "freeMargin": 5207.60,
  "marginLevel": 993.40,
  "leverage": 500,
  "currency": "USD",
  "moneyDigits": 2,
  "openPositionsCount": 1,
  "isStale": false,
  "staleReason": null
}
```

---

## 4. Privacy & Room Isolation Architecture
```
                         +---------------------------------+
                         |  FastAPI Socket.IO Supervisor   |
                         +----------------+----------------+
                                          |
                   +----------------------+----------------------+
                   |                                             |
         [Public Broadcast]                             [Private Room Isolation]
                   |                                             |
     +-------------+-------------+                  +------------+------------+
     |             |             |                  |                         |
feed:new_post feed:position_upd feed:pos_closed   room: user_alex       room: account_47601047
 (Public Feed)  (Public Feed)   (Public Feed)    (account:metrics_upd)   (account:metrics_upd)
```

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { normalizePositionUpdate } from './livePositionStore';

describe('normalizePositionUpdate', () => {
  it('does not turn missing prices into zero-valued live prices', () => {
    const normalized = normalizePositionUpdate({
      postId: 'post-0',
      symbol: 'XAUUSD',
      profitUsd: 25,
    } as any);

    assert.equal(normalized.entryPrice, undefined);
    assert.equal(normalized.currentPrice, undefined);
  });

  it('keeps BTCUSD entry/current values in sync with live socket payloads', () => {
    const normalized = normalizePositionUpdate({
      postId: 'post-1',
      tradeId: 'trade-1',
      symbol: 'BTCUSD',
      entryPrice: 100000,
      currentPrice: 100050,
      direction: 'BUY',
      pips: 50,
      progress: 75,
      status: 'OPEN'
    });

    assert.equal(normalized.entryPrice, 100000);
    assert.equal(normalized.currentPrice, 100050);
    assert.equal(normalized.direction, 'BUY');
    assert.equal(normalized.pips, 50);
  });

  it('accepts legacy payload keys from the cTrader update event', () => {
    const normalized = normalizePositionUpdate({
      postId: 'post-2',
      tradeId: 'trade-2',
      symbol: 'XAUUSD',
      entry: 2900,
      current: 2910,
      side: 'BUY',
      pips: 100,
      progress: 80,
      status: 'OPEN'
    });

    assert.equal(normalized.entryPrice, 2900);
    assert.equal(normalized.currentPrice, 2910);
    assert.equal(normalized.direction, 'BUY');
  });
});

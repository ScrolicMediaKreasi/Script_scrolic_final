import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { computePositionMetrics } from './PositionProgressBar';

describe('computePositionMetrics', () => {
  it('anchors the live marker to the entry price when there is no SL/TP', () => {
    const metrics = computePositionMetrics({
      direction: 'BUY',
      entryPrice: 100,
      currentPrice: 100,
      stopLoss: 0,
      takeProfit: 0,
      symbol: 'XAUUSD',
      pips: 0,
      profitUSD: 0,
    });

    assert.ok(Math.abs(metrics.entryPercent - 50) < 0.0001);
    assert.ok(Math.abs(metrics.progressPercent - 50) < 0.0001);
  });

  it('moves the marker from the entry position as price changes', () => {
    const atEntry = computePositionMetrics({
      direction: 'BUY',
      entryPrice: 100,
      currentPrice: 100,
      stopLoss: 0,
      takeProfit: 0,
      symbol: 'XAUUSD',
      pips: 0,
      profitUSD: 0,
    });

    const upMove = computePositionMetrics({
      direction: 'BUY',
      entryPrice: 100,
      currentPrice: 102,
      stopLoss: 0,
      takeProfit: 0,
      symbol: 'XAUUSD',
      pips: 2,
      profitUSD: 2,
    });

    const downMove = computePositionMetrics({
      direction: 'BUY',
      entryPrice: 100,
      currentPrice: 98,
      stopLoss: 0,
      takeProfit: 0,
      symbol: 'XAUUSD',
      pips: -2,
      profitUSD: -2,
    });

    assert.ok(upMove.progressPercent > atEntry.progressPercent);
    assert.ok(downMove.progressPercent < atEntry.progressPercent);
    assert.ok(upMove.progressPercent > 50);
    assert.ok(downMove.progressPercent < 50);
  });

  it('tracks live price drift even without SL/TP and without relying on pips', () => {
    const atEntry = computePositionMetrics({
      direction: 'BUY',
      entryPrice: 100,
      currentPrice: 100,
      stopLoss: 0,
      takeProfit: 0,
      symbol: 'BTCUSD',
      pips: 0,
      profitUSD: 0,
    });

    const drifted = computePositionMetrics({
      direction: 'BUY',
      entryPrice: 100,
      currentPrice: 108,
      stopLoss: 0,
      takeProfit: 0,
      symbol: 'BTCUSD',
      pips: 0,
      profitUSD: 0,
    });

    assert.ok(drifted.progressPercent > atEntry.progressPercent);
    assert.ok(drifted.progressPercent > 50);
  });

  it('uses profit USD as the live progress signal when pips are stale or zero', () => {
    const atEntry = computePositionMetrics({
      direction: 'BUY',
      entryPrice: 100,
      currentPrice: 100,
      stopLoss: 0,
      takeProfit: 0,
      symbol: 'BTCUSD',
      pips: 0,
      profitUSD: 0,
    });

    const fromProfitUSD = computePositionMetrics({
      direction: 'BUY',
      entryPrice: 100,
      currentPrice: 100,
      stopLoss: 0,
      takeProfit: 0,
      symbol: 'BTCUSD',
      pips: 0,
      profitUSD: 125,
    });

    assert.ok(fromProfitUSD.progressPercent > atEntry.progressPercent);
    assert.ok(fromProfitUSD.progressPercent > 50);
  });

  it('moves an SL/TP position when live profit USD changes', () => {
    const atEntry = computePositionMetrics({
      direction: 'BUY',
      entryPrice: 100,
      currentPrice: 100,
      stopLoss: 95,
      takeProfit: 110,
      symbol: 'BTCUSD',
      pips: 0,
      profitUSD: 0,
    });

    const fromProfitUSD = computePositionMetrics({
      direction: 'BUY',
      entryPrice: 100,
      currentPrice: 100,
      stopLoss: 95,
      takeProfit: 110,
      symbol: 'BTCUSD',
      pips: 0,
      profitUSD: 125,
    });

    assert.ok(fromProfitUSD.progressPercent > atEntry.progressPercent);
  });

  it('keeps closed positions away from the entry mark based on profit USD outcome', () => {
    const closedProfit = computePositionMetrics({
      direction: 'BUY',
      entryPrice: 100,
      currentPrice: 100,
      stopLoss: 0,
      takeProfit: 0,
      symbol: 'BTCUSD',
      pips: 0,
      profitUSD: 220,
      status: 'CLOSED',
    } as any);

    const closedLoss = computePositionMetrics({
      direction: 'SELL',
      entryPrice: 100,
      currentPrice: 100,
      stopLoss: 0,
      takeProfit: 0,
      symbol: 'BTCUSD',
      pips: 0,
      profitUSD: -220,
      status: 'CLOSED',
    } as any);

    assert.ok(closedProfit.progressPercent > 70);
    assert.ok(closedLoss.progressPercent < 30);
  });
});

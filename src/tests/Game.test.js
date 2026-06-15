import test from "node:test";
import assert from "node:assert/strict";
import Game from "../components/Game.js";
import { isMobileDevice, drawSparks, drawParticles } from "../utils/render.js";

test("Game component is a functional React component", () => {
  assert.equal(typeof Game, "function");
});

test("Game component renders high score and handles record messaging", () => {
  // 1. New personal best (currentScore > previousBest)
  const element1 = Game({ levelId: 1, currentScore: 120, previousBest: 100 });
  const children1 = element1.props.children.props.children;
  const scoreValSpan1 = children1[1].props.children[1];
  assert.equal(scoreValSpan1.props.children, "120 pts");
  const msgDiv1 = children1[2];
  assert.ok(msgDiv1);
  assert.equal(msgDiv1.props["data-testid"], "new-record-msg");
  assert.equal(msgDiv1.props.children, "🎉 New Personal Best!");

  // 2. Tie score (currentScore === previousBest) → no record message
  const element2 = Game({ levelId: 1, currentScore: 100, previousBest: 100 });
  const children2 = element2.props.children.props.children;
  assert.equal(children2[2], null);

  // 3. Lower score (currentScore < previousBest) → no record, shows real best
  const element3 = Game({ levelId: 1, currentScore: 100, previousBest: 150 });
  const children3 = element3.props.children.props.children;
  assert.equal(children3[1].props.children[1].props.children, "150 pts");
  assert.equal(children3[2], null);
});

test("mobile performance rendering optimizations", () => {
  // Mock window/navigator for mobile detection
  const originalNavigator = globalThis.navigator;
  const originalWindow = globalThis.window;

  try {
    Object.defineProperty(globalThis, "navigator", {
      value: { userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Mobile/15E148 Safari/604.1" },
      writable: true,
      configurable: true,
    });
    Object.defineProperty(globalThis, "window", {
      value: { innerWidth: 375 },
      writable: true,
      configurable: true,
    });
    assert.equal(isMobileDevice(), true);

    Object.defineProperty(globalThis, "navigator", {
      value: { userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" },
      writable: true,
      configurable: true,
    });
    Object.defineProperty(globalThis, "window", {
      value: { innerWidth: 1024 },
      writable: true,
      configurable: true,
    });
    assert.equal(isMobileDevice(), false);
  } finally {
    if (originalNavigator === undefined) {
      delete globalThis.navigator;
    } else {
      Object.defineProperty(globalThis, "navigator", { value: originalNavigator, configurable: true });
    }
    if (originalWindow === undefined) {
      delete globalThis.window;
    } else {
      Object.defineProperty(globalThis, "window", { value: originalWindow, configurable: true });
    }
  }
});

test("render optimizations bypass expensive canvas operations on mobile", () => {
  const mockCtx = {
    clearRect: () => {},
    fillRect: () => {},
    beginPath: () => {},
    arc: () => {},
    fill: () => {},
    stroke: () => {},
    moveTo: () => {},
    lineTo: () => {},
    save: () => { mockCtx.saveCount++; },
    restore: () => { mockCtx.restoreCount++; },
    translate: () => {},
    rotate: () => {},
    shadowBlur: 0,
    shadowColor: "",
    globalAlpha: 1.0,
    saveCount: 0,
    restoreCount: 0,
  };

  const particles = [
    { x: 10, y: 10, vx: 1, vy: 1, size: 5, color: "#fff", alpha: 1.0, decay: 0.01, gravity: 0.1, kind: "spark", rotation: 0.5, spin: 0.1 }
  ];

  // Mobile mode: drawParticles should NOT call save/restore or set shadowBlur
  mockCtx.saveCount = 0;
  mockCtx.restoreCount = 0;
  mockCtx.shadowBlur = 0;
  drawParticles(mockCtx, [...particles], true);
  assert.equal(mockCtx.saveCount, 0);
  assert.equal(mockCtx.restoreCount, 0);
  assert.equal(mockCtx.shadowBlur, 0);

  // Mobile mode: drawSparks should NOT set shadowBlur
  drawSparks(mockCtx, [...particles], 100, 100, true);
  assert.equal(mockCtx.shadowBlur, 0);

  // Desktop mode: drawParticles SHOULD call save/restore and set shadowBlur
  mockCtx.saveCount = 0;
  mockCtx.restoreCount = 0;
  drawParticles(mockCtx, [...particles], false);
  assert.equal(mockCtx.saveCount, 1);
  assert.equal(mockCtx.restoreCount, 1);
  assert.equal(mockCtx.shadowBlur, 6);

  // Desktop mode: drawSparks SHOULD set shadowBlur and then reset it to 0
  drawSparks(mockCtx, [...particles], 100, 100, false);
  assert.equal(mockCtx.shadowBlur, 0);
});

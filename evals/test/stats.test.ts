import { describe, expect, it } from "vitest";
import { bootstrapCI, wilsonCI } from "../src/stats.js";

// Deterministic LCG-based RNG so tests are reproducible.
function makeRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x1_0000_0000;
  };
}

function normalSamples(n: number, mean: number, std: number, rng: () => number): number[] {
  const out: number[] = [];
  for (let i = 0; i < n; i += 2) {
    const u1 = Math.max(rng(), 1e-12);
    const u2 = rng();
    const mag = std * Math.sqrt(-2 * Math.log(u1));
    out.push(mean + mag * Math.cos(2 * Math.PI * u2));
    if (out.length < n) {
      out.push(mean + mag * Math.sin(2 * Math.PI * u2));
    }
  }
  return out;
}

describe("bootstrapCI", () => {
  it("returns CI straddling the true mean for normal samples", () => {
    const rng = makeRng(42);
    const samples = normalSamples(200, 1.0, 1.0, rng);
    const ci = bootstrapCI(samples, 5000, 0.95, makeRng(7));
    expect(ci.lo).toBeLessThan(1.0);
    expect(ci.hi).toBeGreaterThan(1.0);
    expect(Math.abs(ci.mean - 1.0)).toBeLessThan(0.2);
  });

  it("CI shrinks toward zero for zero-mean symmetric input", () => {
    const rng = makeRng(11);
    const samples = normalSamples(500, 0, 0.5, rng);
    const ci = bootstrapCI(samples, 5000, 0.95, makeRng(3));
    expect(ci.lo).toBeLessThan(0);
    expect(ci.hi).toBeGreaterThan(0);
    expect(Math.abs(ci.mean)).toBeLessThan(0.1);
  });

  it("returns zeros for empty input", () => {
    const ci = bootstrapCI([], 100, 0.95, makeRng(1));
    expect(ci).toEqual({ lo: 0, hi: 0, mean: 0 });
  });

  it("returns the constant for a constant input", () => {
    const ci = bootstrapCI([2, 2, 2, 2], 1000, 0.95, makeRng(5));
    expect(ci.lo).toBe(2);
    expect(ci.hi).toBe(2);
    expect(ci.mean).toBe(2);
  });
});

describe("wilsonCI", () => {
  it("returns zeros for zero trials", () => {
    expect(wilsonCI(0, 0)).toEqual({ lo: 0, hi: 0, p: 0 });
  });

  it("center is roughly the proportion for large n", () => {
    const ci = wilsonCI(60, 100);
    expect(ci.p).toBeCloseTo(0.6, 3);
    expect(ci.lo).toBeLessThan(0.6);
    expect(ci.hi).toBeGreaterThan(0.6);
    expect(ci.lo).toBeGreaterThan(0.45);
    expect(ci.hi).toBeLessThan(0.75);
  });

  it("CI is wider for smaller n at same proportion", () => {
    const small = wilsonCI(6, 10);
    const big = wilsonCI(60, 100);
    expect(small.hi - small.lo).toBeGreaterThan(big.hi - big.lo);
  });
});

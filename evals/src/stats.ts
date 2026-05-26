export interface BootstrapCI {
  lo: number;
  hi: number;
  mean: number;
}

export function bootstrapCI(
  deltas: number[],
  iters = 10_000,
  ci = 0.95,
  rng: () => number = Math.random,
): BootstrapCI {
  if (deltas.length === 0) {
    return { lo: 0, hi: 0, mean: 0 };
  }
  const n = deltas.length;
  const means: number[] = new Array(iters);
  for (let i = 0; i < iters; i++) {
    let sum = 0;
    for (let j = 0; j < n; j++) {
      const idx = Math.floor(rng() * n);
      sum += deltas[idx]!;
    }
    means[i] = sum / n;
  }
  means.sort((a, b) => a - b);
  const alpha = (1 - ci) / 2;
  const loIdx = Math.floor(alpha * iters);
  const hiIdx = Math.min(iters - 1, Math.ceil((1 - alpha) * iters) - 1);
  let observedMean = 0;
  for (const d of deltas) observedMean += d;
  observedMean /= n;
  return { lo: means[loIdx]!, hi: means[hiIdx]!, mean: observedMean };
}

export interface WilsonCI {
  lo: number;
  hi: number;
  p: number;
}

export function wilsonCI(wins: number, total: number, z = 1.96): WilsonCI {
  if (total === 0) return { lo: 0, hi: 0, p: 0 };
  const p = wins / total;
  const z2 = z * z;
  const denom = 1 + z2 / total;
  const center = (p + z2 / (2 * total)) / denom;
  const half = (z * Math.sqrt((p * (1 - p)) / total + z2 / (4 * total * total))) / denom;
  return { lo: Math.max(0, center - half), hi: Math.min(1, center + half), p };
}

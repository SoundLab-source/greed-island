/**
 * Glicko-2 (Glickman, "Example of the Glicko-2 system", 2012).
 * Ratings are on the Glicko scale (1500 / 350 / 0.06 defaults). Floats are
 * fine here: ratings are not money.
 */

export interface Rating {
  rating: number;
  deviation: number;
  volatility: number;
}

export interface RatingsConfig {
  initialRating: number;
  initialDeviation: number;
  initialVolatility: number;
  /** System constant: how much volatility may change per rating period (0.3–1.2). */
  tau: number;
}

export const DEFAULT_RATINGS: Readonly<RatingsConfig> = Object.freeze({
  initialRating: 1500,
  initialDeviation: 350,
  initialVolatility: 0.06,
  tau: 0.5,
});

export function initialRating(cfg: RatingsConfig = DEFAULT_RATINGS): Rating {
  return { rating: cfg.initialRating, deviation: cfg.initialDeviation, volatility: cfg.initialVolatility };
}

const SCALE = 173.7178;
const EPSILON = 0.000001;

const toMu = (r: number) => (r - 1500) / SCALE;
const toPhi = (rd: number) => rd / SCALE;
const g = (phi: number) => 1 / Math.sqrt(1 + (3 * phi * phi) / (Math.PI * Math.PI));
const expected = (mu: number, muJ: number, phiJ: number) => 1 / (1 + Math.exp(-g(phiJ) * (mu - muJ)));

/** 1 = win, 0 = loss, 0.5 = draw. */
export type Score = 0 | 0.5 | 1;

export interface GameResult {
  opponent: Rating;
  score: Score;
}

/** New volatility via the Illinois algorithm (step 5 of the paper). */
function newVolatility(phi: number, sigma: number, v: number, delta: number, tau: number): number {
  const a = Math.log(sigma * sigma);
  const f = (x: number) => {
    const ex = Math.exp(x);
    const d = phi * phi + v + ex;
    return (ex * (delta * delta - phi * phi - v - ex)) / (2 * d * d) - (x - a) / (tau * tau);
  };
  let A = a;
  let B: number;
  if (delta * delta > phi * phi + v) {
    B = Math.log(delta * delta - phi * phi - v);
  } else {
    let k = 1;
    while (f(a - k * tau) < 0) k++;
    B = a - k * tau;
  }
  let fA = f(A);
  let fB = f(B);
  while (Math.abs(B - A) > EPSILON) {
    const C = A + ((A - B) * fA) / (fB - fA);
    const fC = f(C);
    if (fC * fB <= 0) {
      A = B;
      fA = fB;
    } else {
      fA = fA / 2;
    }
    B = C;
    fB = fC;
  }
  return Math.exp(A / 2);
}

/**
 * Rate one player over one rating period. With no games, only the deviation
 * grows (uncertainty increases while a character sits out).
 */
export function rate(player: Rating, games: readonly GameResult[], tau: number = DEFAULT_RATINGS.tau): Rating {
  const mu = toMu(player.rating);
  const phi = toPhi(player.deviation);
  const sigma = player.volatility;

  if (games.length === 0) {
    return { ...player, deviation: Math.sqrt(phi * phi + sigma * sigma) * SCALE };
  }

  let vInv = 0;
  let deltaSum = 0;
  for (const { opponent, score } of games) {
    const muJ = toMu(opponent.rating);
    const gJ = g(toPhi(opponent.deviation));
    const e = expected(mu, muJ, toPhi(opponent.deviation));
    vInv += gJ * gJ * e * (1 - e);
    deltaSum += gJ * (score - e);
  }
  const v = 1 / vInv;
  const delta = v * deltaSum;

  const sigmaNew = newVolatility(phi, sigma, v, delta, tau);
  const phiStar = Math.sqrt(phi * phi + sigmaNew * sigmaNew);
  const phiNew = 1 / Math.sqrt(1 / (phiStar * phiStar) + 1 / v);
  const muNew = mu + phiNew * phiNew * deltaSum;

  return { rating: muNew * SCALE + 1500, deviation: phiNew * SCALE, volatility: sigmaNew };
}

/**
 * Rate a single fight as its own rating period for both sides, each using
 * the other's pre-fight rating. `scoreA` is side A's result.
 */
export function rateFight(a: Rating, b: Rating, scoreA: Score, tau: number = DEFAULT_RATINGS.tau): [Rating, Rating] {
  const scoreB = (1 - scoreA) as Score;
  return [rate(a, [{ opponent: b, score: scoreA }], tau), rate(b, [{ opponent: a, score: scoreB }], tau)];
}

/**
 * Chance that A beats B, accounting for both players' uncertainty:
 * E = 1 / (1 + exp(-g(√(φA² + φB²)) · (μA − μB))).
 */
export function expectedScore(a: Rating, b: Rating): number {
  const phi = Math.sqrt(toPhi(a.deviation) ** 2 + toPhi(b.deviation) ** 2);
  return 1 / (1 + Math.exp(-g(phi) * (toMu(a.rating) - toMu(b.rating))));
}

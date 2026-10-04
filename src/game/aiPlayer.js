/**
 * AI opponent. It "imagines" a batch of candidate flicks, simulates each one
 * with the real physics engine, scores the outcomes and picks the best — then
 * adds human-like aiming error based on the difficulty level.
 */
import { AI_DIFFICULTY, FLICK } from '../config/gameConfig';
import { edgeDistance, getPen, penSegment, simulateShot } from './physics';
import { otherPen } from './rules';

/** Small seeded PRNG so AI behaviour is reproducible in tests. */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function rand() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function scoreOutcome(world, aiId) {
  const me = getPen(world, aiId);
  const foe = getPen(world, otherPen(aiId));
  if (me.fallen && foe.fallen) return -40;
  if (me.fallen) return -200;
  if (foe.fallen) return 200 + edgeDistance(me.x, me.y) * 0.05;
  // Neither fell: prefer leaving the opponent near an edge and ourselves safe.
  const foeEdge = edgeDistance(foe.x, foe.y);
  const myEdge = edgeDistance(me.x, me.y);
  return -foeEdge * 0.25 + Math.min(myEdge, 300) * 0.15;
}

function candidateShot(world, aiId, rand) {
  const me = getPen(world, aiId);
  const foe = getPen(world, otherPen(aiId));
  const meSeg = penSegment(me);
  const foeSeg = penSegment(foe);

  // Where on our own pen to strike (centre = straight push, ends = spin).
  const tMe = lerp(0.2, 0.8, rand());
  const px = lerp(meSeg.ax, meSeg.bx, tMe);
  const py = lerp(meSeg.ay, meSeg.by, tMe);

  // Aim at a random point along the opponent's pen.
  const tFoe = rand();
  const tx = lerp(foeSeg.ax, foeSeg.bx, tFoe);
  const ty = lerp(foeSeg.ay, foeSeg.by, tFoe);
  const angle = Math.atan2(ty - py, tx - px) + (rand() - 0.5) * 0.3;
  const power = lerp(0.5, 1, rand());
  return { penId: aiId, px, py, angle, power };
}

function toImpulse(c) {
  const mag = c.power * FLICK.maxImpulse;
  return {
    penId: c.penId,
    px: c.px,
    py: c.py,
    jx: Math.cos(c.angle) * mag,
    jy: Math.sin(c.angle) * mag,
    power: c.power,
  };
}

/**
 * Choose a shot for the AI.
 * @param world       current physics world (not modified)
 * @param aiId        pen id the AI controls
 * @param difficulty  'easy' | 'normal' | 'hard'
 * @param rand        () => [0,1) random source
 */
export function chooseAIShot(world, aiId, difficulty = 'normal', rand = Math.random) {
  const cfg = AI_DIFFICULTY[difficulty] || AI_DIFFICULTY.normal;
  let best = null;
  let bestScore = -Infinity;

  for (let i = 0; i < cfg.candidates; i++) {
    const c = candidateShot(world, aiId, rand);
    const result = simulateShot(world, toImpulse(c));
    const s = scoreOutcome(result, aiId);
    if (s > bestScore) {
      bestScore = s;
      best = c;
    }
  }

  // Human-like execution error.
  const executed = {
    ...best,
    angle: best.angle + (rand() - 0.5) * 2 * cfg.aimNoise,
    power: Math.max(0.3, Math.min(1, best.power + (rand() - 0.5) * 2 * cfg.powerNoise)),
  };
  return toImpulse(executed);
}

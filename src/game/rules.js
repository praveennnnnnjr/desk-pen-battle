/**
 * Match rules — pure functions, shared by every game mode.
 *
 * Rules of Pen Clash:
 *  - Each player owns one pen. Players take turns flicking their own pen.
 *  - Knock the opponent's pen off the desk  -> you score a point.
 *  - Your own pen slides off (and theirs stays) -> your opponent scores.
 *  - Both pens go over the edge -> the round is replayed.
 *  - Nobody falls -> the turn passes to the other player.
 *  - First to MATCH.targetScore points wins the match.
 *  - After a point, the player who conceded it shoots first next round.
 */
import { DESK, FLICK, MATCH } from '../config/gameConfig';
import { contactPointOnPen, createPen, createWorld, getPen } from './physics';

export const PEN_IDS = ['p1', 'p2']; // p1 = bottom of the desk, p2 = top

export function otherPen(id) {
  return id === 'p1' ? 'p2' : 'p1';
}

// Small per-round variations so rounds don't all start identically.
const ROUND_LAYOUTS = [
  { a1: 0, a2: 0, dx: 0 },
  { a1: 0.35, a2: -0.25, dx: 60 },
  { a1: -0.3, a2: 0.4, dx: -70 },
  { a1: 0.15, a2: 0.15, dx: 90 },
  { a1: -0.2, a2: -0.35, dx: -40 },
];

export function createRoundWorld(round) {
  const layout = ROUND_LAYOUTS[(round - 1) % ROUND_LAYOUTS.length];
  const cx = DESK.width / 2;
  return createWorld([
    createPen('p1', cx + layout.dx, DESK.height * 0.74, layout.a1),
    createPen('p2', cx - layout.dx, DESK.height * 0.26, layout.a2),
  ]);
}

export function createInitialMatchState(firstTurn = 'p1') {
  return {
    round: 1,
    turn: firstTurn,
    scores: { p1: 0, p2: 0 },
    shots: { p1: 0, p2: 0 },
    winner: null,
  };
}

/**
 * Turn a pull-back gesture into a shot.
 *  grab: world point where the finger first touched (near the pen)
 *  drag: world point where the finger is now
 * The pen is launched in the OPPOSITE direction of the pull, like a
 * slingshot. Returns null if the pull is too weak (treated as a cancel).
 */
export function buildShot(pen, grab, drag) {
  const contact = contactPointOnPen(pen, grab.x, grab.y);
  const pullX = grab.x - drag.x;
  const pullY = grab.y - drag.y;
  const pullLen = Math.hypot(pullX, pullY);
  const power = Math.min(1, pullLen / FLICK.maxDrag);
  if (power < FLICK.minPower) return null;
  const mag = power * FLICK.maxImpulse;
  return {
    penId: pen.id,
    px: contact.x,
    py: contact.y,
    jx: (pullX / pullLen) * mag,
    jy: (pullY / pullLen) * mag,
    power,
  };
}

/** Preview data for the aim guide while the player is dragging. */
export function aimPreview(pen, grab, drag) {
  const contact = contactPointOnPen(pen, grab.x, grab.y);
  const pullX = grab.x - drag.x;
  const pullY = grab.y - drag.y;
  const pullLen = Math.hypot(pullX, pullY);
  const power = Math.min(1, pullLen / FLICK.maxDrag);
  return {
    contact,
    dirX: pullLen ? pullX / pullLen : 0,
    dirY: pullLen ? pullY / pullLen : 0,
    power,
    valid: power >= FLICK.minPower,
  };
}

/**
 * Decide what a finished shot means.
 * Returns { type: 'continue' | 'point' | 'replay', scorer?: penId }
 */
export function evaluateShot(world, shooterId) {
  const shooter = getPen(world, shooterId);
  const target = getPen(world, otherPen(shooterId));
  if (shooter.fallen && target.fallen) return { type: 'replay' };
  if (target.fallen) return { type: 'point', scorer: shooterId };
  if (shooter.fallen) return { type: 'point', scorer: target.id };
  return { type: 'continue' };
}

/**
 * Apply an outcome to the match state. Returns the new state plus
 * whether a fresh round layout must be loaded.
 */
export function applyOutcome(state, outcome, shooterId) {
  const next = {
    ...state,
    scores: { ...state.scores },
    shots: { ...state.shots, [shooterId]: (state.shots[shooterId] || 0) + 1 },
  };
  let resetRound = false;

  if (outcome.type === 'continue') {
    next.turn = otherPen(shooterId);
  } else if (outcome.type === 'replay') {
    resetRound = true;
    next.turn = otherPen(shooterId);
  } else if (outcome.type === 'point') {
    next.scores[outcome.scorer] += 1;
    if (next.scores[outcome.scorer] >= MATCH.targetScore) {
      next.winner = outcome.scorer;
    } else {
      resetRound = true;
      next.round = state.round + 1;
      next.turn = otherPen(outcome.scorer); // conceding player starts
    }
  }
  return { state: next, resetRound };
}

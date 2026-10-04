import { chooseAIShot, mulberry32 } from '../src/game/aiPlayer';
import { getPen, simulateShot, snapshot, worldFromSnapshot } from '../src/game/physics';
import { applyOutcome, buildShot, createInitialMatchState, createRoundWorld, evaluateShot } from '../src/game/rules';

describe('physics', () => {
  test('a weak flick moves the pen but keeps it on the desk', () => {
    const w = createRoundWorld(1);
    const p1 = getPen(w, 'p1');
    const shot = buildShot(p1, { x: p1.x, y: p1.y }, { x: p1.x, y: p1.y + 80 });
    const r = simulateShot(w, shot);
    const moved = getPen(r, 'p1');
    expect(moved.y).toBeLessThan(p1.y);
    expect(moved.fallen).toBe(false);
  });

  test('a full-power sideways flick sends the pen off the desk', () => {
    const w = createRoundWorld(1);
    const p1 = getPen(w, 'p1');
    const shot = buildShot(p1, { x: p1.x, y: p1.y }, { x: p1.x + 400, y: p1.y });
    const r = simulateShot(w, shot);
    expect(evaluateShot(r, 'p1')).toEqual({ type: 'point', scorer: 'p2' });
  });

  test('a flick near the end makes the pen spin', () => {
    const w = createRoundWorld(1);
    const p1 = getPen(w, 'p1');
    const r = simulateShot(w, { penId: 'p1', px: p1.x + 190, py: p1.y, jx: 0, jy: -800 });
    expect(Math.abs(getPen(r, 'p1').angle - p1.angle)).toBeGreaterThan(1);
  });

  test('simulation is deterministic (needed for online replays)', () => {
    const shot = { penId: 'p1', px: 500, py: 1110, jx: 200, jy: -1500 };
    const a = snapshot(simulateShot(createRoundWorld(2), shot));
    const b = snapshot(simulateShot(worldFromSnapshot(snapshot(createRoundWorld(2))), shot));
    expect(a).toEqual(b);
  });

  test('too-weak pulls are cancelled', () => {
    const p1 = getPen(createRoundWorld(1), 'p1');
    expect(buildShot(p1, { x: p1.x, y: p1.y }, { x: p1.x, y: p1.y + 3 })).toBeNull();
  });
});

describe('rules', () => {
  test('scoring, round reset and winner', () => {
    let s = createInitialMatchState('p1');
    for (let i = 0; i < 3; i++) {
      const r = applyOutcome(s, { type: 'point', scorer: 'p1' }, 'p1');
      s = r.state;
    }
    expect(s.scores.p1).toBe(3);
    expect(s.winner).toBe('p1');
  });

  test('turn passes when nobody falls', () => {
    const { state } = applyOutcome(createInitialMatchState('p1'), { type: 'continue' }, 'p1');
    expect(state.turn).toBe('p2');
  });
});

describe('AI', () => {
  test('AI-vs-AI matches always finish with a winner', () => {
    const rand = mulberry32(42);
    for (const diff of ['easy', 'normal', 'hard']) {
      let state = createInitialMatchState('p1');
      let world = createRoundWorld(1);
      let n = 0;
      while (!state.winner && n < 300) {
        const id = state.turn;
        world = simulateShot(world, chooseAIShot(world, id, diff, rand));
        const r = applyOutcome(state, evaluateShot(world, id), id);
        state = r.state;
        if (r.resetRound) world = createRoundWorld(state.round);
        n++;
      }
      expect(state.winner).not.toBeNull();
    }
  });
});

/**
 * React hook that runs the physics loop and the match flow
 * (aim -> moving -> result banner -> next turn / next round / match over).
 *
 * It is mode-agnostic. Game modes plug in through callbacks:
 *  - isAuthoritative(shooterPenId): does THIS device decide the result of
 *    that shot? (true for AI and Pass & Play; only the shooter's device online)
 *  - onShotFired(shot, startSnapshot): a local player released a flick
 *  - onShotResolved(result): this device decided a shot's result
 *  - onMatchOver(match), onEvent(physicsEvent)
 */
import { useCallback, useEffect, useRef, useState } from 'react';

import { MATCH } from '../config/gameConfig';
import { advance, applyShot, freeze, isSettled, snapshot, worldFromSnapshot } from './physics';
import { applyOutcome, createInitialMatchState, createRoundWorld, evaluateShot } from './rules';

export function useGameEngine(options) {
  const optsRef = useRef(options);
  optsRef.current = options;

  const initialMatch = options.initialMatch || createInitialMatchState('p1');
  const worldRef = useRef(createRoundWorld(initialMatch.round));
  const [match, setMatch] = useState(initialMatch);
  const matchRef = useRef(initialMatch);
  const [phase, setPhase] = useState(initialMatch.winner ? 'over' : 'ready');
  const phaseRef = useRef(phase);
  const [banner, setBanner] = useState(null);
  const [frame, setFrame] = useState(0);

  const shooterRef = useRef(null);
  const pendingRemoteRef = useRef(null);
  const timersRef = useRef([]);
  const mountedRef = useRef(true);

  const go = useCallback((p) => {
    phaseRef.current = p;
    setPhase(p);
  }, []);

  const updateMatch = useCallback((m) => {
    matchRef.current = m;
    setMatch(m);
  }, []);

  const later = useCallback((fn, ms) => {
    const t = setTimeout(() => {
      timersRef.current = timersRef.current.filter((x) => x !== t);
      if (mountedRef.current) fn();
    }, ms);
    timersRef.current.push(t);
  }, []);

  useEffect(
    () => () => {
      mountedRef.current = false;
      timersRef.current.forEach(clearTimeout);
    },
    []
  );

  const redraw = useCallback(() => setFrame((f) => (f + 1) % 1_000_000), []);

  /** Shared by local and remote results: show banner, then continue. */
  const finishShot = useCallback(
    (outcome, nextMatch) => {
      updateMatch(nextMatch);
      if (outcome.type === 'continue') {
        go('ready');
        return;
      }
      setBanner({ ...outcome, key: Date.now() });
      go('banner');
      later(() => {
        setBanner(null);
        if (nextMatch.winner) {
          go('over');
          optsRef.current.onMatchOver?.(nextMatch);
          return;
        }
        worldRef.current = createRoundWorld(nextMatch.round);
        redraw();
        go('ready');
      }, MATCH.bannerMs);
    },
    [go, later, redraw, updateMatch]
  );

  const applyRemoteResult = useCallback(
    (result) => {
      pendingRemoteRef.current = null;
      worldRef.current = worldFromSnapshot(result.snapshot);
      redraw();
      finishShot(result.outcome || { type: 'continue' }, result.match);
    },
    [finishShot, redraw]
  );

  const handleSettled = useCallback(() => {
    const world = worldRef.current;
    freeze(world);
    const shooter = shooterRef.current;
    const authoritative = optsRef.current.isAuthoritative ? optsRef.current.isAuthoritative(shooter) : true;

    if (!authoritative) {
      if (pendingRemoteRef.current) applyRemoteResult(pendingRemoteRef.current);
      else go('syncing');
      return;
    }

    const outcome = evaluateShot(world, shooter);
    const { state: nextMatch } = applyOutcome(matchRef.current, outcome, shooter);
    optsRef.current.onShotResolved?.({ snapshot: snapshot(world), outcome, match: nextMatch, shooter });
    finishShot(outcome, nextMatch);
  }, [applyRemoteResult, finishShot, go]);

  // ---- Physics loop: runs only while pens are moving ----------------------
  useEffect(() => {
    if (phase !== 'moving') return undefined;
    let raf;
    let last = null;
    const tick = (ts) => {
      const dt = last == null ? 1 / 60 : (ts - last) / 1000;
      last = ts;
      const world = worldRef.current;
      advance(world, dt);
      if (world.events.length) {
        const events = world.events;
        world.events = [];
        events.forEach((e) => optsRef.current.onEvent?.(e));
      }
      redraw();
      if (isSettled(world)) {
        handleSettled();
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [phase, handleSettled, redraw]);

  // ---- Public API ----------------------------------------------------------

  /** A local player (or the AI) releases a flick. */
  const fire = useCallback(
    (shot) => {
      if (phaseRef.current !== 'ready') return false;
      const start = snapshot(worldRef.current);
      shooterRef.current = shot.penId;
      applyShot(worldRef.current, shot);
      optsRef.current.onShotFired?.(shot, start);
      go('moving');
      return true;
    },
    [go]
  );

  /** Replay an opponent's shot received over the network. */
  const replayShot = useCallback(
    (start, shot) => {
      pendingRemoteRef.current = null;
      worldRef.current = worldFromSnapshot(start);
      shooterRef.current = shot.penId;
      applyShot(worldRef.current, shot);
      go('moving');
    },
    [go]
  );

  /** Authoritative result from the other device. Waits for our replay to finish. */
  const receiveResult = useCallback(
    (result) => {
      if (phaseRef.current === 'moving') pendingRemoteRef.current = result;
      else applyRemoteResult(result);
    },
    [applyRemoteResult]
  );

  /** Force a state (e.g. reconnecting to an online match). */
  const hydrate = useCallback(
    (nextMatch, snap) => {
      worldRef.current = snap ? worldFromSnapshot(snap) : createRoundWorld(nextMatch.round);
      updateMatch(nextMatch);
      redraw();
      go(nextMatch.winner ? 'over' : 'ready');
    },
    [go, redraw, updateMatch]
  );

  return { worldRef, frame, phase, match, banner, fire, replayShot, receiveResult, hydrate };
}

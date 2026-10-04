/**
 * Online multiplayer over Cloud Firestore.
 *
 * Matchmaking: a player looks for an open "waiting" match created in the last
 * minute and joins it inside a transaction (so two people can't grab the same
 * one). If none exists, they create one and wait.
 *
 * Sync model (turn-based, shooter-authoritative):
 *  1. The shooter writes `lastShot` = the exact starting positions + impulse.
 *  2. The opponent replays that shot locally with the same deterministic
 *     physics, so both screens show the same animation.
 *  3. When the shooter's simulation settles, the shooter writes the
 *     authoritative result (`state`): final positions, scores and whose turn
 *     it is. The opponent snaps to it, so tiny floating-point differences
 *     between devices can never drift.
 *
 * Match document — matches/{matchId}:
 *  status: 'waiting' | 'active' | 'finished' | 'abandoned'
 *  hostId, guestId, players[], names{uid: name}
 *  heartbeatAt (ms), createdAt
 *  shotSeq, lastShot { seq, by, penId, px, py, jx, jy, start }
 *  state { seq, snapshot, outcome, match { round, turn, scores, shots, winner } }
 *  winnerId, loserId, endedReason
 *  challenge, reply  (post-game, see chat.js)
 */
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  limit,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  updateDoc,
  where,
} from 'firebase/firestore';

import { getDb } from './firebase';
import { createInitialMatchState } from '../game/rules';

const STALE_MS = 60_000;

const matchesCol = () => collection(getDb(), 'matches');
const matchRef = (id) => doc(getDb(), 'matches', id);

/** Pen id for a uid: the host is always p1 (bottom), the guest p2. */
export function penForUid(match, uid) {
  return match.hostId === uid ? 'p1' : 'p2';
}

export function uidForPen(match, penId) {
  return penId === 'p1' ? match.hostId : match.guestId;
}

/**
 * Join an open match or create a new one.
 * Returns { matchId, isHost }.
 */
export async function findOrCreateMatch(user) {
  const db = getDb();
  const now = Date.now();
  const open = await getDocs(query(matchesCol(), where('status', '==', 'waiting'), limit(15)));

  const candidates = open.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((m) => m.hostId !== user.uid && now - (m.heartbeatAt || 0) < STALE_MS)
    .sort((a, b) => a.heartbeatAt - b.heartbeatAt); // oldest first = fair queue

  for (const c of candidates) {
    try {
      const joined = await runTransaction(db, async (tx) => {
        const snap = await tx.get(matchRef(c.id));
        const m = snap.data();
        if (!snap.exists() || m.status !== 'waiting' || m.hostId === user.uid) return false;
        tx.update(matchRef(c.id), {
          status: 'active',
          guestId: user.uid,
          players: [m.hostId, user.uid],
          [`names.${user.uid}`]: user.displayName,
          startedAt: serverTimestamp(),
        });
        return true;
      });
      if (joined) return { matchId: c.id, isHost: false };
    } catch (e) {
      // Someone else got there first — try the next one.
    }
  }

  const initial = createInitialMatchState('p1');
  const ref = await addDoc(matchesCol(), {
    status: 'waiting',
    hostId: user.uid,
    guestId: null,
    players: [user.uid],
    names: { [user.uid]: user.displayName },
    heartbeatAt: Date.now(),
    createdAt: serverTimestamp(),
    shotSeq: 0,
    lastShot: null,
    state: { seq: 0, snapshot: null, outcome: null, match: initial },
    winnerId: null,
    loserId: null,
    challenge: null,
    reply: null,
  });
  return { matchId: ref.id, isHost: true };
}

/** Keeps a waiting match visible to matchmaking. */
export function heartbeat(matchId) {
  return updateDoc(matchRef(matchId), { heartbeatAt: Date.now() }).catch(() => {});
}

export async function cancelWaiting(matchId) {
  try {
    await runTransaction(getDb(), async (tx) => {
      const snap = await tx.get(matchRef(matchId));
      if (snap.exists() && snap.data().status === 'waiting') tx.delete(matchRef(matchId));
    });
  } catch {
    // Best effort — stale waiting matches are ignored after a minute anyway.
    deleteDoc(matchRef(matchId)).catch(() => {});
  }
}

export function subscribeMatch(matchId, onData, onError) {
  return onSnapshot(
    matchRef(matchId),
    (snap) => onData(snap.exists() ? { id: snap.id, ...snap.data() } : null),
    onError
  );
}

export function sendShot(matchId, shot) {
  return updateDoc(matchRef(matchId), { lastShot: shot, shotSeq: shot.seq });
}

/**
 * Publish the authoritative result of a shot.
 * `result` = { seq, snapshot, outcome, match } where match is the rules state.
 */
export function sendResult(matchId, match, result) {
  const update = { state: result };
  if (result.match.winner) {
    const winnerId = uidForPen(match, result.match.winner);
    update.status = 'finished';
    update.winnerId = winnerId;
    update.loserId = match.players.find((p) => p !== winnerId);
    update.endedReason = 'score';
  }
  return updateDoc(matchRef(matchId), update);
}

/** Leave mid-game: the other player wins by forfeit. */
export async function forfeit(matchId, uid) {
  try {
    await runTransaction(getDb(), async (tx) => {
      const snap = await tx.get(matchRef(matchId));
      if (!snap.exists()) return;
      const m = snap.data();
      if (m.status !== 'active') return;
      tx.update(matchRef(matchId), {
        status: 'abandoned',
        winnerId: m.players.find((p) => p !== uid) || null,
        loserId: uid,
        endedReason: 'forfeit',
      });
    });
  } catch (e) {
    console.warn('Forfeit failed', e);
  }
}

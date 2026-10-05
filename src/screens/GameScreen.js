/**
 * The battle itself. One screen serves all three modes:
 *   mode 'ai'     — you (p1, bottom) vs the AI (p2, top)
 *   mode 'local'  — Pass & Play on one phone
 *   mode 'online' — Firestore-synced match (see services/onlineMatch.js)
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Animated, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { SafeAreaView } from 'react-native-safe-area-context';

import DeskBoard from '../components/DeskBoard';
import ScoreBoard from '../components/ScoreBoard';
import { Button } from '../components/ui';
import { AI_DIFFICULTY, FLICK } from '../config/gameConfig';
import { colors, PLAYER_COLORS, spacing } from '../config/theme';
import { useAuth } from '../context/AuthContext';
import { chooseAIShot } from '../game/aiPlayer';
import { getPen, hitTestPen } from '../game/physics';
import { aimPreview, buildShot } from '../game/rules';
import { useGameEngine } from '../game/useGameEngine';
import { forfeit, penForUid, sendResult, sendShot, subscribeMatch } from '../services/onlineMatch';
import { recordResult } from '../services/stats';

export default function GameScreen({ navigation, route }) {
  const { mode, difficulty = 'normal', matchId } = route.params || {};
  const { user } = useAuth();

  // ---- Online match document ---------------------------------------------
  const [matchDoc, setMatchDoc] = useState(null);
  const matchDocRef = useRef(null);
  const myPen = mode === 'online' ? (matchDoc ? penForUid(matchDoc, user.uid) : null) : 'p1';

  const players = useMemo(() => {
    if (mode === 'ai') {
      return {
        p1: { name: user.displayName, uid: user.uid },
        p2: { name: `Desk Bot (${AI_DIFFICULTY[difficulty]?.label || 'Normal'})`, uid: 'bot', bot: true },
      };
    }
    if (mode === 'local') {
      return { p1: { name: 'Player 1 (Blue)', uid: 'local-p1' }, p2: { name: 'Player 2 (Red)', uid: 'local-p2' } };
    }
    return onlinePlayers(matchDoc);
  }, [mode, difficulty, user, matchDoc]);

  // ---- Navigation guards ---------------------------------------------------
  const leavingRef = useRef(false);
  const finishedRef = useRef(false);

  const goToChallenge = useCallback(
    (winnerPen, scores, reason = 'score') => {
      if (finishedRef.current) return;
      finishedRef.current = true;
      leavingRef.current = true;
      // Online: read from the latest snapshot so we never use stale names.
      const doc = matchDocRef.current;
      const me = mode === 'online' ? penForUid(doc, user.uid) : myPen;
      const won = mode === 'local' ? null : winnerPen === me;
      if (won !== null) recordResult(user.uid, won);
      navigation.replace('Challenge', {
        mode,
        matchId,
        difficulty,
        players: mode === 'online' ? onlinePlayers(doc) : players,
        winnerPen,
        myPen: me,
        scores,
        reason,
      });
    },
    [mode, matchId, difficulty, players, myPen, user.uid, navigation]
  );
  const goToChallengeRef = useRef(goToChallenge);
  goToChallengeRef.current = goToChallenge;

  // ---- Haptics --------------------------------------------------------------
  const lastHapticRef = useRef(0);
  const onEvent = useCallback((e) => {
    const now = Date.now();
    if (e.type === 'fall') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
    } else if (e.type === 'hit' && e.strength > 250 && now - lastHapticRef.current > 90) {
      lastHapticRef.current = now;
      Haptics.impactAsync(e.strength > 900 ? Haptics.ImpactFeedbackStyle.Heavy : Haptics.ImpactFeedbackStyle.Light).catch(
        () => {}
      );
    }
  }, []);

  // ---- Online sync bookkeeping ---------------------------------------------
  const appliedShotSeqRef = useRef(0);
  const appliedStateSeqRef = useRef(0);
  const hydratedRef = useRef(false);

  const engine = useGameEngine({
    isAuthoritative: (shooter) => (mode === 'online' ? shooter === myPen : true),
    onShotFired: (shot, start) => {
      if (mode !== 'online') return;
      const seq = Math.max(appliedShotSeqRef.current, matchDocRef.current?.shotSeq || 0) + 1;
      appliedShotSeqRef.current = seq;
      sendShot(matchId, { ...shot, seq, by: user.uid, start }).catch((e) => console.warn('sendShot failed', e));
    },
    onShotResolved: (result) => {
      if (mode !== 'online') return;
      const seq = appliedShotSeqRef.current;
      appliedStateSeqRef.current = seq;
      sendResult(matchId, matchDocRef.current, {
        seq,
        by: user.uid,
        snapshot: result.snapshot,
        outcome: result.outcome,
        match: result.match,
      }).catch((e) => console.warn('sendResult failed', e));
    },
    onMatchOver: (m) => goToChallengeRef.current(m.winner, m.scores),
    onEvent,
  });

  useEffect(() => {
    if (mode !== 'online') return undefined;
    return subscribeMatch(
      matchId,
      (doc) => {
        if (!doc) return;
        matchDocRef.current = doc;
        setMatchDoc(doc);
        const me = penForUid(doc, user.uid);

        if (!hydratedRef.current) {
          // First snapshot: pick up wherever the match currently is.
          hydratedRef.current = true;
          appliedShotSeqRef.current = doc.shotSeq || 0;
          appliedStateSeqRef.current = doc.state?.seq || 0;
          if (doc.state?.seq) engine.hydrate(doc.state.match, doc.state.snapshot);
        } else {
          const shot = doc.lastShot;
          if (shot && shot.seq > appliedShotSeqRef.current && shot.by !== user.uid) {
            appliedShotSeqRef.current = shot.seq;
            engine.replayShot(shot.start, shot);
          }
          const st = doc.state;
          if (st && st.seq > appliedStateSeqRef.current && st.by !== user.uid) {
            appliedStateSeqRef.current = st.seq;
            engine.receiveResult(st);
          }
        }

        if (doc.status === 'abandoned' && doc.loserId !== user.uid) {
          goToChallengeRef.current(me, doc.state?.match?.scores || { p1: 0, p2: 0 }, 'forfeit');
        }
      },
      (e) => Alert.alert('Connection lost', e.message)
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, matchId, user.uid]);

  // Leaving mid-game asks for confirmation (and forfeits online).
  useEffect(() => {
    const unsub = navigation.addListener('beforeRemove', (e) => {
      if (leavingRef.current) return;
      e.preventDefault();
      Alert.alert(
        'Leave the match?',
        mode === 'online' ? 'Your opponent will win by forfeit.' : 'Your progress in this match will be lost.',
        [
          { text: 'Stay', style: 'cancel' },
          {
            text: 'Leave',
            style: 'destructive',
            onPress: () => {
              leavingRef.current = true;
              if (mode === 'online') {
                forfeit(matchId, user.uid);
                recordResult(user.uid, false);
              }
              navigation.dispatch(e.data.action);
            },
          },
        ]
      );
    });
    return unsub;
  }, [navigation, mode, matchId, user.uid]);

  // ---- Aiming --------------------------------------------------------------
  const [aim, setAim] = useState(null);
  const { phase, match, banner, worldRef } = engine;

  const isLocalTurn =
    phase === 'ready' &&
    !match.winner &&
    (mode === 'local' || (mode === 'ai' && match.turn === 'p1') || (mode === 'online' && match.turn === myPen));

  const onGrab = (pt) => {
    if (!isLocalTurn) return false;
    const pen = getPen(worldRef.current, match.turn);
    if (!hitTestPen(pen, pt.x, pt.y, FLICK.grabSlop)) return false;
    Haptics.selectionAsync().catch(() => {});
    setAim({ penId: pen.id, grab: pt, drag: pt, preview: aimPreview(pen, pt, pt) });
    return true;
  };

  const onDrag = (pt) => {
    setAim((a) => {
      if (!a) return a;
      const pen = getPen(worldRef.current, a.penId);
      return { ...a, drag: pt, preview: aimPreview(pen, a.grab, pt) };
    });
  };

  const onRelease = (pt) => {
    const a = aim;
    setAim(null);
    if (!a) return;
    const pen = getPen(worldRef.current, a.penId);
    const shot = buildShot(pen, a.grab, pt);
    if (!shot) return; // too weak = cancelled
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    engine.fire(shot);
  };

  // ---- AI turn ---------------------------------------------------------------
  useEffect(() => {
    if (mode !== 'ai' || phase !== 'ready' || match.turn !== 'p2' || match.winner) return undefined;
    const cfg = AI_DIFFICULTY[difficulty] || AI_DIFFICULTY.normal;
    let anim = null;
    const think = setTimeout(() => {
      const shot = chooseAIShot(worldRef.current, 'p2', difficulty);
      const pen = getPen(worldRef.current, 'p2');
      const grab = { x: shot.px, y: shot.py };
      const mag = Math.hypot(shot.jx, shot.jy) || 1;
      const pull = shot.power * FLICK.maxDrag;
      const target = { x: grab.x - (shot.jx / mag) * pull, y: grab.y - (shot.jy / mag) * pull };
      // Show the bot "pulling back" before it releases.
      let i = 0;
      const STEPS = 14;
      anim = setInterval(() => {
        i += 1;
        const t = i / STEPS;
        const drag = { x: grab.x + (target.x - grab.x) * t, y: grab.y + (target.y - grab.y) * t };
        setAim({ penId: 'p2', grab, drag, preview: aimPreview(pen, grab, drag) });
        if (i >= STEPS) {
          clearInterval(anim);
          anim = null;
          setTimeout(() => {
            setAim(null);
            engine.fire(shot);
          }, 120);
        }
      }, 32);
    }, cfg.thinkMs);
    return () => {
      clearTimeout(think);
      if (anim) clearInterval(anim);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, phase, match.turn, match.winner, difficulty]);

  // ---- Render ----------------------------------------------------------------
  if (mode === 'online' && !matchDoc) {
    return (
      <SafeAreaView style={[styles.safe, styles.center]}>
        <ActivityIndicator color={colors.accent} size="large" />
        <Text style={styles.hint}>Connecting to match…</Text>
      </SafeAreaView>
    );
  }

  const turnName = players[match.turn]?.name;
  let hint;
  if (phase === 'moving') hint = 'Flick!';
  else if (phase === 'syncing') hint = 'Syncing…';
  else if (phase === 'banner' || phase === 'over') hint = ' ';
  else if (mode === 'ai' && match.turn === 'p2') hint = 'Desk Bot is lining up a shot…';
  else if (mode === 'online' && match.turn !== myPen) hint = `Waiting for ${turnName}…`;
  else if (mode === 'local') hint = `${turnName}: drag back from your pen and release`;
  else hint = aim ? `Power ${Math.round((aim.preview?.power || 0) * 100)}%` : 'Touch your pen, pull back, release!';

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      {/* Web-la desk perusa stretch aagamal irukka gameWrapper kulla wrap seiyappattullathu */}
      <View style={styles.gameWrapper}>
        <ScoreBoard players={players} scores={match.scores} round={match.round} turn={match.turn} leftPen={myPen || 'p1'} />

        <DeskBoard
          worldRef={worldRef}
          flipped={mode === 'online' && myPen === 'p2'}
          aim={aim}
          activePenId={phase === 'ready' ? match.turn : null}
          onGrab={onGrab}
          onDrag={onDrag}
          onRelease={onRelease}
          onCancel={() => setAim(null)}
        />

        <View style={styles.footer}>
          <Text style={styles.hint}>{hint}</Text>
          <PowerBar power={aim?.preview?.power || 0} color={PLAYER_COLORS[aim?.penId || match.turn]} />
          <Button title="Quit" variant="ghost" onPress={() => navigation.goBack()} style={styles.quit} />
        </View>

        {banner && <Banner banner={banner} players={players} winner={match.winner} />}
      </View>
    </SafeAreaView>
  );
}

function onlinePlayers(m) {
  return {
    p1: { name: m?.names?.[m?.hostId] || 'Host', uid: m?.hostId },
    p2: { name: m?.names?.[m?.guestId] || 'Guest', uid: m?.guestId },
  };
}

function PowerBar({ power, color }) {
  return (
    <View style={styles.powerTrack}>
      <View style={[styles.powerFill, { width: `${Math.round(power * 100)}%`, backgroundColor: color }]} />
    </View>
  );
}

function Banner({ banner, players, winner }) {
  const scale = useRef(new Animated.Value(0.6)).current;
  useEffect(() => {
    Animated.spring(scale, { toValue: 1, friction: 5, useNativeDriver: true }).start();
  }, [scale, banner.key]);

  let title;
  let sub;
  let color = colors.accent;
  if (banner.type === 'replay') {
    title = 'DOUBLE DROP!';
    sub = 'Both pens fell — replay the round';
  } else {
    color = PLAYER_COLORS[banner.scorer];
    title = winner ? '🏆 MATCH!' : 'POINT!';
    sub = winner ? `${players[banner.scorer].name} wins the match` : `${players[banner.scorer].name} scores`;
  }
  return (
    <View pointerEvents="none" style={styles.bannerWrap}>
      <Animated.View style={[styles.banner, { borderColor: color, transform: [{ scale }] }]}>
        <Text style={[styles.bannerTitle, { color }]}>{title}</Text>
        <Text style={styles.bannerSub}>{sub}</Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bgDeep, alignItems: 'center', justifyContent: 'center' },
  center: { alignItems: 'center', justifyContent: 'center' },
  // Web-kku responsive-ah game screen-ai limit seiyura wrapper
  gameWrapper: {
    width: '100%',
    maxWidth: 450,
    height: '100%',
    maxHeight: 850,
    backgroundColor: colors.bgDeep,
    overflow: 'hidden',
    alignSelf: 'center',
    position: 'relative',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'space-between',
  },
  footer: { paddingHorizontal: spacing(5), paddingBottom: spacing(2), alignItems: 'center' },
  hint: { color: colors.textOnDark, fontWeight: '700', fontSize: 15, marginTop: spacing(2), textAlign: 'center' },
  powerTrack: {
    width: '70%',
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(246,235,221,0.12)',
    marginTop: spacing(2),
    overflow: 'hidden',
  },
  powerFill: { height: '100%', borderRadius: 4 },
  quit: { marginTop: spacing(2), minHeight: 40, alignSelf: 'stretch' },
  bannerWrap: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', zIndex: 999 },
  banner: {
    backgroundColor: 'rgba(30,20,14,0.92)',
    borderWidth: 3,
    borderRadius: 20,
    paddingVertical: spacing(5),
    paddingHorizontal: spacing(8),
    alignItems: 'center',
  },
  bannerTitle: { fontSize: 36, fontWeight: '900', letterSpacing: 2 },
  bannerSub: { color: colors.textOnDark, marginTop: spacing(1), fontSize: 16, fontWeight: '600' },
});
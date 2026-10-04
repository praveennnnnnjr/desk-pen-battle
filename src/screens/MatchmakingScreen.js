import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '../components/ui';
import { colors, spacing } from '../config/theme';
import { useAuth } from '../context/AuthContext';
import { cancelWaiting, findOrCreateMatch, heartbeat, subscribeMatch } from '../services/onlineMatch';

export default function MatchmakingScreen({ navigation }) {
  const { user } = useAuth();
  const [status, setStatus] = useState('Looking for an opponent…');
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState(null);
  const [attempt, setAttempt] = useState(0);
  const waitingIdRef = useRef(null);
  const doneRef = useRef(false);

  useEffect(() => {
    const t = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [attempt]);

  useEffect(() => {
    let unsub = null;
    let beat = null;
    let cancelled = false;
    doneRef.current = false;
    setError(null);
    setSeconds(0);

    const goToGame = (matchId) => {
      if (doneRef.current) return;
      doneRef.current = true;
      waitingIdRef.current = null;
      navigation.replace('Game', { mode: 'online', matchId });
    };

    (async () => {
      try {
        const { matchId, isHost } = await findOrCreateMatch(user);
        if (cancelled) {
          if (isHost) cancelWaiting(matchId);
          return;
        }
        if (!isHost) {
          goToGame(matchId);
          return;
        }
        waitingIdRef.current = matchId;
        setStatus('Waiting for someone to join…');
        beat = setInterval(() => heartbeat(matchId), 20_000);
        unsub = subscribeMatch(
          matchId,
          (m) => {
            if (m && m.status === 'active') goToGame(matchId);
          },
          (e) => setError(e.message)
        );
      } catch (e) {
        if (!cancelled) setError(e.message || 'Could not reach the server.');
      }
    })();

    return () => {
      cancelled = true;
      unsub?.();
      if (beat) clearInterval(beat);
      if (waitingIdRef.current && !doneRef.current) cancelWaiting(waitingIdRef.current);
      waitingIdRef.current = null;
    };
  }, [attempt, navigation, user]);

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.center}>
        {error ? (
          <>
            <Text style={styles.title}>Connection problem</Text>
            <Text style={styles.text}>{error}</Text>
            <Button title="Try again" onPress={() => setAttempt((a) => a + 1)} style={{ marginTop: spacing(6) }} />
          </>
        ) : (
          <>
            <ActivityIndicator size="large" color={colors.accent} />
            <Text style={styles.title}>{status}</Text>
            <Text style={styles.text}>
              {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, '0')}
            </Text>
            <Text style={styles.tip}>Tip: open the app on a second phone and tap "Find online match" to test.</Text>
          </>
        )}
      </View>
      <Button title="Cancel" variant="ghost" onPress={() => navigation.goBack()} style={styles.cancel} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing(8) },
  title: { color: colors.textOnDark, fontSize: 22, fontWeight: '900', marginTop: spacing(6), textAlign: 'center' },
  text: { color: colors.textOnDarkMuted, marginTop: spacing(2), fontSize: 16, textAlign: 'center' },
  tip: { color: colors.textOnDarkMuted, marginTop: spacing(10), fontSize: 13, textAlign: 'center', lineHeight: 19 },
  cancel: { margin: spacing(5) },
});

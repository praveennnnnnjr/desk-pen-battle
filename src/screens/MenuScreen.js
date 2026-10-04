import React, { useCallback, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, Card } from '../components/ui';
import { isFirebaseConfigured } from '../config/env';
import { AI_DIFFICULTY } from '../config/gameConfig';
import { colors, radius, spacing } from '../config/theme';
import { useAuth } from '../context/AuthContext';
import { getStats } from '../services/stats';

export default function MenuScreen({ navigation }) {
  const { user, signOut } = useAuth();
  const [stats, setStats] = useState({ wins: 0, losses: 0 });
  const [difficulty, setDifficulty] = useState('normal');
  const [showRules, setShowRules] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      getStats(user.uid).then((s) => alive && setStats(s));
      return () => {
        alive = false;
      };
    }, [user.uid])
  );

  const confirmSignOut = () =>
    Alert.alert('Log out?', 'You can log back in any time.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Log out', style: 'destructive', onPress: () => signOut() },
    ]);

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={styles.hello}>Hey, {user.displayName} ✏️</Text>
            <Text style={styles.record}>
              {stats.wins} wins · {stats.losses} losses
            </Text>
          </View>
          <Pressable onPress={confirmSignOut} hitSlop={12} accessibilityRole="button">
            <Text style={styles.logout}>Log out</Text>
          </Pressable>
        </View>

        <Text style={styles.title}>DESK BATTLE</Text>
        <Text style={styles.subtitle}>Pen Clash</Text>

        <Card style={styles.card}>
          <Text style={styles.cardTitle}>🤖 Single Player</Text>
          <Text style={styles.cardText}>Flick it out against the desk bot.</Text>
          <View style={styles.segment}>
            {Object.entries(AI_DIFFICULTY).map(([key, cfg]) => (
              <Pressable
                key={key}
                onPress={() => setDifficulty(key)}
                style={[styles.segBtn, difficulty === key && styles.segActive]}
                accessibilityRole="radio"
                accessibilityState={{ selected: difficulty === key }}
              >
                <Text style={[styles.segText, difficulty === key && styles.segTextActive]}>{cfg.label}</Text>
              </Pressable>
            ))}
          </View>
          <Button title="Play vs AI" variant="blue" onPress={() => navigation.navigate('Game', { mode: 'ai', difficulty })} />
        </Card>

        <Card style={styles.card}>
          <Text style={styles.cardTitle}>⚔️ Multiplayer</Text>
          <Text style={styles.cardText}>Get matched with another player online, or pass one phone between friends.</Text>
          <Button
            title="Find online match"
            variant="red"
            disabled={!isFirebaseConfigured}
            onPress={() => navigation.navigate('Matchmaking')}
          />
          {!isFirebaseConfigured && <Text style={styles.note}>Online play needs Firebase — see README.</Text>}
          <Button
            title="Pass & Play (same phone)"
            variant="light"
            style={{ marginTop: spacing(3) }}
            onPress={() => navigation.navigate('Game', { mode: 'local' })}
          />
        </Card>

        <Pressable onPress={() => setShowRules((s) => !s)} style={styles.rulesToggle}>
          <Text style={styles.rulesToggleText}>{showRules ? '▾' : '▸'} How to play</Text>
        </Pressable>
        {showRules && (
          <View style={styles.rules}>
            <Text style={styles.rule}>• Touch your pen, pull back like a slingshot, and let go to flick it.</Text>
            <Text style={styles.rule}>• Hit near the middle to push, near the ends to spin.</Text>
            <Text style={styles.rule}>• Knock the other pen off the desk to score. Fall off yourself and they score.</Text>
            <Text style={styles.rule}>• First to 3 points wins — and gets to challenge the loser with a question!</Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: spacing(5), paddingBottom: spacing(10) },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing(6) },
  hello: { color: colors.textOnDark, fontSize: 18, fontWeight: '800' },
  record: { color: colors.textOnDarkMuted, marginTop: 2 },
  logout: { color: colors.accent, fontWeight: '800' },
  title: { color: colors.textOnDark, fontSize: 38, fontWeight: '900', letterSpacing: 2, textAlign: 'center' },
  subtitle: { color: colors.accent, fontSize: 18, fontWeight: '700', textAlign: 'center', marginBottom: spacing(6) },
  card: { marginBottom: spacing(4) },
  cardTitle: { fontSize: 20, fontWeight: '900', color: colors.ink },
  cardText: { color: colors.inkMuted, marginTop: spacing(1), marginBottom: spacing(4), lineHeight: 20 },
  segment: {
    flexDirection: 'row',
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.pill,
    padding: 4,
    marginBottom: spacing(4),
  },
  segBtn: { flex: 1, alignItems: 'center', paddingVertical: spacing(2), borderRadius: radius.pill },
  segActive: { backgroundColor: colors.ink },
  segText: { fontWeight: '800', color: colors.inkMuted },
  segTextActive: { color: colors.surface },
  note: { color: colors.inkMuted, fontSize: 12, marginTop: spacing(1.5), textAlign: 'center' },
  rulesToggle: { paddingVertical: spacing(3), alignItems: 'center' },
  rulesToggleText: { color: colors.textOnDark, fontWeight: '800' },
  rules: { backgroundColor: 'rgba(246,235,221,0.06)', borderRadius: radius.md, padding: spacing(4) },
  rule: { color: colors.textOnDarkMuted, marginBottom: spacing(2), lineHeight: 20 },
});

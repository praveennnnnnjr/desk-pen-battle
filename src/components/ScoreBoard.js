import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { MATCH } from '../config/gameConfig';
import { colors, PLAYER_COLORS, radius, spacing } from '../config/theme';

/**
 * players: { p1: { name }, p2: { name } } — `top` / `bottom` decide which
 * pen is shown on which side (so the local player is always on the left).
 */
export default function ScoreBoard({ players, scores, round, turn, leftPen = 'p1' }) {
  const rightPen = leftPen === 'p1' ? 'p2' : 'p1';
  return (
    <View style={styles.wrap}>
      <PlayerChip pen={leftPen} name={players[leftPen].name} score={scores[leftPen]} active={turn === leftPen} />
      <View style={styles.middle}>
        <Text style={styles.round}>ROUND {round}</Text>
        <Text style={styles.target}>First to {MATCH.targetScore}</Text>
      </View>
      <PlayerChip
        pen={rightPen}
        name={players[rightPen].name}
        score={scores[rightPen]}
        active={turn === rightPen}
        alignRight
      />
    </View>
  );
}

function PlayerChip({ pen, name, score, active, alignRight }) {
  return (
    <View style={[styles.chip, alignRight && { alignItems: 'flex-end' }, active && { borderColor: PLAYER_COLORS[pen] }]}>
      <View style={[styles.row, alignRight && { flexDirection: 'row-reverse' }]}>
        <View style={[styles.dot, { backgroundColor: PLAYER_COLORS[pen] }]} />
        <Text numberOfLines={1} style={styles.name}>
          {name}
        </Text>
      </View>
      <View style={[styles.row, alignRight && { flexDirection: 'row-reverse' }]}>
        {Array.from({ length: MATCH.targetScore }).map((_, i) => (
          <View
            key={i}
            style={[styles.pip, i < score && { backgroundColor: PLAYER_COLORS[pen], borderColor: PLAYER_COLORS[pen] }]}
          />
        ))}
        <Text style={styles.score}>{score}</Text>
      </View>
      {active && <Text style={[styles.turn, { color: PLAYER_COLORS[pen] }]}>● TURN</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing(3),
    paddingVertical: spacing(2),
    gap: spacing(2),
  },
  chip: {
    flex: 1,
    backgroundColor: 'rgba(246,235,221,0.08)',
    borderRadius: radius.md,
    borderWidth: 2,
    borderColor: 'transparent',
    padding: spacing(2.5),
    minHeight: 78,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing(1.5) },
  dot: { width: 10, height: 10, borderRadius: 5 },
  name: { color: colors.textOnDark, fontWeight: '800', fontSize: 15, flexShrink: 1 },
  pip: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 2,
    borderColor: 'rgba(246,235,221,0.35)',
    marginTop: spacing(1.5),
  },
  score: { color: colors.textOnDark, fontWeight: '900', fontSize: 18, marginTop: spacing(1), marginHorizontal: 4 },
  turn: { fontSize: 11, fontWeight: '900', marginTop: 2, letterSpacing: 1 },
  middle: { alignItems: 'center', width: 76 },
  round: { color: colors.accent, fontWeight: '900', fontSize: 14, letterSpacing: 1 },
  target: { color: colors.textOnDarkMuted, fontSize: 11, marginTop: 2 },
});

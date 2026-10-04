/**
 * Post-game challenge + chat.
 *
 *  1. The winner sends ONE challenge question — AI-generated (editable) or typed.
 *  2. The loser MUST type a reply before they can return to the menu.
 *  3. After that, both can keep chatting or head back to the menu.
 *
 * Modes:
 *  ai     — the bot asks you (if it won) or answers you (if you won)
 *  local  — Pass & Play: the phone is handed from winner to loser
 *  online — real-time via Firestore (matches/{id}/messages)
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, Card } from '../components/ui';
import { CHAT } from '../config/gameConfig';
import { colors, PLAYER_COLORS, radius, spacing } from '../config/theme';
import { botReaction, generateBotReply, generateChallengeQuestion } from '../services/aiQuestions';
import { createFirestoreChannel, createLocalChannel } from '../services/chat';
import { subscribeMatch } from '../services/onlineMatch';

export default function ChallengeScreen({ navigation, route }) {
  const { mode, matchId, players, winnerPen, myPen, scores, reason } = route.params;
  const loserPen = winnerPen === 'p1' ? 'p2' : 'p1';
  const winner = players[winnerPen];
  const loser = players[loserPen];

  const channel = useMemo(
    () => (mode === 'online' ? createFirestoreChannel(matchId) : createLocalChannel()),
    [mode, matchId]
  );
  const [messages, setMessages] = useState([]);
  useEffect(() => channel.subscribe(setMessages), [channel]);

  const challengeMsg = messages.find((m) => m.kind === 'challenge');
  const replyMsg = messages.find((m) => m.kind === 'reply');

  // Online: notice if the opponent disconnects / leaves the chat.
  const [opponentGone, setOpponentGone] = useState(reason === 'forfeit');
  useEffect(() => {
    if (mode !== 'online') return undefined;
    return subscribeMatch(matchId, (m) => {
      if (m?.status === 'abandoned') setOpponentGone(true);
    });
  }, [mode, matchId]);

  // ---- Who is acting on this device? ----------------------------------------
  const [handedOver, setHandedOver] = useState(false);
  let actingPen; // pen of the person holding the phone right now
  if (mode === 'online') actingPen = myPen;
  else if (mode === 'ai') actingPen = 'p1';
  else actingPen = challengeMsg ? loserPen : winnerPen; // Pass & Play
  const actingRole = actingPen === winnerPen ? 'winner' : 'loser';
  const acting = players[actingPen];

  const penOfSender = (senderId) =>
    senderId === players.p1.uid ? 'p1' : senderId === players.p2.uid ? 'p2' : null;

  // ---- Bot automation (vs AI) ------------------------------------------------
  const [botTyping, setBotTyping] = useState(false);
  const botDidRef = useRef({ challenge: false, reply: false, reaction: false });
  const mountedRef = useRef(true);
  useEffect(
    () => () => {
      mountedRef.current = false;
    },
    []
  );

  const botSend = async (kind, text, source) => {
    if (!mountedRef.current) return;
    await channel.send({ senderId: players.p2.uid, senderName: players.p2.name, text, kind, source });
  };

  useEffect(() => {
    if (mode !== 'ai') return;
    const botWon = winnerPen === 'p2';
    const did = botDidRef.current;

    if (botWon && !challengeMsg && !did.challenge) {
      did.challenge = true;
      setBotTyping(true);
      generateChallengeQuestion({
        winnerName: winner.name,
        loserName: loser.name,
        winnerScore: scores[winnerPen],
        loserScore: scores[loserPen],
      })
        .then((q) => botSend('challenge', q.text, q.source))
        .finally(() => mountedRef.current && setBotTyping(false));
    }

    if (!botWon && challengeMsg && !replyMsg && !did.reply) {
      did.reply = true;
      setBotTyping(true);
      generateBotReply({ question: challengeMsg.text, botName: players.p2.name })
        .then((r) => new Promise((res) => setTimeout(() => res(r), 700)))
        .then((r) => botSend('reply', r.text, r.source))
        .finally(() => mountedRef.current && setBotTyping(false));
    }

    if (botWon && replyMsg && !did.reaction) {
      did.reaction = true;
      setBotTyping(true);
      setTimeout(() => {
        botSend('chat', botReaction(), 'bank').finally(() => mountedRef.current && setBotTyping(false));
      }, 900);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, challengeMsg, replyMsg]);

  // ---- Composer ---------------------------------------------------------------
  const [draft, setDraft] = useState('');
  const [aiDraft, setAiDraft] = useState(null); // last generated question
  const [generating, setGenerating] = useState(false);
  const [sending, setSending] = useState(false);

  const generate = async () => {
    setGenerating(true);
    try {
      const q = await generateChallengeQuestion({
        winnerName: winner.name,
        loserName: loser.name,
        winnerScore: scores[winnerPen],
        loserScore: scores[loserPen],
      });
      setDraft(q.text);
      setAiDraft(q);
    } finally {
      setGenerating(false);
    }
  };

  const send = async (kind) => {
    const text = draft.trim();
    if (kind === 'reply' && text.length < CHAT.minReplyLength) {
      Alert.alert('Reply needed', 'Type an answer to the challenge before sending.');
      return;
    }
    if (!text) return;
    setSending(true);
    try {
      const source = kind === 'challenge' && aiDraft && aiDraft.text === text ? aiDraft.source : 'custom';
      await channel.send({ senderId: acting.uid, senderName: acting.name, text, kind, source });
      setDraft('');
      setAiDraft(null);
    } catch (e) {
      Alert.alert('Not sent', e.message || 'Please try again.');
    } finally {
      setSending(false);
    }
  };

  // ---- Leaving -----------------------------------------------------------------
  let canLeave;
  let leaveNote = null;
  if (mode === 'local') {
    canLeave = !!replyMsg;
    if (!canLeave) leaveNote = `${loser.name} must answer the challenge first.`;
  } else if (actingRole === 'loser') {
    canLeave = !!replyMsg;
    if (!canLeave) leaveNote = 'You lost — reply to the challenge to return to the menu.';
  } else {
    canLeave = !!challengeMsg || opponentGone;
    if (!canLeave) leaveNote = 'Send your challenge first.';
  }

  const leavingRef = useRef(false);
  const canLeaveRef = useRef(canLeave);
  canLeaveRef.current = canLeave;
  useEffect(
    () =>
      navigation.addListener('beforeRemove', (e) => {
        if (leavingRef.current || canLeaveRef.current) return;
        e.preventDefault();
        Alert.alert('Not yet!', 'The loser has to reply to the challenge before leaving.');
      }),
    [navigation]
  );

  const backToMenu = () => {
    leavingRef.current = true;
    navigation.popToTop();
  };

  // ---- Render ------------------------------------------------------------------
  const scrollRef = useRef(null);
  const iWon = mode === 'local' ? null : myPen === winnerPen || (mode === 'ai' && winnerPen === 'p1');

  let composer = null;
  if (!challengeMsg) {
    if (actingRole === 'winner' && !(mode === 'ai' && winnerPen === 'p2')) {
      composer = (
        <Card style={styles.composer}>
          <Text style={styles.composerTitle}>🎯 Challenge {loser.name}</Text>
          <Text style={styles.composerText}>Ask anything fun — or let AI come up with a question.</Text>
          <Button
            title={generating ? 'Thinking…' : '✨ Generate with AI'}
            variant="light"
            onPress={generate}
            loading={generating}
            style={{ marginBottom: spacing(3) }}
          />
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder="Type your question…"
            placeholderTextColor={colors.inkMuted}
            multiline
            maxLength={CHAT.maxLength}
            style={styles.input}
          />
          <Button
            title="Send challenge"
            variant={winnerPen === 'p1' ? 'blue' : 'red'}
            onPress={() => send('challenge')}
            disabled={!draft.trim()}
            loading={sending}
          />
        </Card>
      );
    } else {
      composer = <Waiting text={`Waiting for ${winner.name} to send a challenge…`} />;
    }
  } else if (!replyMsg) {
    if (mode === 'local' && !handedOver) {
      composer = (
        <Card style={styles.composer}>
          <Text style={styles.composerTitle}>📱 Pass the phone</Text>
          <Text style={styles.composerText}>Hand the phone to {loser.name} so they can answer.</Text>
          <Button title={`I'm ${loser.name} — show me`} variant="light" onPress={() => setHandedOver(true)} />
        </Card>
      );
    } else if (actingRole === 'loser') {
      composer = (
        <Card style={styles.composer}>
          <Text style={styles.composerTitle}>✍️ Your reply</Text>
          <Text style={styles.composerText}>You must answer before returning to the menu.</Text>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder="Type your answer…"
            placeholderTextColor={colors.inkMuted}
            multiline
            autoFocus
            maxLength={CHAT.maxLength}
            style={styles.input}
          />
          <Button
            title="Send reply"
            variant={loserPen === 'p1' ? 'blue' : 'red'}
            onPress={() => send('reply')}
            disabled={draft.trim().length < CHAT.minReplyLength}
            loading={sending}
          />
        </Card>
      );
    } else {
      composer = <Waiting text={opponentGone ? `${loser.name} left the match.` : `Waiting for ${loser.name}'s reply…`} />;
    }
  } else if (mode === 'online' && !opponentGone) {
    // Optional banter once the challenge is complete.
    composer = (
      <View style={styles.chatRow}>
        <TextInput
          value={draft}
          onChangeText={setDraft}
          placeholder="Say GG…"
          placeholderTextColor={colors.textOnDarkMuted}
          maxLength={CHAT.maxLength}
          style={styles.chatInput}
          onSubmitEditing={() => send('chat')}
          returnKeyType="send"
        />
        <Button title="Send" variant="light" onPress={() => send('chat')} disabled={!draft.trim()} style={styles.chatSend} />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.header}>
          <Text style={styles.trophy}>{iWon === false ? '😵' : '🏆'}</Text>
          <Text style={styles.headline}>
            {iWon === null ? `${winner.name} wins!` : iWon ? 'You win!' : `${winner.name} wins`}
          </Text>
          <Text style={styles.score}>
            <Text style={{ color: PLAYER_COLORS[winnerPen] }}>{scores[winnerPen]}</Text>
            {'  –  '}
            <Text style={{ color: PLAYER_COLORS[loserPen] }}>{scores[loserPen]}</Text>
            {reason === 'forfeit' ? '   (forfeit)' : ''}
          </Text>
        </View>

        <ScrollView
          ref={scrollRef}
          style={styles.chat}
          contentContainerStyle={{ padding: spacing(4) }}
          onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
          keyboardShouldPersistTaps="handled"
        >
          {messages.length === 0 && !botTyping && (
            <Text style={styles.empty}>The winner gets to ask the loser one question. The loser must answer!</Text>
          )}
          {messages.map((m) => {
            const pen = penOfSender(m.senderId);
            const mine = mode === 'local' ? pen === 'p1' : pen === actingPen;
            return <Bubble key={m.id} msg={m} pen={pen} mine={mine} />;
          })}
          {botTyping && <Text style={styles.typing}>{players.p2.name} is typing…</Text>}
        </ScrollView>

        <View style={styles.bottom}>
          {composer}
          <Button title="Return to menu" variant="ghost" onPress={backToMenu} disabled={!canLeave} style={{ marginTop: spacing(3) }} />
          {!canLeave && leaveNote ? <Text style={styles.leaveNote}>{leaveNote}</Text> : null}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Bubble({ msg, pen, mine }) {
  const color = PLAYER_COLORS[pen] || colors.accent;
  const label =
    msg.kind === 'challenge'
      ? `🎯 CHALLENGE${msg.source === 'ai' ? ' · ✨ AI' : msg.source === 'bank' ? ' · 🎲 random' : ''}`
      : msg.kind === 'reply'
        ? '✍️ REPLY'
        : null;
  return (
    <View style={[styles.bubbleRow, { justifyContent: mine ? 'flex-end' : 'flex-start' }]}>
      <View style={[styles.bubble, { borderColor: color }, mine ? styles.bubbleMine : styles.bubbleTheirs]}>
        <Text style={[styles.sender, { color }]}>
          {msg.senderName}
          {label ? `  ${label}` : ''}
        </Text>
        <Text style={styles.msgText}>{msg.text}</Text>
      </View>
    </View>
  );
}

function Waiting({ text }) {
  return (
    <View style={styles.waiting}>
      <ActivityIndicator color={colors.accent} />
      <Text style={styles.waitingText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: { alignItems: 'center', paddingTop: spacing(4), paddingBottom: spacing(2) },
  trophy: { fontSize: 44 },
  headline: { color: colors.textOnDark, fontSize: 26, fontWeight: '900', marginTop: spacing(1) },
  score: { color: colors.textOnDarkMuted, fontSize: 20, fontWeight: '900', marginTop: spacing(1) },
  chat: { flex: 1 },
  empty: { color: colors.textOnDarkMuted, textAlign: 'center', marginTop: spacing(6), lineHeight: 20 },
  typing: { color: colors.textOnDarkMuted, fontStyle: 'italic', marginTop: spacing(2) },
  bubbleRow: { flexDirection: 'row', marginBottom: spacing(3) },
  bubble: { maxWidth: '85%', borderRadius: radius.md, padding: spacing(3), borderLeftWidth: 4 },
  bubbleMine: { backgroundColor: colors.surface },
  bubbleTheirs: { backgroundColor: colors.surfaceMuted },
  sender: { fontWeight: '900', fontSize: 12, marginBottom: 4, letterSpacing: 0.4 },
  msgText: { color: colors.ink, fontSize: 16, lineHeight: 22 },
  bottom: { padding: spacing(4) },
  composer: { padding: spacing(4) },
  composerTitle: { fontSize: 18, fontWeight: '900', color: colors.ink },
  composerText: { color: colors.inkMuted, marginTop: 2, marginBottom: spacing(3) },
  input: {
    backgroundColor: '#FFFDF9',
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.sm,
    padding: spacing(3),
    minHeight: 70,
    maxHeight: 140,
    fontSize: 16,
    color: colors.ink,
    textAlignVertical: 'top',
    marginBottom: spacing(3),
  },
  chatRow: { flexDirection: 'row', alignItems: 'center', gap: spacing(2) },
  chatInput: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: 'rgba(246,235,221,0.3)',
    borderRadius: radius.pill,
    paddingHorizontal: spacing(4),
    paddingVertical: spacing(2.5),
    color: colors.textOnDark,
    fontSize: 16,
  },
  chatSend: { minHeight: 44, paddingHorizontal: spacing(4) },
  waiting: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing(3), padding: spacing(4) },
  waitingText: { color: colors.textOnDark, fontWeight: '700', flexShrink: 1 },
  leaveNote: { color: colors.textOnDarkMuted, textAlign: 'center', marginTop: spacing(2), fontSize: 13 },
});

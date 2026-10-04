/**
 * Post-game chat channels. Two implementations with the same interface:
 *
 *   channel.subscribe(cb) -> unsubscribe     cb receives the sorted message list
 *   channel.send({ senderId, senderName, text, kind, source })
 *
 * kind: 'challenge' (winner's question — one per match)
 *       'reply'     (loser's answer — one per match, required before leaving)
 *       'chat'      (optional banter afterwards)
 *       'system'    (local notices)
 *
 * The online channel stores messages in matches/{id}/messages. The challenge
 * and reply use fixed document ids so Firestore rules can guarantee there is
 * only ever one of each.
 */
import { collection, doc, onSnapshot, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';

import { CHAT } from '../config/gameConfig';
import { getDb } from './firebase';

export function sanitizeMessage(text) {
  return (text || '')
    .replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, '') // control chars
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, CHAT.maxLength);
}

let localCounter = 0;
const newLocalId = () => `m_${Date.now()}_${localCounter++}`;

export function createLocalChannel() {
  let messages = [];
  const listeners = new Set();
  const emit = () => listeners.forEach((cb) => cb(messages));
  return {
    subscribe(cb) {
      listeners.add(cb);
      cb(messages);
      return () => listeners.delete(cb);
    },
    async send(msg) {
      const text = sanitizeMessage(msg.text);
      if (!text) return;
      messages = [...messages, { ...msg, text, id: newLocalId(), clientTs: Date.now() }];
      emit();
    },
  };
}

export function createFirestoreChannel(matchId) {
  const db = getDb();
  const col = collection(db, 'matches', matchId, 'messages');
  return {
    subscribe(cb) {
      return onSnapshot(col, (snap) => {
        const list = snap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .sort((a, b) => (a.clientTs || 0) - (b.clientTs || 0));
        cb(list);
      });
    },
    async send(msg) {
      const text = sanitizeMessage(msg.text);
      if (!text) return;
      const id = msg.kind === 'challenge' || msg.kind === 'reply' ? msg.kind : newLocalId();
      const data = {
        senderId: msg.senderId,
        senderName: msg.senderName,
        text,
        kind: msg.kind,
        source: msg.source || 'custom',
        clientTs: Date.now(),
        createdAt: serverTimestamp(),
      };
      await setDoc(doc(col, id), data);
      // Mirror on the match doc so lobby/menus can see the challenge status.
      if (msg.kind === 'challenge' || msg.kind === 'reply') {
        await updateDoc(doc(db, 'matches', matchId), { [msg.kind]: { text, by: msg.senderId } }).catch(() => {});
      }
    },
  };
}

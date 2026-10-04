/**
 * Win/loss record. Stored in Firestore (users/{uid}) when online, or on the
 * device in demo mode.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { doc, getDoc, increment, setDoc } from 'firebase/firestore';

import { AUTH_BACKEND } from './auth';
import { getDb } from './firebase';

const localKey = (uid) => `deskBattle.stats.${uid}`;

export async function getStats(uid) {
  try {
    if (AUTH_BACKEND === 'firebase') {
      const snap = await getDoc(doc(getDb(), 'users', uid));
      const d = snap.exists() ? snap.data() : {};
      return { wins: d.wins || 0, losses: d.losses || 0 };
    }
    const raw = await AsyncStorage.getItem(localKey(uid));
    return raw ? JSON.parse(raw) : { wins: 0, losses: 0 };
  } catch {
    return { wins: 0, losses: 0 };
  }
}

export async function recordResult(uid, won) {
  try {
    if (AUTH_BACKEND === 'firebase') {
      await setDoc(
        doc(getDb(), 'users', uid),
        won ? { wins: increment(1) } : { losses: increment(1) },
        { merge: true }
      );
      return;
    }
    const s = await getStats(uid);
    if (won) s.wins += 1;
    else s.losses += 1;
    await AsyncStorage.setItem(localKey(uid), JSON.stringify(s));
  } catch (e) {
    console.warn('Could not save stats', e);
  }
}

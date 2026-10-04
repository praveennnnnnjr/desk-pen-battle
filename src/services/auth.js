/**
 * Authentication with two interchangeable backends:
 *  - firebase: real email/password accounts (Firebase Auth)
 *  - local:    demo accounts stored on this device (salted SHA-256), used
 *              automatically when Firebase isn't configured.
 *
 * Both expose the same API and the same user shape:
 *   { uid, email, displayName }
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut as fbSignOut,
  updateProfile,
} from 'firebase/auth';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';

import { isFirebaseConfigured } from '../config/env';
import { getDb, getFirebaseAuth } from './firebase';

export const AUTH_BACKEND = isFirebaseConfigured ? 'firebase' : 'local';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function validateCredentials({ email, password, confirm, mode }) {
  const errors = {};
  if (!email || !EMAIL_RE.test(email.trim())) errors.email = 'Enter a valid email address.';
  if (!password || password.length < 6) errors.password = 'Password must be at least 6 characters.';
  if (mode === 'signup' && password !== confirm) errors.confirm = "Passwords don't match.";
  return errors;
}

function nameFromEmail(email) {
  const base = email.split('@')[0].replace(/[^a-zA-Z0-9]/g, ' ').trim();
  return (base.charAt(0).toUpperCase() + base.slice(1)).slice(0, 20) || 'Player';
}

const FRIENDLY_ERRORS = {
  'auth/invalid-credential': 'Incorrect email or password.',
  'auth/wrong-password': 'Incorrect email or password.',
  'auth/user-not-found': 'No account found with that email.',
  'auth/email-already-in-use': 'An account with this email already exists. Try logging in.',
  'auth/weak-password': 'Please choose a stronger password (6+ characters).',
  'auth/invalid-email': 'That email address looks invalid.',
  'auth/too-many-requests': 'Too many attempts. Please wait a moment and try again.',
  'auth/network-request-failed': 'Network error. Check your connection and try again.',
};

export function friendlyAuthError(err) {
  return FRIENDLY_ERRORS[err?.code] || err?.message || 'Something went wrong. Please try again.';
}

function authError(code) {
  const e = new Error(FRIENDLY_ERRORS[code] || code);
  e.code = code;
  return e;
}

// ---------------------------------------------------------------------------
// Firebase backend
// ---------------------------------------------------------------------------

const toUser = (u) => (u ? { uid: u.uid, email: u.email, displayName: u.displayName || nameFromEmail(u.email) } : null);

const firebaseBackend = {
  subscribe(cb) {
    return onAuthStateChanged(getFirebaseAuth(), (u) => cb(toUser(u)));
  },
  async signIn(email, password) {
    const cred = await signInWithEmailAndPassword(getFirebaseAuth(), email.trim(), password);
    return toUser(cred.user);
  },
  async signUp(email, password, displayName) {
    const auth = getFirebaseAuth();
    const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
    const name = (displayName || '').trim().slice(0, 20) || nameFromEmail(email);
    await updateProfile(cred.user, { displayName: name });
    await setDoc(
      doc(getDb(), 'users', cred.user.uid),
      { displayName: name, wins: 0, losses: 0, createdAt: serverTimestamp() },
      { merge: true }
    );
    return { ...toUser(cred.user), displayName: name };
  },
  async signOut() {
    await fbSignOut(getFirebaseAuth());
  },
  async resetPassword(email) {
    await sendPasswordResetEmail(getFirebaseAuth(), email.trim());
  },
};

// ---------------------------------------------------------------------------
// Local (demo) backend
// ---------------------------------------------------------------------------

const USERS_KEY = 'deskBattle.localUsers.v1';
const SESSION_KEY = 'deskBattle.session.v1';
const listeners = new Set();
let currentLocalUser = null;

async function readUsers() {
  try {
    return JSON.parse((await AsyncStorage.getItem(USERS_KEY)) || '{}');
  } catch {
    return {};
  }
}

async function hashPassword(password, salt) {
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, `${salt}:${password}`);
}

function emitLocal(user) {
  currentLocalUser = user;
  listeners.forEach((cb) => cb(user));
}

const localBackend = {
  subscribe(cb) {
    listeners.add(cb);
    AsyncStorage.getItem(SESSION_KEY)
      .then((raw) => {
        currentLocalUser = raw ? JSON.parse(raw) : null;
        cb(currentLocalUser);
      })
      .catch(() => cb(null));
    return () => listeners.delete(cb);
  },
  async signIn(email, password) {
    const key = email.trim().toLowerCase();
    const users = await readUsers();
    const rec = users[key];
    if (!rec) throw authError('auth/user-not-found');
    if ((await hashPassword(password, rec.salt)) !== rec.hash) throw authError('auth/invalid-credential');
    const user = { uid: rec.uid, email: key, displayName: rec.displayName };
    await AsyncStorage.setItem(SESSION_KEY, JSON.stringify(user));
    emitLocal(user);
    return user;
  },
  async signUp(email, password, displayName) {
    const key = email.trim().toLowerCase();
    const users = await readUsers();
    if (users[key]) throw authError('auth/email-already-in-use');
    const salt = Array.from(Crypto.getRandomBytes(16), (b) => b.toString(16).padStart(2, '0')).join('');
    const uid = `local_${Crypto.randomUUID()}`;
    const name = (displayName || '').trim().slice(0, 20) || nameFromEmail(key);
    users[key] = { uid, salt, hash: await hashPassword(password, salt), displayName: name };
    await AsyncStorage.setItem(USERS_KEY, JSON.stringify(users));
    const user = { uid, email: key, displayName: name };
    await AsyncStorage.setItem(SESSION_KEY, JSON.stringify(user));
    emitLocal(user);
    return user;
  },
  async signOut() {
    await AsyncStorage.removeItem(SESSION_KEY);
    emitLocal(null);
  },
  async resetPassword() {
    throw new Error('Password reset needs Firebase. In demo mode, just create a new account.');
  },
};

export const authService = AUTH_BACKEND === 'firebase' ? firebaseBackend : localBackend;

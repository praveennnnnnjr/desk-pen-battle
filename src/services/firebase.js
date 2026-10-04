/**
 * Lazy Firebase initialisation. Nothing here runs unless Firebase is
 * configured, so demo mode never touches the network.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getApp, getApps, initializeApp } from 'firebase/app';
import { getAuth, getReactNativePersistence, initializeAuth } from 'firebase/auth';
import { getFirestore, initializeFirestore } from 'firebase/firestore';
import { getFunctions } from 'firebase/functions';

import { firebaseConfig, FUNCTIONS_REGION, isFirebaseConfigured } from '../config/env';

let app;
let auth;
let db;
let functions;

function ensureApp() {
  if (!isFirebaseConfigured) {
    throw new Error('Firebase is not configured. Fill in your .env file (see README).');
  }
  if (!app) {
    app = getApps().length ? getApp() : initializeApp(firebaseConfig);
  }
  return app;
}

export function getFirebaseAuth() {
  if (!auth) {
    const a = ensureApp();
    try {
      // Keeps users signed in between app launches.
      auth = initializeAuth(a, { persistence: getReactNativePersistence(AsyncStorage) });
    } catch (e) {
      // initializeAuth throws if called twice (e.g. during fast refresh).
      auth = getAuth(a);
    }
  }
  return auth;
}

export function getDb() {
  if (!db) {
    const a = ensureApp();
    try {
      // Long polling is more reliable on mobile networks / emulators.
      db = initializeFirestore(a, { experimentalAutoDetectLongPolling: true });
    } catch (e) {
      db = getFirestore(a);
    }
  }
  return db;
}

export function getFns() {
  if (!functions) functions = getFunctions(ensureApp(), FUNCTIONS_REGION);
  return functions;
}

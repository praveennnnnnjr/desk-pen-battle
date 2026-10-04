/**
 * AI-generated challenge questions.
 *
 * The app calls the `generateChallenge` Cloud Function (functions/index.js),
 * which talks to the Claude API with a server-side key — API keys must never
 * ship inside a mobile app. If the function isn't deployed, the network is
 * down, or it's slow, we fall back to a built-in question bank so the
 * post-game flow always works.
 */
import { httpsCallable } from 'firebase/functions';

import { AI_QUESTIONS_ENABLED, isFirebaseConfigured } from '../config/env';
import { getFns } from './firebase';

const TIMEOUT_MS = 8000;

const QUESTION_BANK = [
  'Be honest: was that a lucky shot or pure skill on my part?',
  "What's the most embarrassing thing that's ever happened to you at school or work?",
  'If your pen could talk, what would it say about that last round?',
  "What's one skill you secretly think you're the best at?",
  'Describe your perfect weekend in exactly five words.',
  "What's the weirdest food combination you actually enjoy?",
  'If you could swap lives with any fictional character for a day, who would it be?',
  "What's a song you'd be embarrassed for people to know you love?",
  "What's your go-to excuse when you lose a game?",
  'Which app on your phone do you use way more than you should?',
  'If you had to teach a class on anything, what would it be?',
  "What's the funniest thing you've ever seen happen in a classroom?",
  'Give me your best trash-talk line for our rematch.',
  'What would your pen-fighting nickname be, and why?',
  "What's something you believed as a kid that turned out to be completely wrong?",
  'If you won a million rupees tomorrow, what is the first silly thing you would buy?',
  "What's a talent you have that nobody would guess?",
  'Which teacher or boss would be the best at Pen Clash, and why?',
  'Rate your own flicking technique out of 10 — and justify it.',
  "What's the last thing that made you laugh out loud?",
];

const BOT_REPLIES = [
  "Ha! Okay, you got me. I've been practicing on a very small desk.",
  "I plead the fifth… but fine: probably pizza with pineapple.",
  'My circuits are blushing. Next question, rematch first!',
  'Honestly? I just flick and hope. Same as everyone.',
  "That's classified. But I'll tell you after you beat me again.",
  'Five words: snacks, naps, games, sunshine, repeat.',
];

const BOT_REACTIONS = [
  "Ha! Fair answer. Rematch soon? 😄",
  "I'll accept that. Good game!",
  'Noted. I am saving that for the rematch trash talk. GG!',
  'Love it. Well played, see you on the desk.',
];

const pick = (list) => list[Math.floor(Math.random() * list.length)];

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms)),
  ]);
}

async function callFunction(payload) {
  if (!AI_QUESTIONS_ENABLED || !isFirebaseConfigured) throw new Error('AI function disabled');
  const fn = httpsCallable(getFns(), 'generateChallenge', { timeout: TIMEOUT_MS });
  const res = await withTimeout(fn(payload), TIMEOUT_MS + 500);
  const text = res?.data?.text?.trim();
  if (!text) throw new Error('empty AI response');
  return text;
}

let lastQuestion = null;

/** A fun, friendly question the winner can ask the loser. */
export async function generateChallengeQuestion({ winnerName, loserName, winnerScore, loserScore }) {
  try {
    const text = await callFunction({ mode: 'question', winnerName, loserName, winnerScore, loserScore });
    return { text, source: 'ai' };
  } catch (e) {
    let q = pick(QUESTION_BANK);
    if (q === lastQuestion) q = pick(QUESTION_BANK);
    lastQuestion = q;
    return { text: q, source: 'bank' };
  }
}

/** The AI opponent answering a question the human winner asked it. */
export async function generateBotReply({ question, botName }) {
  try {
    const text = await callFunction({ mode: 'reply', question, botName });
    return { text, source: 'ai' };
  } catch {
    return { text: pick(BOT_REPLIES), source: 'bank' };
  }
}

/** Short reaction after the human loser answers the bot's question. */
export function botReaction() {
  return pick(BOT_REACTIONS);
}

/**
 * Desk Battle: Pen Clash — Cloud Functions
 *
 * generateChallenge (callable)
 *   mode 'question' -> a fun, friendly question the winner can ask the loser
 *   mode 'reply'    -> the AI opponent's answer when a human beat it and asked a question
 *
 * The Claude API key lives in Secret Manager:
 *   firebase functions:secrets:set ANTHROPIC_API_KEY
 */
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const logger = require('firebase-functions/logger');

const ANTHROPIC_API_KEY = defineSecret('ANTHROPIC_API_KEY');
const MODEL = 'claude-haiku-4-5-20251001';
const MAX_CHARS = 200;

const clean = (s, max = 60) =>
  String(s || '')
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .trim()
    .slice(0, max);

const SYSTEM = [
  'You write short lines for a light-hearted mobile pen-flicking game played by students and friends.',
  'Keep everything friendly, playful and safe for all ages.',
  'Never ask about or mention: health, body, appearance, religion, politics, relationships/romance,',
  'money troubles, family problems, addresses, phone numbers, passwords or any personal data.',
  'Reply with the line only — no quotes, no preamble, under 140 characters, at most one emoji.',
].join(' ');

function buildPrompt(data) {
  if (data.mode === 'reply') {
    const question = clean(data.question, 280);
    const botName = clean(data.botName, 30) || 'Desk Bot';
    return `You are ${botName}, a cheeky but good-sporting AI opponent who just LOST a pen-fighting match. ` +
      `The winner asked you this challenge question: "${question}". ` +
      'Answer it in character, briefly and humorously. If the question is inappropriate, playfully dodge it.';
  }
  const winner = clean(data.winnerName, 30) || 'the winner';
  const loser = clean(data.loserName, 30) || 'the loser';
  const ws = Number.isFinite(data.winnerScore) ? data.winnerScore : '?';
  const ls = Number.isFinite(data.loserScore) ? data.loserScore : '?';
  return `${winner} just beat ${loser} ${ws}-${ls} in a pen-fighting game on a school desk. ` +
    `Write ONE fun challenge question that ${winner} will ask ${loser}. ` +
    'It can be a playful "truth" question, a would-you-rather, or a creative mini-challenge they answer by typing. ' +
    'Make it different each time.';
}

exports.generateChallenge = onCall(
  {
    secrets: [ANTHROPIC_API_KEY],
    region: 'asia-south1', // keep in sync with EXPO_PUBLIC_FIREBASE_FUNCTIONS_REGION
    maxInstances: 10,
    timeoutSeconds: 15,
    // enforceAppCheck: true, // recommended once App Check is set up
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Sign in to generate questions.');
    }
    const data = request.data || {};
    if (data.mode !== 'question' && data.mode !== 'reply') {
      throw new HttpsError('invalid-argument', 'mode must be "question" or "reply".');
    }

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY.value(),
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 120,
        temperature: 1,
        system: SYSTEM,
        messages: [{ role: 'user', content: buildPrompt(data) }],
      }),
    });

    if (!res.ok) {
      logger.error('Claude API error', res.status, await res.text());
      throw new HttpsError('unavailable', 'AI is busy, try again.');
    }

    const body = await res.json();
    const text = (body.content || [])
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join(' ')
      .replace(/^["'“”\s]+|["'“”\s]+$/g, '')
      .slice(0, MAX_CHARS);

    if (!text) throw new HttpsError('internal', 'Empty AI response.');
    return { text };
  }
);

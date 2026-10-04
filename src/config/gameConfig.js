/**
 * Gameplay tuning. Everything here is in "world units" — the desk is a
 * fixed-size virtual table that gets scaled to fit the phone screen, so the
 * physics behave identically on every device (which also keeps online
 * matches in sync).
 */
export const DESK = {
  width: 1000,
  height: 1500,
};

export const PEN = {
  length: 420, // tip to cap, including the rounded ends
  radius: 16, // half the pen's thickness (collision capsule radius)
  mass: 1,
};

export const PHYSICS = {
  step: 1 / 240, // fixed timestep (seconds) — never change mid-match
  linearFriction: 950, // sliding friction deceleration (units/s²)
  linearDamping: 0.6, // extra velocity-proportional drag (1/s)
  angularFriction: 9, // spin friction deceleration (rad/s²)
  angularDamping: 1.4, // velocity-proportional spin drag (1/s)
  restitution: 0.8, // bounciness of pen-on-pen hits
  contactFriction: 0.25, // grip between pens during a hit
  restSpeed: 6, // below this a pen counts as stopped (units/s)
  restSpin: 0.08, // below this a pen counts as not spinning (rad/s)
  fallDuration: 0.6, // seconds the "falling off the desk" animation lasts
  maxSimSeconds: 12, // safety cap for a single shot
};

export const FLICK = {
  maxImpulse: 1900, // impulse at 100% power
  maxDrag: 260, // world units of pull-back that equals 100% power
  minPower: 0.06, // releases weaker than this are treated as cancelled
  grabSlop: 70, // how far from the pen (world units) a touch still grabs it
};

export const MATCH = {
  targetScore: 3, // first to 3 knock-offs wins the match
  bannerMs: 1400, // how long "POINT!" / "REPLAY" banners stay up
};

export const AI_DIFFICULTY = {
  easy: { label: 'Easy', candidates: 6, aimNoise: 0.22, powerNoise: 0.22, thinkMs: 700 },
  normal: { label: 'Normal', candidates: 18, aimNoise: 0.09, powerNoise: 0.1, thinkMs: 900 },
  hard: { label: 'Hard', candidates: 42, aimNoise: 0.025, powerNoise: 0.04, thinkMs: 1100 },
};

export const CHAT = {
  maxLength: 280,
  minReplyLength: 2,
};

/**
 * Desk Battle physics — a tiny, deterministic 2D rigid-body engine.
 *
 * Each pen is a capsule (a line segment with a radius). Pens slide on the
 * desk with friction, spin, collide with each other, and fall off when their
 * centre of mass leaves the desk surface.
 *
 * The module is pure JavaScript with no React Native imports, so it can be
 * unit-tested in Node and re-used by the AI to simulate candidate shots.
 */
import { DESK, PEN, PHYSICS } from '../config/gameConfig';

// ---------------------------------------------------------------------------
// Pen / world creation
// ---------------------------------------------------------------------------

export function createPen(id, x, y, angle = 0, overrides = {}) {
  const length = overrides.length ?? PEN.length;
  const radius = overrides.radius ?? PEN.radius;
  const mass = overrides.mass ?? PEN.mass;
  return {
    id,
    x,
    y,
    angle,
    vx: 0,
    vy: 0,
    w: 0, // angular velocity (rad/s)
    length,
    radius,
    mass,
    inertia: (mass * length * length) / 12,
    fallen: false,
    fallT: 0, // seconds since it went over the edge
  };
}

export function createWorld(pens) {
  return { pens, time: 0, accumulator: 0, events: [] };
}

export function getPen(world, id) {
  return world.pens.find((p) => p.id === id);
}

/** Serializable copy of positions — sent over the network and used for replays. */
export function snapshot(world) {
  return {
    pens: world.pens.map((p) => ({
      id: p.id,
      x: round3(p.x),
      y: round3(p.y),
      angle: round3(p.angle),
      fallen: p.fallen,
    })),
  };
}

export function worldFromSnapshot(snap) {
  const pens = snap.pens.map((s) => {
    const pen = createPen(s.id, s.x, s.y, s.angle);
    pen.fallen = !!s.fallen;
    pen.fallT = s.fallen ? PHYSICS.fallDuration : 0;
    return pen;
  });
  return createWorld(pens);
}

export function cloneWorld(world) {
  return {
    pens: world.pens.map((p) => ({ ...p })),
    time: world.time,
    accumulator: 0,
    events: [],
  };
}

function round3(n) {
  return Math.round(n * 1000) / 1000;
}

// ---------------------------------------------------------------------------
// Geometry helpers
// ---------------------------------------------------------------------------

/** End points of the pen's inner segment (capsule core). */
export function penSegment(pen) {
  const half = pen.length / 2 - pen.radius;
  const cx = Math.cos(pen.angle) * half;
  const cy = Math.sin(pen.angle) * half;
  return { ax: pen.x - cx, ay: pen.y - cy, bx: pen.x + cx, by: pen.y + cy };
}

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

/** Closest point on segment AB to point P. */
export function closestPointOnSegment(ax, ay, bx, by, px, py) {
  const abx = bx - ax;
  const aby = by - ay;
  const lenSq = abx * abx + aby * aby;
  const t = lenSq > 0 ? clamp(((px - ax) * abx + (py - ay) * aby) / lenSq, 0, 1) : 0;
  return { x: ax + abx * t, y: ay + aby * t, t };
}

/**
 * Closest points between segments P1Q1 and P2Q2 (Ericson, Real-Time
 * Collision Detection §5.1.9).
 */
function closestSegmentSegment(p1x, p1y, q1x, q1y, p2x, p2y, q2x, q2y) {
  const d1x = q1x - p1x;
  const d1y = q1y - p1y;
  const d2x = q2x - p2x;
  const d2y = q2y - p2y;
  const rx = p1x - p2x;
  const ry = p1y - p2y;
  const a = d1x * d1x + d1y * d1y;
  const e = d2x * d2x + d2y * d2y;
  const f = d2x * rx + d2y * ry;
  const EPS = 1e-9;
  let s;
  let t;

  if (a <= EPS && e <= EPS) {
    s = 0;
    t = 0;
  } else if (a <= EPS) {
    s = 0;
    t = clamp(f / e, 0, 1);
  } else {
    const c = d1x * rx + d1y * ry;
    if (e <= EPS) {
      t = 0;
      s = clamp(-c / a, 0, 1);
    } else {
      const b = d1x * d2x + d1y * d2y;
      const denom = a * e - b * b;
      s = denom !== 0 ? clamp((b * f - c * e) / denom, 0, 1) : 0;
      t = (b * s + f) / e;
      if (t < 0) {
        t = 0;
        s = clamp(-c / a, 0, 1);
      } else if (t > 1) {
        t = 1;
        s = clamp((b - c) / a, 0, 1);
      }
    }
  }
  return {
    ax: p1x + d1x * s,
    ay: p1y + d1y * s,
    bx: p2x + d2x * t,
    by: p2y + d2y * t,
  };
}

/** Is a world-space point close enough to the pen to grab it? */
export function hitTestPen(pen, px, py, slop = 0) {
  if (pen.fallen) return false;
  const s = penSegment(pen);
  const c = closestPointOnSegment(s.ax, s.ay, s.bx, s.by, px, py);
  const dx = px - c.x;
  const dy = py - c.y;
  const r = pen.radius + slop;
  return dx * dx + dy * dy <= r * r;
}

/** Point on the pen's centre line nearest to (px, py) — where a flick lands. */
export function contactPointOnPen(pen, px, py) {
  const s = penSegment(pen);
  const c = closestPointOnSegment(s.ax, s.ay, s.bx, s.by, px, py);
  return { x: c.x, y: c.y };
}

export function isOnDesk(pen) {
  return pen.x >= 0 && pen.x <= DESK.width && pen.y >= 0 && pen.y <= DESK.height;
}

// ---------------------------------------------------------------------------
// Forces
// ---------------------------------------------------------------------------

/** Apply an instantaneous impulse (jx, jy) at world point (px, py). */
export function applyImpulse(pen, jx, jy, px, py) {
  const rx = px - pen.x;
  const ry = py - pen.y;
  pen.vx += jx / pen.mass;
  pen.vy += jy / pen.mass;
  pen.w += (rx * jy - ry * jx) / pen.inertia;
}

/**
 * A flick: `shot` = { penId, px, py, jx, jy } where (px, py) is the contact
 * point on the pen and (jx, jy) the impulse.
 */
export function applyShot(world, shot) {
  const pen = getPen(world, shot.penId);
  if (!pen || pen.fallen) return;
  applyImpulse(pen, shot.jx, shot.jy, shot.px, shot.py);
}

// ---------------------------------------------------------------------------
// Simulation
// ---------------------------------------------------------------------------

function integrate(pen, dt) {
  if (pen.fallen) {
    // Keep drifting while it tumbles off the edge.
    pen.x += pen.vx * dt;
    pen.y += pen.vy * dt;
    pen.angle += pen.w * dt;
    pen.vx *= 1 - 2 * dt;
    pen.vy *= 1 - 2 * dt;
    pen.fallT += dt;
    return;
  }

  pen.x += pen.vx * dt;
  pen.y += pen.vy * dt;
  pen.angle += pen.w * dt;

  // Sliding friction (constant deceleration + a little drag).
  const speed = Math.hypot(pen.vx, pen.vy);
  if (speed > 0) {
    const drop = PHYSICS.linearFriction * dt + speed * PHYSICS.linearDamping * dt;
    const next = Math.max(0, speed - drop);
    const k = next / speed;
    pen.vx *= k;
    pen.vy *= k;
  }

  const spin = Math.abs(pen.w);
  if (spin > 0) {
    const drop = PHYSICS.angularFriction * dt + spin * PHYSICS.angularDamping * dt;
    const next = Math.max(0, spin - drop);
    pen.w = Math.sign(pen.w) * next;
  }
}

function resolvePair(a, b, events) {
  const sa = penSegment(a);
  const sb = penSegment(b);
  const c = closestSegmentSegment(sa.ax, sa.ay, sa.bx, sa.by, sb.ax, sb.ay, sb.bx, sb.by);

  let nx = c.bx - c.ax;
  let ny = c.by - c.ay;
  const distSq = nx * nx + ny * ny;
  const minDist = a.radius + b.radius;
  if (distSq >= minDist * minDist) return;

  let dist = Math.sqrt(distSq);
  if (dist < 1e-6) {
    // Segments cross exactly — push apart along the line between centres.
    nx = b.x - a.x;
    ny = b.y - a.y;
    dist = Math.hypot(nx, ny) || 1;
    nx /= dist;
    ny /= dist;
    dist = 0;
  } else {
    nx /= dist;
    ny /= dist;
  }

  const invMa = 1 / a.mass;
  const invMb = 1 / b.mass;
  const invSum = invMa + invMb;

  // Positional correction so pens never sink into each other.
  const penetration = minDist - dist;
  const correction = (penetration * 0.85) / invSum;
  a.x -= nx * correction * invMa;
  a.y -= ny * correction * invMa;
  b.x += nx * correction * invMb;
  b.y += ny * correction * invMb;

  // Contact point roughly between the two surfaces.
  const cx = (c.ax + c.bx) / 2;
  const cy = (c.ay + c.by) / 2;
  const rax = cx - a.x;
  const ray = cy - a.y;
  const rbx = cx - b.x;
  const rby = cy - b.y;

  const relVel = () => {
    const vax = a.vx - a.w * ray;
    const vay = a.vy + a.w * rax;
    const vbx = b.vx - b.w * rby;
    const vby = b.vy + b.w * rbx;
    return { x: vbx - vax, y: vby - vay };
  };

  let rv = relVel();
  const vn = rv.x * nx + rv.y * ny;
  if (vn >= 0) return; // already separating

  const raxn = rax * ny - ray * nx;
  const rbxn = rbx * ny - rby * nx;
  const k = invSum + (raxn * raxn) / a.inertia + (rbxn * rbxn) / b.inertia;
  const j = (-(1 + PHYSICS.restitution) * vn) / k;

  a.vx -= j * nx * invMa;
  a.vy -= j * ny * invMa;
  a.w -= (raxn * j) / a.inertia;
  b.vx += j * nx * invMb;
  b.vy += j * ny * invMb;
  b.w += (rbxn * j) / b.inertia;

  // Tangential (friction) impulse.
  rv = relVel();
  let tx = rv.x - (rv.x * nx + rv.y * ny) * nx;
  let ty = rv.y - (rv.x * nx + rv.y * ny) * ny;
  const tLen = Math.hypot(tx, ty);
  if (tLen > 1e-6) {
    tx /= tLen;
    ty /= tLen;
    const vt = rv.x * tx + rv.y * ty;
    const raxt = rax * ty - ray * tx;
    const rbxt = rbx * ty - rby * tx;
    const kt = invSum + (raxt * raxt) / a.inertia + (rbxt * rbxt) / b.inertia;
    const maxF = PHYSICS.contactFriction * j;
    const jt = clamp(-vt / kt, -maxF, maxF);
    a.vx -= jt * tx * invMa;
    a.vy -= jt * ty * invMa;
    a.w -= (raxt * jt) / a.inertia;
    b.vx += jt * tx * invMb;
    b.vy += jt * ty * invMb;
    b.w += (rbxt * jt) / b.inertia;
  }

  events.push({ type: 'hit', a: a.id, b: b.id, strength: j, x: cx, y: cy });
}

/** Advance exactly one fixed timestep. */
export function stepOnce(world) {
  const dt = PHYSICS.step;
  const pens = world.pens;
  for (let i = 0; i < pens.length; i++) integrate(pens[i], dt);

  for (let i = 0; i < pens.length; i++) {
    if (pens[i].fallen) continue;
    for (let j = i + 1; j < pens.length; j++) {
      if (pens[j].fallen) continue;
      resolvePair(pens[i], pens[j], world.events);
    }
  }

  for (let i = 0; i < pens.length; i++) {
    const p = pens[i];
    if (!p.fallen && !isOnDesk(p)) {
      p.fallen = true;
      p.fallT = 0;
      world.events.push({ type: 'fall', id: p.id });
    }
  }
  world.time += dt;
}

/**
 * Advance by a real frame duration using fixed substeps. Returns the number
 * of substeps taken.
 */
export function advance(world, frameSeconds) {
  world.accumulator += Math.min(frameSeconds, 0.05); // avoid spiral of death
  let steps = 0;
  while (world.accumulator >= PHYSICS.step) {
    stepOnce(world);
    world.accumulator -= PHYSICS.step;
    steps++;
  }
  return steps;
}

export function isSettled(world) {
  for (const p of world.pens) {
    if (p.fallen) {
      if (p.fallT < PHYSICS.fallDuration) return false;
      continue;
    }
    if (Math.hypot(p.vx, p.vy) > PHYSICS.restSpeed || Math.abs(p.w) > PHYSICS.restSpin) {
      return false;
    }
  }
  return true;
}

export function freeze(world) {
  for (const p of world.pens) {
    p.vx = 0;
    p.vy = 0;
    p.w = 0;
  }
  world.accumulator = 0;
}

/**
 * Run a shot to completion without rendering. Used by the AI and tests.
 * Returns a NEW world; the input is not modified.
 */
export function simulateShot(world, shot) {
  const sim = cloneWorld(world);
  applyShot(sim, shot);
  const maxSteps = Math.ceil(PHYSICS.maxSimSeconds / PHYSICS.step);
  for (let i = 0; i < maxSteps; i++) {
    stepOnce(sim);
    if (i % 8 === 0 && isSettled(sim)) break;
  }
  freeze(sim);
  return sim;
}

/** Distance from a point to the nearest desk edge (negative = off the desk). */
export function edgeDistance(x, y) {
  return Math.min(x, y, DESK.width - x, DESK.height - y);
}

/**
 * Renders the desk, the pens and the aim guide, and turns touches into
 * world-space grab / drag / release callbacks.
 *
 * World -> screen: the 1000x1500 world desk is scaled uniformly to fit.
 * `flipped` rotates the view 180° (used online so each player sees their own
 * pen at the bottom).
 */
import React, { useMemo, useRef, useState } from 'react';
import { Image, ImageBackground, PanResponder, StyleSheet, View } from 'react-native';

import { ASSETS, PEN_SPRITE_THICKNESS } from '../config/assets';
import { DESK, PHYSICS } from '../config/gameConfig';
import { PLAYER_COLORS } from '../config/theme';

const AIM_DOTS = 10;

export default function DeskBoard({ worldRef, flipped = false, aim, activePenId, onGrab, onDrag, onRelease, onCancel }) {
  const [box, setBox] = useState(null);
  const handlers = useRef({});
  handlers.current = { onGrab, onDrag, onRelease, onCancel };

  const scale = box ? box.w / DESK.width : 0;

  // Conversions kept in a ref so the PanResponder (created once) sees updates.
  const conv = useRef({});
  conv.current = {
    toWorld(lx, ly) {
      const x = lx / scale;
      const y = ly / scale;
      return flipped ? { x: DESK.width - x, y: DESK.height - y } : { x, y };
    },
    deltaToWorld(dx, dy) {
      return flipped ? { x: -dx / scale, y: -dy / scale } : { x: dx / scale, y: dy / scale };
    },
  };

  const gesture = useRef({ active: false, grab: null, page0: null });

  const responder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: (e) => {
          const { locationX, locationY, pageX, pageY } = e.nativeEvent;
          const grab = conv.current.toWorld(locationX, locationY);
          const ok = handlers.current.onGrab?.(grab);
          gesture.current = { active: !!ok, grab, page0: { x: pageX, y: pageY } };
        },
        onPanResponderMove: (e) => {
          const g = gesture.current;
          if (!g.active) return;
          const d = conv.current.deltaToWorld(e.nativeEvent.pageX - g.page0.x, e.nativeEvent.pageY - g.page0.y);
          handlers.current.onDrag?.({ x: g.grab.x + d.x, y: g.grab.y + d.y });
        },
        onPanResponderRelease: (e) => {
          const g = gesture.current;
          if (!g.active) return;
          g.active = false;
          const d = conv.current.deltaToWorld(e.nativeEvent.pageX - g.page0.x, e.nativeEvent.pageY - g.page0.y);
          handlers.current.onRelease?.({ x: g.grab.x + d.x, y: g.grab.y + d.y });
        },
        onPanResponderTerminate: () => {
          if (gesture.current.active) handlers.current.onCancel?.();
          gesture.current.active = false;
        },
      }),
    []
  );

  const onContainerLayout = (e) => {
    const { width, height } = e.nativeEvent.layout;
    const aspect = DESK.width / DESK.height;
    let w = width * 0.9;
    let h = w / aspect;
    if (h > height * 0.92) {
      h = height * 0.92;
      w = h * aspect;
    }
    setBox({ w, h });
  };

  const toScreen = (x, y) => (flipped ? { x: (DESK.width - x) * scale, y: (DESK.height - y) * scale } : { x: x * scale, y: y * scale });

  const world = worldRef.current;

  return (
    <View style={styles.container} onLayout={onContainerLayout}>
      {box && (
        <View style={{ width: box.w, height: box.h }} {...responder.panHandlers}>
          {/* Everything visual ignores touches, so touch coordinates are always
              relative to this desk view. */}
          <View style={StyleSheet.absoluteFill} pointerEvents="none">
          <ImageBackground
            source={ASSETS.desk}
            resizeMode="stretch"
            style={[StyleSheet.absoluteFill, styles.desk]}
            imageStyle={{ borderRadius: 10 }}
          />
          {world.pens.map((pen) => (
            <PenView
              key={pen.id}
              pen={pen}
              scale={scale}
              toScreen={toScreen}
              flipped={flipped}
              highlighted={pen.id === activePenId}
            />
          ))}
          {aim && aim.preview && <AimGuide aim={aim} scale={scale} toScreen={toScreen} />}
          </View>
        </View>
      )}
    </View>
  );
}

function PenView({ pen, scale, toScreen, flipped, highlighted }) {
  const c = toScreen(pen.x, pen.y);
  const len = pen.length * scale;
  const thick = Math.max(6, pen.radius * 2 * scale * PEN_SPRITE_THICKNESS);
  const angle = pen.angle + (flipped ? Math.PI : 0);
  const t = pen.fallen ? Math.min(1, pen.fallT / PHYSICS.fallDuration) : 0;
  const s = 1 - 0.55 * t;
  const base = {
    position: 'absolute',
    left: c.x - len / 2,
    top: c.y - thick / 2,
    width: len,
    height: thick,
  };
  const transform = [{ rotate: `${angle}rad` }, { scale: s }];

  return (
    <>
      {highlighted && !pen.fallen && (
        <View
          pointerEvents="none"
          style={[
            base,
            {
              left: base.left - 6,
              top: base.top - 6,
              width: len + 12,
              height: thick + 12,
              borderRadius: thick,
              backgroundColor: PLAYER_COLORS[pen.id],
              opacity: 0.28,
              transform,
            },
          ]}
        />
      )}
      <View
        pointerEvents="none"
        style={[
          base,
          {
            left: base.left + 3 + t * 6,
            top: base.top + 5 + t * 14,
            borderRadius: thick / 2,
            backgroundColor: '#000',
            opacity: 0.28 * (1 - t),
            transform,
          },
        ]}
      />
      <Image
        source={ASSETS.pens[pen.id]}
        resizeMode="stretch"
        style={[base, { opacity: 1 - 0.85 * t, transform }]}
      />
    </>
  );
}

function AimGuide({ aim, scale, toScreen }) {
  const { preview, drag } = aim;
  const { contact, dirX, dirY, power, valid } = preview;
  const color = !valid ? 'rgba(255,255,255,0.5)' : power < 0.5 ? '#3BA55C' : power < 0.8 ? '#F0B45A' : '#E5484D';
  const length = 60 + power * 300;
  const dots = [];
  for (let i = 1; i <= AIM_DOTS; i++) {
    const d = (length * i) / AIM_DOTS;
    const p = toScreen(contact.x + dirX * d, contact.y + dirY * d);
    const size = 5 + (AIM_DOTS - i) * 0.6;
    dots.push(
      <View
        key={i}
        pointerEvents="none"
        style={{
          position: 'absolute',
          left: p.x - size / 2,
          top: p.y - size / 2,
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: color,
          opacity: 1 - i / (AIM_DOTS + 3),
        }}
      />
    );
  }
  // Rubber band from the contact point to the finger.
  const a = toScreen(contact.x, contact.y);
  const b = drag ? toScreen(drag.x, drag.y) : a;
  const bandLen = Math.hypot(b.x - a.x, b.y - a.y);
  const bandAngle = Math.atan2(b.y - a.y, b.x - a.x);

  return (
    <>
      {bandLen > 2 && (
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: (a.x + b.x) / 2 - bandLen / 2,
            top: (a.y + b.y) / 2 - 1.5,
            width: bandLen,
            height: 3,
            borderRadius: 2,
            backgroundColor: 'rgba(255,255,255,0.55)',
            transform: [{ rotate: `${bandAngle}rad` }],
          }}
        />
      )}
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          left: a.x - 9,
          top: a.y - 9,
          width: 18,
          height: 18,
          borderRadius: 9,
          borderWidth: 3,
          borderColor: color,
        }}
      />
      {dots}
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  desk: {
    borderRadius: 10,
    shadowColor: '#000',
    shadowOpacity: 0.5,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 12,
  },
});

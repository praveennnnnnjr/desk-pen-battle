/**
 * All game art in one place — swap these files to re-skin the game.
 *
 *  desk:  any image; it is stretched to the 2:3 desk area (1000x1500 is ideal).
 *  pens:  horizontal PNG with transparent background, TIP POINTING RIGHT,
 *         roughly 840x64 (13:1). The sprite is stretched over the collision
 *         capsule, so keep the pen filling the image edge to edge.
 */
export const ASSETS = {
  desk: require('../../assets/desk.png'),
  pens: {
    p1: require('../../assets/pen_blue.png'),
    p2: require('../../assets/pen_red.png'),
  },
};

/** Visual thickness of the pen sprite relative to its collision diameter. */
export const PEN_SPRITE_THICKNESS = 1.15;

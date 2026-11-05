// Global tuning values. Units are meters and seconds.

export const SEA_LEVEL = 0;
/** Height the wave reaches. Anything below this when the wave passes gets splashed. */
export const WAVE_CREST = 10;
/** The home island starts here (the course runs toward negative z). The wave breaks at this line. */
export const HOME_FRONT_Z = 2;
export const HOME_TOP = 4;

export const PHYS = {
  gravity: 34,
  swingGravity: 30,
  jumpVelocity: 13.5,
  doubleJumpVelocity: 12.5,
  groundAccel: 85,
  groundFriction: 60,
  airAccel: 22,
  airDrag: 0.35,
  maxFallSpeed: 55,
  maxSpeed: 60,

  halfWidth: 0.45,
  height: 2.0,
  /** Where the rope attaches, measured up from the feet (raised hands). */
  gripHeight: 2.1,

  coyoteTime: 0.1,
  jumpBuffer: 0.12,
  /** Airborne time before "hold jump" auto-grabs an anchor. */
  grabDelay: 0.08,
  regrabCooldown: 0.45,

  ropeMin: 3.5,
  reelSpeed: 6,
  reelFraction: 0.8,
  pumpAccel: 16,
  swingDamping: 0.04,
  releaseLift: 4.5,

  /** Lighthouse launch pad flight time. */
  padFlightTime: 1.1,
};

export const WAVE = {
  firstInterval: 90,
  interval: 70,
  warning: 8,
  speed: 42,
  /** How far behind the front the wall still splashes you. */
  thickness: 7,
  goldenEvery: 4,
  /** Every 5th wave is a Big Wave: faster and higher (§9.0). */
  bigEvery: 5,
  bigSpeed: 52,
  bigCrest: 12,
};

export const COMBO = {
  /** Chain timer (s); refills on grab and release, drains only on the ground on a course island. */
  chainTime: 8,
  /** Horizontal velocity multiplier for a Perfect release. */
  perfectBoost: 1.04,
  /** Perfect window, degrees from straight down, past the anchor. */
  perfectMin: 28,
  perfectMax: 58,
  goodMin: 10,
  goodMax: 80,
  /** Delivery bonus = income × multiplier × this × chainMult (× closeCall). */
  deliverySeconds: 10,
  closeCallMult: 1.25,
  closeCallSeconds: 3,
};

/** Seconds between the 'sea' event and the 'respawn' event (§9.0). */
export const SEA_RESPAWN_DELAY = 0.6;

export const ECONOMY = {
  offlineCapSeconds: 60 * 60,
  sellSeconds: 30,
  spawnChance: 0.7,
};

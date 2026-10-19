// Port of core/src/main/kotlin/dev/arc/ep133/features/KeyMotion.kt
//
// How a key cap moves, after the K.O. II's own keys: mechanical switches,
// not rubber pads. A press goes straight down and stops hard at the bottom
// ([PRESS_MS], at an even speed, no easing into the stop); a strike stays
// down at least [MIN_DOWN_MS], so the quickest tap still shows the key
// bottomed out; let go, the switch's spring throws the cap back up a little
// past its rest and it settles (a damped spring, [DAMPING] and [STIFFNESS]).
//
// Web deltas: the web runs these numbers as CSS transitions of one number,
// --cap-p (theme/cap.css): the press as a linear PRESS_MS one, the release
// as RELEASE_MS of [springCss] (tokens.css's --key-spring, which a test
// holds to it), and the shortest stay in ui/live/capDown.ts. So Kotlin's
// per-frame Key / step (Android's caps and piano) has no port here.

/** From up to fully down. */
export const PRESS_MS = 24

/** The shortest time a pressed key stays down, from its press. */
export const MIN_DOWN_MS = 50

/** The switch spring's damping ratio: under 1, so it overshoots (16%) before it settles. */
export const DAMPING = 0.5

/** Its stiffness, in 1/s² (Compose's spring stiffness): back at rest in about 48 ms. */
export const STIFFNESS = 2500

/** How long the web's release transition runs: the spring settled to under 1% of the travel. */
export const RELEASE_MS = 200

/**
 * The release from fully down, as the fraction of the way back up at [t]
 * (0..1 of [RELEASE_MS]): the damped spring's exact curve, past 1 where
 * it overshoots.
 */
export function release(t: number): number {
  const w = Math.sqrt(STIFFNESS)
  const z = DAMPING
  const wd = w * Math.sqrt(1 - z * z)
  const s = (t * RELEASE_MS) / 1000
  return 1 - Math.exp(-z * w * s) * (Math.cos(wd * s) + ((z * w) / wd) * Math.sin(wd * s))
}

/** The release as a CSS `linear()` easing of [points] stops (tokens.css's --key-spring). */
export function springCss(points = 25): string {
  const stops: string[] = []
  for (let i = 0; i <= points; i++) {
    stops.push(i === points ? '1' : String(Number(release(i / points).toFixed(3))))
  }
  return `linear(${stops.join(', ')})`
}

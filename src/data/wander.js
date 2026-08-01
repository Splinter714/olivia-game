// Lightweight per-species "wander" tuning (issue #22 #4) — pure data, no
// Phaser. KennelScene drives the actual drift: each present stay gets a
// small periodic target point within its cage/island (or its yard zone,
// while out playing) that its sprite drifts toward; when it arrives (or its
// timer runs out) a new target is picked. Amplitude/interval per species
// give each one a distinct feel without needing separate animation code —
// a hamster re-targets often and can range further inside its small cage
// ("bounces around"), a turtle barely moves at all, a bunny re-targets in
// bursts ("hops"), cats/dogs drift slowly and widely ("pace").
export const WANDER = {
  turtle:     { interval: [4500, 8000], amp: 5 },  // barely shifts on its island
  snake:      { interval: [3500, 7000], amp: 7 },  // slow coil-and-shift along the perch
  guineaPig:  { interval: [1800, 3200], amp: 9 },
  hamster:    { interval: [700, 1600], amp: 13 },  // bounces around the most
  bunny:      { interval: [2200, 4200], amp: 12 }, // hops in bursts
  cat:        { interval: [3000, 5500], amp: 10 }, // slow pacing
  dog:        { interval: [2600, 5000], amp: 11 }, // slow pacing
  bird:       { interval: [900, 2000], amp: 10 },  // quick hops around the nest
  lizard:     { interval: [1100, 3400], amp: 12 }, // darts, then basks a while
  dragon:     { interval: [2400, 4800], amp: 9 },  // secret bonus guest — a calm little waddle
};

// Yard play reads more energetic/larger-range than in-cage wander (DESIGN.md
// "they play and play") — same per-species shape, just scaled up.
export const YARD_WANDER_MULT = 2.4;

export function pickWanderInterval(speciesKey) {
  const [a, b] = (WANDER[speciesKey] || WANDER.cat).interval;
  return a + Math.random() * (b - a);
}

export function wanderAmplitude(speciesKey, inYard) {
  const amp = (WANDER[speciesKey] || WANDER.cat).amp;
  return inYard ? amp * YARD_WANDER_MULT : amp;
}

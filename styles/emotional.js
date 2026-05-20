/**
 * EMOTIONAL
 * Soft, warm, slightly faded — pastel / golden-hour feel.
 *
 * - Lifted shadows (no true black)
 * - Reduced contrast
 * - Warm red/green push, slight blue desaturation
 * - Micro blur for dreamy softness
 */
module.exports = {
  name: 'emotional',
  description: 'Soft & warm — pastel tones, lifted shadows, dreamy',

  colorFilter: [
    'eq=contrast=0.95:brightness=0.04:saturation=0.80:gamma=1.08',
    // Warm lift: push reds and greens up in shadows, hold blue back
    "curves=r='0/0.06 0.5/0.55 1/1.00':g='0/0.04 0.5/0.51 1/0.98':b='0/0.02 0.5/0.46 1/0.92'",
    // Subtle glow / softness
    'gblur=sigma=0.5',
  ].join(','),
};

/**
 * ANIME
 * High-contrast, vivid, cool-toned — cel-shaded energy.
 *
 * - Crushed blacks, hard contrast
 * - Maximum saturation boost
 * - Cool (blue) push throughout
 * - Strong sharpening to simulate cel lines
 */
module.exports = {
  name: 'anime',
  description: 'Anime style — vivid colors, high contrast, cool-toned, sharp',

  colorFilter: [
    'eq=contrast=1.30:brightness=-0.02:saturation=1.60:gamma=0.90',
    // Cool tint: lift blue shadows, pull red slightly
    "curves=r='0/0 0.2/0.18 0.8/0.82 1/1':g='0/0 0.5/0.50 1/1':b='0/0.04 0.3/0.34 0.8/0.83 1/1'",
    // Strong sharpening — simulates drawn line crispness
    'unsharp=luma_msize_x=3:luma_msize_y=3:luma_amount=1.2',
  ].join(','),
};

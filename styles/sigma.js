/**
 * SIGMA
 * Bold, punchy, high-energy TikTok aesthetic.
 *
 * - Crushed blacks for drama
 * - +20% contrast
 * - +35% saturation
 * - Slight cool shadow lift (blue channel)
 * - Mild sharpening pass
 */
module.exports = {
  name: 'sigma',
  description: 'Bold & punchy — high contrast, saturated, TikTok energy',

  // FFmpeg filter chain — inserted between composite/scale and setpts in the filtergraph
  colorFilter: [
    // Contrast + brightness + saturation + gamma
    'eq=contrast=1.20:brightness=0.02:saturation=1.35:gamma=0.95',
    // RGB curve adjustments: crush blacks, boost mids, cool shadow tint
    "curves=r='0/0 0.08/0.04 0.5/0.52 1/1':g='0/0 0.5/0.50 1/1':b='0/0.03 0.3/0.31 1/1'",
    // Unsharp mask: luma sharpen only, subtle
    'unsharp=luma_msize_x=3:luma_msize_y=3:luma_amount=0.8',
  ].join(','),
};

/**
 * CINEMATIC
 * Classic teal-shadow / warm-highlight film grade.
 *
 * - Slightly desaturated overall
 * - Blue-green pushed into shadows
 * - Warm orange pushed into highlights
 * - Lifted blacks (filmic base)
 * - Soft sharpening
 */
module.exports = {
  name: 'cinematic',
  description: 'Film grade — teal shadows, warm highlights, lifted blacks',

  colorFilter: [
    'eq=contrast=1.10:brightness=-0.01:saturation=0.88:gamma=1.05',
    // Teal shadows (lift blue+green in darks), orange highlights (push red in lights)
    "curves=r='0/0.04 0.3/0.30 0.7/0.73 1/0.97':g='0/0.02 0.3/0.30 0.7/0.70 1/0.97':b='0/0.06 0.3/0.34 0.7/0.66 1/0.93'",
    // Very soft sharpening — cinematic wants texture, not crispness
    'unsharp=luma_msize_x=5:luma_msize_y=5:luma_amount=0.4',
  ].join(','),
};

const sigma     = require('./sigma');
const cinematic = require('./cinematic');
const emotional = require('./emotional');
const anime     = require('./anime');

const STYLES = {
  sigma,
  cinematic,
  emotional,
  anime,
};

/**
 * Load a style by name, falling back to sigma if unknown.
 * @param {string} name
 * @returns {{ name: string, description: string, colorFilter: string }}
 */
function loadStyle(name) {
  const style = STYLES[name?.toLowerCase?.()];
  if (!style) {
    console.warn(`⚠️  Unknown style "${name}" — falling back to sigma`);
    return STYLES.sigma;
  }
  return style;
}

module.exports = { loadStyle, STYLES };

/* global ENV_PREFIX */

/**
 * Get environment variable with optional prefix
 * @param {string} name
 * @param {any} fallback
 */
function env(name, fallback) {
  const prefix = ENV_PREFIX ?? '';
  const prefixed = prefix + name;
  return prefixed in process.env ? process.env[prefixed] : fallback;
}

export { env };

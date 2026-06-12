/**
 * eleventy-plugin-less — CommonJS entry point
 *
 * The ESM core (src/compile.js) is loaded lazily via dynamic import() the
 * first time a build actually runs, so the synchronous plugin registration
 * below works in any CJS Eleventy config file.
 *
 * Usage (.eleventy.js):
 *
 *   const { eleventyLessPlugin } = require('eleventy-plugin-less');
 *
 *   module.exports = function (eleventyConfig) {
 *     eleventyConfig.addPlugin(eleventyLessPlugin, {
 *       builds: [
 *         {
 *           input:  'src/less/**\/*.less',
 *           output: 'dist/css',
 *         },
 *       ],
 *     });
 *   };
 */

'use strict';

/**
 * Cache the ESM module so we only pay the dynamic-import overhead once
 * per process (not once per watched rebuild).
 * @type {Promise<{ compileLess: Function }> | null}
 */
let _corePromise = null;

/**
 * Lazily import the ESM core module and cache the promise.
 * @returns {Promise<{ compileLess: Function }>}
 */
function getCore() {
  if (!_corePromise) {
    // Node ≥ 12.17 supports dynamic import() in CJS modules
    _corePromise = import('./src/compile.js');
  }
  return _corePromise;
}

/**
 * Eleventy plugin that compiles LESS → CSS on every build and watched change.
 *
 * @param {object}  eleventyConfig
 * @param {object}  [options]
 * @param {Array}   [options.builds]            One or more input/output build pairs.
 * @param {boolean} [options.minify=true]       Minify output via CleanCSS level-2.
 * @param {string}  [options.suffix]            Suffix before ".css" (default: ".min" / "").
 * @param {object}  [options.lessOptions]       Options for the `less` renderer.
 * @param {object}  [options.cleanCssOptions]   Options for CleanCSS.
 */
function eleventyLessPlugin(eleventyConfig, options = {}) {
  /** @returns {Promise<void>} */
  async function compile() {
    const { compileLess } = await getCore();
    await compileLess(options);
  }

  // Register every input glob/path as an Eleventy watch target so that
  // changes to .less files trigger a watched rebuild (and thus beforeWatch).
  for (const build of (options.builds ?? [])) {
    const inputs = Array.isArray(build.input) ? build.input : [build.input];
    for (const pattern of inputs) {
      eleventyConfig.addWatchTarget(pattern);
    }
  }

  // Runs once before the initial build
  eleventyConfig.on('eleventy.before', compile);

  // Runs before each incremental rebuild during `--watch` / `--serve`
  eleventyConfig.on('eleventy.beforeWatch', compile);
}

// Support all common CJS import styles:
//   const plugin = require('eleventy-plugin-less')
//   const { eleventyLessPlugin } = require('eleventy-plugin-less')
//   const plugin = require('eleventy-plugin-less').default
module.exports = eleventyLessPlugin;
module.exports.eleventyLessPlugin = eleventyLessPlugin;
module.exports.default = eleventyLessPlugin;

/**
 * eleventy-plugin-less — ESM entry point
 *
 * Hooks into Eleventy's `eleventy.before` and `eleventy.beforeWatch` events
 * to compile LESS files to CSS before each build.
 *
 * Usage (.eleventy.js / eleventy.config.js):
 *
 *   import { eleventyLessPlugin } from 'eleventy-plugin-less';
 *
 *   export default function (eleventyConfig) {
 *     eleventyConfig.addPlugin(eleventyLessPlugin, {
 *       builds: [
 *         {
 *           input:  'src/less/**\/*.less',
 *           output: 'dist/css',
 *         },
 *       ],
 *     });
 *   };
 *
 * @module eleventy-plugin-less
 */

import { compileLess } from './src/compile.js';

/**
 * @typedef {object} BuildEntry
 * @property {string | string[]} input   Glob pattern(s) or file path(s) for LESS sources.
 * @property {string}            output  Output directory for compiled CSS.
 * @property {boolean}  [minify]         Override global minify for this build.
 * @property {string}   [suffix]         Override global suffix for this build.
 * @property {object}   [lessOptions]    Per-build less compiler options (merged with global).
 * @property {object}   [cleanCssOptions] Per-build CleanCSS options (merged with global).
 */

/**
 * @typedef {object} PluginOptions
 * @property {BuildEntry[]} builds             One or more input/output build pairs.
 * @property {boolean}      [minify=true]      Minify output via CleanCSS level-2. Default: true.
 * @property {string}       [suffix]           Suffix inserted before ".css".
 *                                             Defaults to ".min" when minify is true, "" otherwise.
 * @property {object}       [lessOptions]      Options passed to the `less` renderer (global default).
 * @property {object}       [cleanCssOptions]  Options passed to CleanCSS (global default).
 */

/**
 * Eleventy plugin that compiles LESS → CSS on every build and watched change.
 *
 * @param {import('@11ty/eleventy').UserConfig} eleventyConfig
 * @param {PluginOptions} options
 */
export function eleventyLessPlugin(eleventyConfig, options = {}) {
  /** @type {() => Promise<void>} */
  async function compile() {
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

export default eleventyLessPlugin;

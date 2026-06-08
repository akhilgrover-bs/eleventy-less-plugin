/**
 * Type declarations for eleventy-plugin-less
 */

// ---------------------------------------------------------------------------
// Plugin pipeline types
// ---------------------------------------------------------------------------

/**
 * Context object passed to every plugin in the pipeline.
 */
export interface PluginContext {
  /** Absolute path to the LESS source file being compiled. */
  inputFile: string;
  /** Resolved absolute path where the CSS output will be written. */
  outputFile: string;
}

/**
 * A custom CSS transform function.
 * Receives the CSS string from the previous pipeline step and must return
 * a (possibly transformed) CSS string — sync or async.
 *
 * @example
 * async (css, ctx) => {
 *   console.log(`Processing ${ctx.inputFile}`);
 *   return css.replace(/color:\s*red/g, 'color: blue');
 * }
 */
export type TransformFn = (
  css: string,
  context: PluginContext
) => string | Promise<string>;

/**
 * Configuration for the built-in Autoprefixer processor.
 * Requires `postcss` and `autoprefixer` to be installed.
 *
 * @example
 * { use: 'autoprefixer', options: { overrideBrowserslist: ['> 1%', 'last 2 versions'] } }
 */
export interface AutoprefixerPlugin {
  use: 'autoprefixer';
  /**
   * Options forwarded to `autoprefixer()`.
   * @see https://github.com/postcss/autoprefixer#options
   */
  options?: {
    /** Override the Browserslist query string or array. */
    overrideBrowserslist?: string | string[];
    /** Enable/disable grid IE support. Default: false. */
    grid?: boolean | 'autoplace' | 'no-autoplace';
    /** Cascade vendor prefixes. Default: true. */
    cascade?: boolean;
    /** Add vendor prefixes. Default: true. */
    add?: boolean;
    /** Remove outdated vendor prefixes. Default: true. */
    remove?: boolean;
    [key: string]: unknown;
  };
}

/**
 * Configuration for the built-in PurgeCSS processor.
 * Requires `purgecss` to be installed.
 *
 * @example
 * { use: 'purgecss', options: { content: ['./src/**\/*.html', './src/**\/*.js'] } }
 */
export interface PurgeCSSPlugin {
  use: 'purgecss';
  /**
   * Options forwarded to `new PurgeCSS().purge()`.
   * `content` is required — it tells PurgeCSS which files to scan for used selectors.
   * @see https://purgecss.com/configuration.html
   */
  options: {
    /**
     * Files or raw content to scan for used CSS selectors.
     * Accepts glob patterns, file paths, or `{ raw: string, extension: string }` objects.
     */
    content: Array<string | { raw: string; extension: string }>;
    /** CSS selector safelist — these will never be removed. */
    safelist?: Array<string | RegExp | { pattern: RegExp; greedy?: boolean }>;
    /** Block-list — these selectors are always removed even if found in content. */
    blocklist?: Array<string | RegExp>;
    /** Custom extractors per file extension. */
    extractors?: Array<{ extractor: unknown; extensions: string[] }>;
    [key: string]: unknown;
  };
}

/**
 * A plugin pipeline entry — either a named built-in or a custom transform function.
 *
 * Built-ins:
 *   - `'autoprefixer'` — adds vendor prefixes via PostCSS (requires: `postcss autoprefixer`)
 *   - `'purgecss'`     — removes unused CSS selectors (requires: `purgecss`)
 *
 * Custom transforms:
 *   - `async (css, ctx) => newCss` — full control, no extra dependencies
 */
export type PluginEntry = AutoprefixerPlugin | PurgeCSSPlugin | TransformFn;

// ---------------------------------------------------------------------------
// Core options
// ---------------------------------------------------------------------------

/** Subset of less.Options that are most commonly used. */
export interface LessOptions {
  paths?: string[];
  filename?: string;
  sourceMap?: boolean | object;
  quiet?: boolean;
  globalVars?: Record<string, string>;
  modifyVars?: Record<string, string>;
  [key: string]: unknown;
}

/** Subset of CleanCSS options that are most commonly used. */
export interface CleanCSSOptions {
  compatibility?: string;
  level?: {
    1?: Record<string, unknown> | boolean;
    2?: Record<string, unknown> | boolean;
  };
  [key: string]: unknown;
}

/**
 * A single LESS build — one set of inputs compiled to one output directory.
 */
export interface BuildEntry {
  /**
   * Glob pattern(s) or explicit file path(s) to compile.
   *
   * @example 'src/less/**\/*.less'
   * @example ['src/less/main.less', 'src/less/vendor.less']
   */
  input: string | string[];

  /**
   * Output directory for the compiled CSS files.
   * The directory tree under the glob base is preserved.
   *
   * @example 'dist/css'
   */
  output: string;

  /**
   * Override the global `minify` setting for this build only.
   */
  minify?: boolean;

  /**
   * Override the global `suffix` setting for this build only.
   */
  suffix?: string;

  /**
   * CSS processors to run after LESS compilation and before CleanCSS.
   * Appended after any global-level plugins — global plugins run first.
   *
   * @example
   * plugins: [
   *   { use: 'autoprefixer' },
   *   { use: 'purgecss', options: { content: ['./src/**\/*.html'] } },
   *   async (css, ctx) => css.replace(/debug/g, ''),
   * ]
   */
  plugins?: PluginEntry[];

  /**
   * Additional options forwarded to the `less` renderer.
   * Merged on top of the global `lessOptions`.
   */
  lessOptions?: LessOptions;

  /**
   * Additional options forwarded to CleanCSS.
   * Merged on top of the global `cleanCssOptions`.
   */
  cleanCssOptions?: CleanCSSOptions;
}

/**
 * Options accepted by `eleventyLessPlugin`.
 */
export interface PluginOptions {
  /**
   * One or more build entries, each mapping input glob(s) to an output directory.
   */
  builds: BuildEntry[];

  /**
   * Whether to minify the CSS output using CleanCSS level-2 restructuring.
   * Defaults to `true`.
   */
  minify?: boolean;

  /**
   * String inserted between the base filename and `.css`.
   * Defaults to `'.min'` when `minify` is `true`, `''` otherwise.
   *
   * @example '.min'   → button.min.css
   * @example ''       → button.css
   * @example '.build' → button.build.css
   */
  suffix?: string;

  /**
   * Global CSS plugin pipeline — runs for every build entry.
   * Build-level `plugins` are appended after these (global runs first).
   *
   * @example
   * plugins: [
   *   { use: 'autoprefixer', options: { overrideBrowserslist: ['> 1%'] } },
   * ]
   */
  plugins?: PluginEntry[];

  /**
   * Options forwarded to the `less` renderer for every build.
   * Individual builds can override these with their own `lessOptions`.
   */
  lessOptions?: LessOptions;

  /**
   * Options forwarded to CleanCSS for every build.
   * Individual builds can override these with their own `cleanCssOptions`.
   */
  cleanCssOptions?: CleanCSSOptions;
}

// ---------------------------------------------------------------------------
// Plugin function
// ---------------------------------------------------------------------------

/**
 * Eleventy plugin that compiles LESS files to CSS.
 *
 * Pipeline: `less.render()` → plugins → CleanCSS → write
 *
 * Hooks into `eleventy.before` (initial build) and `eleventy.beforeWatch`
 * (incremental rebuilds during `--watch` / `--serve`).
 *
 * @example
 * // ESM
 * import { eleventyLessPlugin } from 'eleventy-plugin-less';
 *
 * export default function(eleventyConfig) {
 *   eleventyConfig.addPlugin(eleventyLessPlugin, {
 *     builds: [
 *       { input: 'src/less/**\/*.less', output: 'dist/css' },
 *     ],
 *     plugins: [
 *       { use: 'autoprefixer' },
 *       { use: 'purgecss', options: { content: ['./src/**\/*.html'] } },
 *     ],
 *   });
 * }
 *
 * @example
 * // CJS
 * const { eleventyLessPlugin } = require('eleventy-plugin-less');
 *
 * module.exports = function(eleventyConfig) {
 *   eleventyConfig.addPlugin(eleventyLessPlugin, {
 *     builds: [
 *       { input: 'src/less/**\/*.less', output: 'dist/css' },
 *     ],
 *   });
 * };
 */
export declare function eleventyLessPlugin(
  eleventyConfig: object,
  options?: PluginOptions
): void;

export default eleventyLessPlugin;

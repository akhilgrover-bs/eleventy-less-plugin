/**
 * Core LESS compilation logic for eleventy-plugin-less.
 *
 * Pipeline per file:
 *   glob resolution
 *     → less.render()
 *     → plugin pipeline  (autoprefixer, purgecss, custom transforms)
 *     → CleanCSS         (compatibility processing + optional minification)
 *     → write output
 */

import less from 'less';
import CleanCSS from 'clean-css';
import fg from 'fast-glob';
import path from 'node:path';
import fs from 'node:fs/promises';
import { runPluginPipeline } from './plugins.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Derive the static (non-magic) prefix of a glob pattern.
 * Used as the base when computing relative output paths.
 *
 * @param {string} pattern
 * @returns {string}
 */
function getGlobBase(pattern) {
  const normalized = pattern.replace(/\\/g, '/');
  const parts = normalized.split('/');
  const base = [];
  for (const part of parts) {
    if (/[*?{}\[\]!]/.test(part)) break;
    base.push(part);
  }
  return base.join('/') || '.';
}

/**
 * Build the CleanCSS options object for a given run.
 *
 * @param {object}  userCleanCssOptions
 * @param {boolean} minify
 * @returns {object}
 */
function buildCleanCssOptions(userCleanCssOptions, minify) {
  return {
    level: {
      1: {
        specialComments: 0,
        all: minify,
      },
      2: minify ? { restructureRules: true } : false,
    },
    compatibility: '*',
    ...userCleanCssOptions,
    returnPromise: true,
  };
}

// ---------------------------------------------------------------------------
// File-level compilation
// ---------------------------------------------------------------------------

/**
 * Compile a single LESS source file and write the CSS output.
 *
 * @param {string} file        Resolved file path
 * @param {string} base        Glob base used to compute the relative output path
 * @param {string} outputDir   Destination directory
 * @param {object} options     Merged plugin + build options
 */
async function compileFile(file, base, outputDir, options) {
  const {
    lessOptions = {},
    cleanCssOptions = {},
    minify = true,
    suffix,
    plugins = [],
  } = options;

  const outputSuffix = suffix !== undefined ? suffix : (minify ? '.min' : '');

  // ------------------------------------------------------------------
  // Resolve output path up-front so plugins receive it in context
  // ------------------------------------------------------------------
  const normalizedFile = file.replace(/\\/g, '/');
  const normalizedBase = base.replace(/\\/g, '/').replace(/\/+$/, '');
  const relative = path.relative(normalizedBase, normalizedFile).replace(/\\/g, '/');
  const withoutExt = relative.replace(/\.less$/i, '');
  const outFileName = `${withoutExt}${outputSuffix}.css`;
  const outPath = path.join(outputDir, outFileName);

  // ------------------------------------------------------------------
  // 1. Read source
  // ------------------------------------------------------------------
  const source = await fs.readFile(file, 'utf8');

  // ------------------------------------------------------------------
  // 2. Compile LESS → CSS
  // ------------------------------------------------------------------
  let css;
  try {
    const lessResult = await less.render(source, {
      ...lessOptions,
      filename: path.resolve(file),
    });
    css = lessResult.css;
  } catch (err) {
    const message = err.message || String(err);
    throw new Error(`[eleventy-plugin-less] LESS compilation failed for "${file}":\n  ${message}`);
  }

  // ------------------------------------------------------------------
  // 3. Plugin pipeline
  //    Runs BEFORE CleanCSS so that:
  //      • Autoprefixer vendor prefixes are present when CleanCSS optimises
  //      • PurgeCSS removes unused rules before minification trims the rest
  //      • Custom transforms work on readable, structured CSS
  // ------------------------------------------------------------------
  if (plugins.length > 0) {
    css = await runPluginPipeline(css, plugins, {
      inputFile: path.resolve(file),
      outputFile: path.resolve(outPath),
    });
  }

  // ------------------------------------------------------------------
  // 4. CleanCSS — compatibility processing + optional minification
  // ------------------------------------------------------------------
  const cleaner = new CleanCSS(buildCleanCssOptions(cleanCssOptions, minify));
  const cleanResult = await cleaner.minify(css);

  if (cleanResult.errors && cleanResult.errors.length > 0) {
    throw new Error(
      `[eleventy-plugin-less] CleanCSS errors in "${file}":\n  ${cleanResult.errors.join('\n  ')}`
    );
  }

  if (cleanResult.warnings && cleanResult.warnings.length > 0) {
    for (const warning of cleanResult.warnings) {
      console.warn(`[eleventy-plugin-less] CleanCSS warning in "${file}": ${warning}`);
    }
  }

  css = cleanResult.styles;

  // ------------------------------------------------------------------
  // 5. Write output (create parent directories as needed)
  // ------------------------------------------------------------------
  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await fs.writeFile(outPath, css, 'utf8');

  console.log(`[eleventy-plugin-less] ${file} → ${outPath}`);
}

// ---------------------------------------------------------------------------
// Build-level processing
// ---------------------------------------------------------------------------

/**
 * Process one build entry: resolve globs, compile every matched file.
 *
 * @param {import('../index.js').BuildEntry} build
 * @param {import('../index.js').PluginOptions} globalOptions
 */
async function processBuild(build, globalOptions) {
  const { input, output } = build;

  if (!input) {
    throw new Error('[eleventy-plugin-less] Each build entry must have an "input" field.');
  }
  if (!output) {
    throw new Error('[eleventy-plugin-less] Each build entry must have an "output" field.');
  }

  const inputs = Array.isArray(input) ? input : [input];

  // Merge options: global ← build-level overrides (build wins)
  // Plugins are concatenated: global plugins run first, then build-level plugins
  const mergedOptions = {
    lessOptions: {
      ...(globalOptions.lessOptions ?? {}),
      ...(build.lessOptions ?? {}),
    },
    cleanCssOptions: {
      ...(globalOptions.cleanCssOptions ?? {}),
      ...(build.cleanCssOptions ?? {}),
    },
    minify: build.minify !== undefined
      ? build.minify
      : (globalOptions.minify !== undefined ? globalOptions.minify : true),
    suffix: build.suffix !== undefined ? build.suffix : globalOptions.suffix,
    // Global plugins run first, then build-specific plugins
    plugins: [
      ...(globalOptions.plugins ?? []),
      ...(build.plugins ?? []),
    ],
  };

  for (const pattern of inputs) {
    const isDynamic = fg.isDynamicPattern(pattern);
    const files = isDynamic
      ? await fg(pattern, { dot: false, onlyFiles: true, unique: true })
      : [pattern];

    if (files.length === 0) {
      console.warn(`[eleventy-plugin-less] No files matched pattern: "${pattern}"`);
      continue;
    }

    const base = isDynamic ? getGlobBase(pattern) : path.dirname(pattern);

    await Promise.all(
      files.map((file) => compileFile(file, base, output, mergedOptions))
    );
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Compile all configured LESS builds.
 * Called by the Eleventy event hooks (before / beforeWatch).
 *
 * @param {import('../index.js').PluginOptions} pluginOptions
 */
export async function compileLess(pluginOptions) {
  const { builds = [] } = pluginOptions;

  if (builds.length === 0) {
    console.warn(
      '[eleventy-plugin-less] No builds configured. ' +
      'Pass a "builds" array to the plugin options.'
    );
    return;
  }

  await Promise.all(builds.map((build) => processBuild(build, pluginOptions)));
}
ap((build) => processBuild(build, pluginOptions)));
}

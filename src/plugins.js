/**
 * Optional CSS plugin pipeline for eleventy-plugin-less.
 *
 * Pipeline position: LESS render → [plugins] → CleanCSS
 *
 * Supported plugin entry shapes:
 *   { use: 'autoprefixer', options: { ... } }  — built-in, requires: postcss autoprefixer
 *   { use: 'purgecss',     options: { ... } }  — built-in, requires: purgecss
 *   async (css, ctx) => css                    — custom transform function
 */

// ---------------------------------------------------------------------------
// Dynamic-import helpers with friendly install-error messages
// ---------------------------------------------------------------------------

async function requirePostcss() {
  try {
    const [{ default: postcss }, { default: autoprefixer }] = await Promise.all([
      import('postcss'),
      import('autoprefixer'),
    ]);
    return { postcss, autoprefixer };
  } catch {
    throw new Error(
      '[eleventy-plugin-less] The "autoprefixer" plugin requires two packages that are not installed:\n' +
      '  npm install postcss autoprefixer\n' +
      'These are optional peer dependencies — install them only when you use this plugin.'
    );
  }
}

async function requirePurgeCss() {
  try {
    const { PurgeCSS } = await import('purgecss');
    return PurgeCSS;
  } catch {
    throw new Error(
      '[eleventy-plugin-less] The "purgecss" plugin requires a package that is not installed:\n' +
      '  npm install purgecss\n' +
      'This is an optional peer dependency — install it only when you use this plugin.'
    );
  }
}

// ---------------------------------------------------------------------------
// Built-in processor implementations
// ---------------------------------------------------------------------------

/**
 * Run Autoprefixer via PostCSS.
 * Adds vendor prefixes based on Browserslist config or the `overrideBrowserslist` option.
 *
 * @param {string} css
 * @param {object} options  Autoprefixer options
 * @returns {Promise<string>}
 */
async function runAutoprefixer(css, options) {
  const { postcss, autoprefixer } = await requirePostcss();
  const result = await postcss([autoprefixer(options)]).process(css, {
    // Suppress "no `from` option" PostCSS warning — source maps are
    // not produced here, so the warning is noise.
    from: undefined,
  });

  // Surface any PostCSS warnings as console warnings
  result.messages
    .filter((m) => m.type === 'warning')
    .forEach((m) => console.warn(`[eleventy-plugin-less] Autoprefixer: ${m.text}`));

  return result.css;
}

/**
 * Run PurgeCSS to strip unused selectors.
 * `options.content` must be provided — it tells PurgeCSS which HTML/JS files to scan.
 *
 * @param {string} css
 * @param {object} options  PurgeCSS options (content is required)
 * @param {object} context  { inputFile, outputFile }
 * @returns {Promise<string>}
 */
async function runPurgeCss(css, options, context) {
  if (!options.content || (Array.isArray(options.content) && options.content.length === 0)) {
    throw new Error(
      `[eleventy-plugin-less] PurgeCSS requires a "content" array of file globs to scan for used selectors.\n` +
      `  Example: { use: 'purgecss', options: { content: ['./src/**/*.html', './src/**/*.js'] } }\n` +
      `  Affected file: "${context.inputFile}"`
    );
  }

  const PurgeCSS = await requirePurgeCss();
  const results = await new PurgeCSS().purge({
    ...options,
    css: [{ raw: css }],
  });

  if (!results || results.length === 0) {
    console.warn(`[eleventy-plugin-less] PurgeCSS returned no output for "${context.inputFile}"`);
    return css;
  }

  return results[0].css;
}

// ---------------------------------------------------------------------------
// Dispatcher
// ---------------------------------------------------------------------------

/**
 * Run a single built-in plugin by name.
 *
 * @param {string} name
 * @param {string} css
 * @param {object} options
 * @param {object} context  { inputFile, outputFile }
 * @returns {Promise<string>}
 */
async function runBuiltinPlugin(name, css, options, context) {
  switch (name) {
    case 'autoprefixer':
      return runAutoprefixer(css, options);

    case 'purgecss':
      return runPurgeCss(css, options, context);

    default:
      throw new Error(
        `[eleventy-plugin-less] Unknown built-in plugin: "${name}".\n` +
        `  Supported built-ins: "autoprefixer", "purgecss".\n` +
        `  For other processors, pass an async function: async (css, ctx) => transformedCss`
      );
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * @typedef {object} PluginContext
 * @property {string} inputFile   Absolute path to the LESS source file being compiled.
 * @property {string} outputFile  Resolved output path for the CSS file.
 */

/**
 * Pass compiled CSS through the configured plugin pipeline.
 * Each plugin receives the CSS string produced by the previous step.
 *
 * @param {string} css
 * @param {Array<object|Function>} plugins
 * @param {PluginContext} context
 * @returns {Promise<string>}
 */
export async function runPluginPipeline(css, plugins, context) {
  if (!plugins || plugins.length === 0) return css;

  let result = css;

  for (const plugin of plugins) {
    if (typeof plugin === 'function') {
      // Custom async (or sync) transform function
      result = await plugin(result, context);

      if (typeof result !== 'string') {
        throw new Error(
          `[eleventy-plugin-less] A custom plugin function must return a string.\n` +
          `  Received: ${typeof result}\n` +
          `  Affected file: "${context.inputFile}"`
        );
      }
    } else if (plugin && typeof plugin === 'object' && typeof plugin.use === 'string') {
      result = await runBuiltinPlugin(
        plugin.use,
        result,
        plugin.options ?? {},
        context
      );
    } else {
      throw new Error(
        `[eleventy-plugin-less] Invalid plugin entry.\n` +
        `  Expected: { use: 'autoprefixer' | 'purgecss', options?: {} } or async (css, ctx) => css\n` +
        `  Received: ${JSON.stringify(plugin)}`
      );
    }
  }

  return result;
}

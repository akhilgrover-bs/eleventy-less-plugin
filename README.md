# eleventy-plugin-less

An [Eleventy](https://www.11ty.dev/) plugin that compiles [LESS](https://lesscss.org/) files to CSS before every build and watched rebuild. Supports multiple input/output pairs, an optional CSS plugin pipeline (Autoprefixer, PurgeCSS, or custom transforms), CleanCSS compatibility processing, minification, and custom output naming.

## Features

- Hooks into `eleventy.before` and `eleventy.beforeWatch` — runs before every build and live-reload
- Multiple independent build entries (glob patterns or explicit paths)
- LESS compilation via the official `less` package — `@import`, variables, mixins, nesting all work
- Optional CSS plugin pipeline: **Autoprefixer**, **PurgeCSS**, or any custom async transform
- CleanCSS pass for cross-browser compatibility on every output
- Optional minification (CleanCSS level-2 restructuring) — on by default
- Configurable output suffix (`.min.css`, `.css`, or anything else)
- Preserves subdirectory structure relative to the glob base
- Dual CommonJS / ESM package — works in `.eleventy.js` and `eleventy.config.js`
- Full TypeScript declarations included

## Installation

```sh
npm install eleventy-plugin-less
```

Install optional peer dependencies only for the plugins you use:

```sh
# Autoprefixer (vendor prefixes)
npm install postcss autoprefixer

# PurgeCSS (remove unused selectors)
npm install purgecss
```

## Quick start

### ESM config (`eleventy.config.js`)

```js
import { eleventyLessPlugin } from 'eleventy-plugin-less';

export default function (eleventyConfig) {
  eleventyConfig.addPlugin(eleventyLessPlugin, {
    builds: [
      {
        input:  'src/less/**/*.less',
        output: 'dist/css',
      },
    ],
  });
};
```

### CommonJS config (`.eleventy.js`)

```js
const { eleventyLessPlugin } = require('eleventy-plugin-less');

module.exports = function (eleventyConfig) {
  eleventyConfig.addPlugin(eleventyLessPlugin, {
    builds: [
      {
        input:  'src/less/**/*.less',
        output: 'dist/css',
      },
    ],
  });
};
```

## Build pipeline

Each file passes through this pipeline in order:

```
less.render()  →  [plugins]  →  CleanCSS  →  write output
```

Plugins run **before** CleanCSS so that:
- Autoprefixer vendor prefixes are present when CleanCSS optimises
- PurgeCSS removes unused rules before minification trims the rest
- Custom transforms work on readable, structured CSS

## Options

### Top-level options

| Option | Type | Default | Description |
|---|---|---|---|
| `builds` | `BuildEntry[]` | **required** | One or more input/output build pairs (see below). |
| `minify` | `boolean` | `true` | Minify output with CleanCSS level-2 restructuring. |
| `suffix` | `string` | `'.min'` / `''` | String inserted before `.css`. Defaults to `'.min'` when `minify` is `true`, `''` otherwise. |
| `plugins` | `PluginEntry[]` | `[]` | Global plugin pipeline — runs for every build. Build-level plugins append after these. |
| `lessOptions` | `object` | `{}` | Options forwarded to the `less` renderer. Applied to all builds. |
| `cleanCssOptions` | `object` | `{}` | Options forwarded to CleanCSS. Applied to all builds. |

### `BuildEntry` options

| Option | Type | Default | Description |
|---|---|---|---|
| `input` | `string \| string[]` | **required** | Glob pattern(s) or file path(s) to compile. |
| `output` | `string` | **required** | Output directory for compiled CSS. |
| `minify` | `boolean` | *(global)* | Override the global `minify` for this build. |
| `suffix` | `string` | *(global)* | Override the global `suffix` for this build. |
| `plugins` | `PluginEntry[]` | `[]` | Additional plugins for this build only — appended after global plugins. |
| `lessOptions` | `object` | *(global)* | Merged on top of global `lessOptions`. |
| `cleanCssOptions` | `object` | *(global)* | Merged on top of global `cleanCssOptions`. |

## Plugin pipeline

The `plugins` array accepts three types of entry — they can be mixed freely and run in order.

### Built-in: `autoprefixer`

Adds vendor prefixes using [Autoprefixer](https://github.com/postcss/autoprefixer) via PostCSS.

**Requires:** `npm install postcss autoprefixer`

```js
eleventyConfig.addPlugin(eleventyLessPlugin, {
  builds: [{ input: 'src/less/**/*.less', output: 'dist/css' }],
  plugins: [
    {
      use: 'autoprefixer',
      options: {
        overrideBrowserslist: ['> 1%', 'last 2 versions', 'not dead'],
      },
    },
  ],
});
```

`options` is passed directly to `autoprefixer()`. Omit it entirely to use your project's [Browserslist](https://browsersl.ist/) config.

### Built-in: `purgecss`

Removes unused CSS selectors by scanning your HTML and JS files using [PurgeCSS](https://purgecss.com/).

**Requires:** `npm install purgecss`

```js
eleventyConfig.addPlugin(eleventyLessPlugin, {
  builds: [{ input: 'src/less/**/*.less', output: 'dist/css' }],
  plugins: [
    {
      use: 'purgecss',
      options: {
        content: ['./src/**/*.html', './src/**/*.js'],
        safelist: ['active', 'is-open', /^js-/],
      },
    },
  ],
});
```

`options` is passed directly to `new PurgeCSS().purge()`. `content` is **required**.

### Custom transform function

Pass an `async (css, ctx) => css` function for any other processor or ad-hoc transformation. The function receives the CSS string from the previous step and must return a string.

```js
eleventyConfig.addPlugin(eleventyLessPlugin, {
  builds: [{ input: 'src/less/**/*.less', output: 'dist/css' }],
  plugins: [
    // Strip debug comments
    async (css, ctx) => css.replace(/\/\*\s*DEBUG[\s\S]*?\*\//g, ''),

    // Critical CSS extraction with the `critical` package
    async (css, ctx) => {
      const { generate } = await import('critical');
      const result = await generate({
        base: 'dist/',
        src: 'index.html',
        css: [{ raw: css }],
        inline: false,
      });
      return result.css;
    },
  ],
});
```

The `ctx` object exposes:
- `ctx.inputFile` — absolute path to the LESS source file
- `ctx.outputFile` — resolved absolute path of the CSS output file

### Mixing plugins

Plugins compose in order. This example applies autoprefixer first, purges unused selectors second, then strips any remaining `@charset` rules with a custom function:

```js
plugins: [
  { use: 'autoprefixer' },
  {
    use: 'purgecss',
    options: { content: ['./src/**/*.html'] },
  },
  async (css) => css.replace(/@charset[^;]+;/g, ''),
]
```

### Per-build plugins

Global `plugins` run for every build. Build-level `plugins` are **appended after** the global ones:

```js
eleventyConfig.addPlugin(eleventyLessPlugin, {
  // Autoprefixer runs for every build
  plugins: [
    { use: 'autoprefixer' },
  ],
  builds: [
    {
      input: 'src/less/**/*.less',
      output: 'dist/css',
      // PurgeCSS only for this build (runs after autoprefixer)
      plugins: [
        { use: 'purgecss', options: { content: ['./src/**/*.html'] } },
      ],
    },
    {
      input: 'src/less/email.less',
      output: 'dist/email',
      // No PurgeCSS here — email CSS needs all selectors
    },
  ],
});
```

## Output path rules

The output filename is derived from the source path relative to the **glob base** (the longest non-wildcard prefix of the pattern).

| Input pattern | Source file | Output dir | Minify | Output file |
|---|---|---|---|---|
| `src/less/**/*.less` | `src/less/components/button.less` | `dist/css` | `true` | `dist/css/components/button.min.css` |
| `src/less/**/*.less` | `src/less/main.less` | `dist/css` | `false` | `dist/css/main.css` |
| `src/less/main.less` | `src/less/main.less` | `dist/css` | `true` | `dist/css/main.min.css` |

## More examples

### Multiple builds

```js
eleventyConfig.addPlugin(eleventyLessPlugin, {
  builds: [
    // Application styles — autoprefixed and minified
    {
      input:  'src/less/**/*.less',
      output: 'dist/css',
      plugins: [{ use: 'autoprefixer' }],
    },
    // Vendor styles — compatibility pass only, not minified
    {
      input:  'src/vendor/bootstrap/bootstrap.less',
      output: 'dist/css/vendor',
      minify: false,
    },
  ],
});
```

### Custom suffix

```js
eleventyConfig.addPlugin(eleventyLessPlugin, {
  builds: [{ input: 'src/less/**/*.less', output: 'dist/css' }],
  minify: true,
  suffix: '',  // Outputs: main.css, components/nav.css
});
```

### Passing LESS variables at build time

```js
eleventyConfig.addPlugin(eleventyLessPlugin, {
  builds: [{ input: 'src/less/**/*.less', output: 'dist/css' }],
  lessOptions: {
    modifyVars: {
      'primary-color': '#e74c3c',
    },
  },
});
```

### Targeting older browsers

```js
eleventyConfig.addPlugin(eleventyLessPlugin, {
  builds: [{ input: 'src/less/**/*.less', output: 'dist/css' }],
  plugins: [
    { use: 'autoprefixer', options: { overrideBrowserslist: ['ie >= 9'] } },
  ],
  cleanCssOptions: {
    compatibility: 'ie9',
  },
});
```

## Dependencies

| Package | Role |
|---|---|
| [`less`](https://www.npmjs.com/package/less) | LESS → CSS compilation |
| [`clean-css`](https://www.npmjs.com/package/clean-css) | Compatibility processing and minification |
| [`fast-glob`](https://www.npmjs.com/package/fast-glob) | Glob pattern resolution |

**Optional peer dependencies** (install only what you use):

| Package | Required for |
|---|---|
| [`postcss`](https://www.npmjs.com/package/postcss) + [`autoprefixer`](https://www.npmjs.com/package/autoprefixer) | `{ use: 'autoprefixer' }` |
| [`purgecss`](https://www.npmjs.com/package/purgecss) | `{ use: 'purgecss' }` |

## License

MIT

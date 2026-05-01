import { build, context } from 'esbuild';
import { copyFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const desktopRoot = path.dirname(fileURLToPath(import.meta.url));
const distRoot = path.join(desktopRoot, 'dist');
const rendererDist = path.join(distRoot, 'renderer');
const watch = process.argv.includes('--watch');

const shared = {
  bundle: true,
  sourcemap: watch,
  minify: !watch,
  logLevel: 'info',
  legalComments: 'none'
};

const builds = [
  {
    ...shared,
    entryPoints: [path.join(desktopRoot, 'src/main/main.ts')],
    outfile: path.join(distRoot, 'main/main.cjs'),
    platform: 'node',
    format: 'cjs',
    external: ['electron']
  },
  {
    ...shared,
    entryPoints: [path.join(desktopRoot, 'src/preload/preload.ts')],
    outfile: path.join(distRoot, 'preload/preload.cjs'),
    platform: 'node',
    format: 'cjs',
    external: ['electron']
  },
  {
    ...shared,
    entryPoints: [path.join(desktopRoot, 'src/renderer/index.tsx')],
    outdir: rendererDist,
    platform: 'browser',
    format: 'esm',
    entryNames: 'index',
    loader: {
      '.css': 'css',
      '.ttf': 'dataurl',
      '.woff': 'dataurl',
      '.woff2': 'dataurl'
    }
  }
];

async function writeRendererShell() {
  await mkdir(rendererDist, { recursive: true });
  await copyFile(path.join(desktopRoot, 'media/hero.svg'), path.join(rendererDist, 'hero.svg'));
  await writeFile(
    path.join(rendererDist, 'index.html'),
    `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <link rel="stylesheet" href="./index.css" />
    <title>RepoFlow</title>
  </head>
  <body>
    <div id="root"></div>
    <script>
      window.__REPOFLOW_ASSETS__ = { hero: './hero.svg' };
    </script>
    <script type="module" src="./index.js"></script>
  </body>
</html>
`,
    'utf8'
  );
}

if (watch) {
  const contexts = await Promise.all(builds.map((options) => context(options)));
  await Promise.all(contexts.map((ctx) => ctx.watch()));
  await writeRendererShell();
  console.log('Watching RepoFlow desktop bundles...');
  await new Promise(() => undefined);
} else {
  await Promise.all(builds.map((options) => build(options)));
  await writeRendererShell();
}

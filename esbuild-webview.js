const esbuild = require('esbuild');

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');
const panels = ['health', 'debug', 'a2a', 'info', 'session', 'task'];

function createOptions(panel) {
  return {
    entryPoints: [`webview-ui/src/${panel}/App.tsx`],
    bundle: true,
    format: 'esm',
    minify: production,
    sourcemap: !production,
    sourcesContent: false,
    outfile: `dist/webview/${panel}/index.js`,
    define: {
      'process.env.NODE_ENV': production ? '"production"' : '"development"',
    },
    logLevel: 'warning',
  };
}

async function buildPanel(panel) {
  if (!watch) {
    await esbuild.build(createOptions(panel));
    return;
  }

  const ctx = await esbuild.context(createOptions(panel));
  await ctx.watch();
}

Promise.all(panels.map((panel) => buildPanel(panel))).catch((error) => {
  console.error(error);
  process.exit(1);
});

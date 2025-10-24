import { build } from 'esbuild';

build({
  entryPoints: ['./index.ts'],
  format: ["cjs"],
  bundle: true,
  platform: 'node',
  target: 'node20',
  outfile: './dist/index.js',
  minify: true,
  sourcemap: false,
  external: []
}).catch(() => process.exit(1));

// Post-build step: gzip every emitted asset and write a manifest the
// firmware reads to know what assets exist. ESPAsyncWebServer's static
// handler will serve /foo.js when only /foo.js.gz exists, as long as
// the request includes Accept-Encoding: gzip — every modern browser
// does.
import { gzipSync } from 'node:zlib';
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { build as esbuild } from 'vite';

const DIST = path.resolve('../firmware/data');

// 1. Compile the service worker as a standalone IIFE bundle.
await esbuild({
  configFile: false,
  build: {
    outDir: DIST,
    emptyOutDir: false,
    lib: {
      entry: path.resolve('src/service-worker.ts'),
      name: 'sw',
      formats: ['iife'],
      fileName: () => 'sw.js',
    },
    rollupOptions: { output: { extend: true } },
    minify: true,
  },
  logLevel: 'silent',
});

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(p));
    else                      out.push(p);
  }
  return out;
}

if (!existsSync(DIST)) {
  console.error('build.mjs: dist dir missing — did vite build run?');
  process.exit(1);
}

const COMPRESSIBLE = /\.(js|css|html|svg|json|webmanifest|map|txt)$/;
const files = walk(DIST);
const manifest = { files: [], total_gz: 0, total_raw: 0 };

for (const f of files) {
  if (f.endsWith('.gz')) continue;  // re-run safety
  const buf = readFileSync(f);
  manifest.total_raw += buf.length;
  if (COMPRESSIBLE.test(f)) {
    const gz = gzipSync(buf, { level: 9 });
    writeFileSync(f + '.gz', gz);
    manifest.total_gz += gz.length;
    manifest.files.push({
      path: '/' + path.relative(DIST, f).replace(/\\/g, '/'),
      raw: buf.length,
      gz: gz.length,
    });
  } else {
    manifest.total_gz += buf.length;
    manifest.files.push({
      path: '/' + path.relative(DIST, f).replace(/\\/g, '/'),
      raw: buf.length,
      gz: buf.length,
    });
  }
}

writeFileSync(path.join(DIST, 'manifest.json'), JSON.stringify(manifest, null, 2));

const kb = (n) => (n / 1024).toFixed(1) + ' KB';
console.log(`build.mjs: ${manifest.files.length} files`);
console.log(`  raw: ${kb(manifest.total_raw)}, gzipped: ${kb(manifest.total_gz)}`);
const TARGET_KB = 120;
if (manifest.total_gz > TARGET_KB * 1024) {
  console.warn(`  ⚠ over ${TARGET_KB}KB target — investigate before shipping`);
}

// Builds cms/.vercel/output (Vercel Build Output API) for `vercel deploy --prebuilt`: one Node function holding the
// bundled server, the built admin UI and the website sources the Publish build needs. Run from cms/: npm run vercel-build
import { build } from 'esbuild';
import { cpSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const cms = join(dirname(fileURLToPath(import.meta.url)), '..');
const site = join(cms, '..');
const out = join(cms, '.vercel/output');
const fn = join(out, 'functions/index.func');

execSync('npm run build', { cwd: cms, stdio: 'inherit' });
rmSync(out, { recursive: true, force: true });
mkdirSync(fn, { recursive: true });

// The server keeps its cms/ layout (cmsRoot = two levels above server/src) so dist/client and migrations resolve as locally.
await build({
  entryPoints: [join(cms, 'server/src/vercel.ts')],
  outfile: join(fn, 'cms/server/src/vercel.mjs'),
  bundle: true, platform: 'node', format: 'esm', target: 'node22',
  external: ['pg-native'],
  banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
});
cpSync(join(cms, 'server/src/migrations'), join(fn, 'cms/server/src/migrations'), { recursive: true });
cpSync(join(cms, 'dist/client'), join(fn, 'cms/dist/client'), { recursive: true });
for (const d of ['scripts', 'src', 'content', 'public']) cpSync(join(site, d), join(fn, d), { recursive: true });
cpSync(join(site, 'package.json'), join(fn, 'package.json'));

writeFileSync(join(fn, '.vc-config.json'), JSON.stringify({ runtime: 'nodejs22.x', handler: 'cms/server/src/vercel.mjs', launcherType: 'Nodejs', shouldAddHelpers: false, maxDuration: 300, memory: 2048, regions: ['hnd1'] }, null, 2));
writeFileSync(join(out, 'config.json'), JSON.stringify({ version: 3, routes: [{ src: '/(.*)', dest: '/index' }] }, null, 2));
console.log(`Wrote ${out}`);

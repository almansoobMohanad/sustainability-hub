import { defineConfig } from 'tsdown'

/*
  The API as one Vercel function (src/vercel.ts), bundled with every package
  it uses into dist-vercel/ like the normal build (tsdown.config.ts). No
  migrations or seed files: on Vercel those run in the build (tools/migrate.ts),
  never inside the function. tools/vercel-output.ts then packages it for Vercel.
*/
export default defineConfig({
  entry: { index: 'src/vercel.ts' },
  outDir: 'dist-vercel',
  format: 'esm',
  platform: 'node',
  // The commit being built, for /api/health (src/version.ts): tsdown replaces process.env.HUB_VERSION in the code; empty = unknown
  env: { HUB_VERSION: process.env.HUB_VERSION ?? '' },
  deps: {
    alwaysBundle: [/./],
    onlyBundle: false,
  },
})

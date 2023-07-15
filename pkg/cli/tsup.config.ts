import { defineConfig } from 'tsup'

export default defineConfig(options => ({
  entry: [
    'src/index.ts',
  ],
  format: [
    'esm',
  ],
  outExtension: () => ({ js: '.mjs' }),
  target: 'esnext',
  dts: false,
  sourcemap: !!options.watch,
  clean: true,
  treeshake: true,
}))

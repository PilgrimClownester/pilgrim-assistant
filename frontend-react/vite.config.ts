import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import electron from 'vite-plugin-electron';

export default defineConfig(({ mode }) => {
  const plugins: ReturnType<typeof react>[] = [react()];

  if (mode !== 'web') {
    plugins.push(
      electron([
        {
          entry: 'electron/main.ts',
          vite: {
            build: {
              outDir: 'dist-electron',
              rollupOptions: {
                external: ['electron'],
              },
            },
          },
        },
        {
          entry: 'electron/preload.ts',
          onstart(args) {
            args.reload();
          },
        },
      ]),
    );
  }

  return {
    plugins,
    server: {
      port: 5173,
      strictPort: true,
    },
    build: {
      outDir: 'dist',
    },
  };
});

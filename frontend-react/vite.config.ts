import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import electron from 'vite-plugin-electron';

export default defineConfig(({ mode }) => {
  const plugins: ReturnType<typeof react>[] = [react()];
  const apiProxyTarget = process.env.FIREFLY_PROXY_TARGET || 'http://127.0.0.1:8000';

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
          onstart(args) {
            args.reload();
          },
          vite: {
            build: {
              outDir: 'dist-electron',
              rollupOptions: {
                input: 'electron/preload.ts',
                external: ['electron'],
                output: {
                  format: 'cjs',
                  inlineDynamicImports: true,
                  entryFileNames: 'preload.cjs',
                },
              },
            },
          },
        },
      ]),
    );
  }

  return {
    plugins,
    // 桌面端和蒲公英网页版会并行启动。它们使用不同 mode，必须隔离
    // dependency optimizer 缓存，否则其中一端重建依赖时会让另一端
    // 已生成的 URL 立刻变成 504 Outdated Optimize Dep，表现为纯白页。
    cacheDir: mode === 'web' ? 'node_modules/.vite-web' : 'node_modules/.vite-desktop',
    server: {
      port: 5173,
      strictPort: true,
      proxy: {
        // 手机调试时让浏览器只访问 Vite，由电脑本机转发 API。
        // 桌面版仍使用 VITE_FIREFLY_API_BASE 指向本机后端，不受影响。
        '/api': {
          target: apiProxyTarget,
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api/, ''),
        },
      },
    },
    build: {
      outDir: 'dist',
    },
  };
});

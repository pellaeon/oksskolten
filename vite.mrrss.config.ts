import path from 'path'
import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import pkg from './package.json'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const port = Number(env.VITE_MRRSS_PORT || 5174)

  return {
    root: path.resolve(__dirname, 'mrrss'),
    publicDir: path.resolve(__dirname, 'public'),
    plugins: [vue()],
    resolve: {
      alias: {
        '@mrrss': path.resolve(__dirname, 'mrrss/src'),
      },
    },
    define: {
      __APP_VERSION__: JSON.stringify(pkg.version),
    },
    server: {
      host: '0.0.0.0',
      port,
      watch: env.CHOKIDAR_USEPOLLING === 'true'
        ? { usePolling: true, interval: 300 }
        : undefined,
      proxy: {
        '/api': env.VITE_API_PROXY_TARGET || 'http://127.0.0.1:3000',
      },
    },
    build: {
      outDir: path.resolve(__dirname, 'dist-mrrss'),
      emptyOutDir: true,
    },
  }
})

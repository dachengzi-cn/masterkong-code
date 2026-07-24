import path from 'path';
import { defineConfig } from '@lark-apaas/fullstack-vite-preset';

/**
 * 拦截 devtool-kits 的日志收集 POST 端点 /dev/logs/collect*，直接返回 204。
 * 避免 devtool-kits 内部 body-parser 的 100kb 限制触发 "request entity too large"。
 * GET 请求（查看日志/trace）不受影响，正常放行。
 */
function interceptDevLogsPlugin() {
  return {
    name: 'intercept-dev-logs',
    configureServer(server: any) {
      server.middlewares.use((req: any, res: any, next: any) => {
        if (
          req.method === 'POST' &&
          req.url &&
          (req.url.startsWith('/dev/logs/collect') || req.url.includes('collect-batch'))
        ) {
          res.statusCode = 204;
          res.end();
          return;
        }
        next();
      });
    },
  };
}

/**
 * 本地开发环境下，SDK 的 getAppPublished() 会请求 /get_published 端点，
 * 该端点在本地无对应后端，Nest SPA fallback 返回 index.html 导致 JSON 解析失败。
 * 这里拦截该路径，返回有效 JSON，避免控制台报错。
 */
function mockGetPublishedPlugin() {
  return {
    name: 'mock-get-published',
    configureServer(server: any) {
      server.middlewares.use((req: any, res: any, next: any) => {
        const url = req.url || '';
        if (req.method === 'GET' && url.includes('get_published')) {
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.end(JSON.stringify({ code: 0, data: { app_info: {}, app_runtime_extra: {} } }));
          return;
        }
        next();
      });
    },
  };
}

function disableMonitoringPlugin() {
  return {
    name: 'disable-monitoring',
    transformIndexHtml(html: string) {
      const patterns = [
        'mon.zijieapi.com',
        'slardar',
        'KSlardarWeb',
        'performance.iife.js',
        'collectEvent',
        'lf3-cdn-tos.bytescm.com',
        'lf3-short.ibytedapm.com',
        'sf3-scmcdn-cn.feishucdn.com',
        'dev/logs/collect',
      ];

      // 移除包含监控脚本的 script 标签
      let result = html.replace(/<script[^>]*>([\s\S]*?)<\/script>/gi, (match) => {
        if (patterns.some((p) => match.includes(p))) {
          return '';
        }
        return match;
      });

      // 移除内联的监控初始化代码
      result = result.replace(/<script[^>]*>[\s\S]*?(slardar|collectEvent|monitor)[\s\S]*?<\/script>/gi, '');

      return result;
    },
    // 在模块转换时注入禁用代码并修复环境变量
    transform(code: string, id: string) {
      let modified = false;
      let result = code;

      // 替换所有 process.env.CLIENT_BASE_PATH 为空字符串，避免生成协议相对 URL
      if (result.includes('process.env.CLIENT_BASE_PATH')) {
        result = result.replace(/process\.env\.CLIENT_BASE_PATH/g, '""');
        modified = true;
      }

      if (id.includes('client-toolkit') || id.includes('auth-sdk')) {
        // 在 SDK 模块顶部注入禁用代码
        const disableCode = `
          if (typeof window !== 'undefined') {
            window.slardar = { captureException: () => {}, init: () => {} };
            window.collectEvent = () => {};
          }
        `;
        result = disableCode + result;
        modified = true;
      }

      return modified ? { code: result, map: null } : null;
    },
  };
}

const config = defineConfig({
  define: {
    'process.env.CLIENT_BASE_PATH': JSON.stringify(''),
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'client/src'),
      '@client': path.resolve(__dirname, 'client'),
      '@shared': path.resolve(__dirname, 'shared'),
    },
  },
  optimizeDeps: {
    esbuildOptions: {
      define: {
        'process.env.CLIENT_BASE_PATH': '""',
      },
    },
  },
  build: {
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          'vendor-echarts': ['echarts', 'echarts-for-react'],
          'vendor-recharts': ['recharts'],
          'vendor-xlsx': ['xlsx-js-style'],
          'vendor-radix': [
            'radix-ui',
            '@radix-ui/react-dialog',
            '@radix-ui/react-select',
            '@radix-ui/react-dropdown-menu',
            '@radix-ui/react-checkbox',
            '@radix-ui/react-popover',
            '@radix-ui/react-tooltip',
          ],
          'vendor-tiptap': [
            '@tiptap/core',
            '@tiptap/react',
            '@tiptap/starter-kit',
          ],
        },
      },
    },
  },
  server: {
    host: '127.0.0.1',
    port: 8080,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3000',
        changeOrigin: true,
      },
      '/app/demo-app-local/api': {
        target: 'http://127.0.0.1:3000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/app\/demo-app-local\/api/, '/api'),
      },
      '/spark/app/demo-app-local/runtime/api': {
        target: 'http://127.0.0.1:3000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/spark\/app\/demo-app-local\/runtime\/api/, '/api'),
      },
      '/app/demo-app-local/__runtime__': {
        target: 'http://127.0.0.1:3000',
        changeOrigin: true,
      },
      '/app//__runtime__': {
        target: 'http://127.0.0.1:3000',
        changeOrigin: true,
      },
      '/dev/logs': {
        target: 'http://127.0.0.1:3000',
        changeOrigin: true,
      },
    },
  },
});

// 先注册拦截插件（unshift 确保它在 preset 内置插件之前执行，抢先处理请求）
if (config.plugins) {
  config.plugins.unshift(interceptDevLogsPlugin(), mockGetPublishedPlugin());
  config.plugins.push(disableMonitoringPlugin());
} else {
  config.plugins = [interceptDevLogsPlugin(), mockGetPublishedPlugin(), disableMonitoringPlugin()];
}

export default config;

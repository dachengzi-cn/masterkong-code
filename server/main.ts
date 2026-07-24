import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { configureApp } from '@lark-apaas/fullstack-nestjs-core';
import { join } from 'path';
import { __express as hbsExpressEngine } from 'hbs';
import compression from 'compression';

import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    abortOnError: process.env.NODE_ENV === 'production',
  });
  const logger = new Logger('Bootstrap');
  const host = process.env.SERVER_HOST || '::';
  const port = Number(process.env.SERVER_PORT || '3000');

  // 启用 Gzip 压缩，超过 1KB 的响应体进行压缩
  app.use(compression({ threshold: 1024 }));

  const isDevelopment = process.env.NODE_ENV !== 'production';

  if (isDevelopment) {
    try {
      const { createProxyMiddleware } = await import('http-proxy-middleware');
      const clientDevHost = process.env.CLIENT_DEV_HOST || '127.0.0.1';
      const clientDevPort = Number(process.env.CLIENT_DEV_PORT || '8080');
      const proxyTarget = `http://${clientDevHost}:${clientDevPort}`;

      const viteProxy = createProxyMiddleware({
        target: proxyTarget,
        changeOrigin: true,
        ws: true,
        on: {
          error: (err: any, _req: any, res: any) => {
            if (res && typeof res.status === 'function' && !res.headersSent) {
              res.status(502).send('Vite dev server not available');
            } else if (res && typeof res.writeHead === 'function' && !res.headersSent) {
              res.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' });
              res.end('Vite dev server not available');
            }
          },
        },
      });

      const expressApp = app.getHttpAdapter().getInstance() as any;

      // 代理 Vite 资源请求；页面路由和 API 由 Nest 自行处理。
      // 关键：任何带文件扩展名的请求都是静态资源，必须代理到 Vite，
      // 否则会落到 Nest @Get('*') SPA fallback 返回 HTML，触发 MIME 类型错误。
      expressApp.use((req: any, res: any, next: any) => {
        const url = req.url || '';
        const pathname = url.split('?')[0];

        const isViteAsset =
          pathname.startsWith('/@') ||
          pathname.startsWith('/@vite/') ||
          pathname.startsWith('/client/') ||
          pathname.startsWith('/node_modules/') ||
          pathname.startsWith('/shared/') ||
          pathname.startsWith('/src/');

        // 任何带文件扩展名的路径都视为静态资源
        const hasExtension = /\.[a-zA-Z0-9]+$/.test(pathname);

        if (isViteAsset || hasExtension) {
          return viteProxy(req, res, next);
        }
        next();
      });
    } catch (err) {
      logger.warn(`Failed to setup Vite proxy: ${(err as Error).message}`);
    }
  }

  // 开发模式下使用 client 源码目录作为模板目录，避免渲染 dist 构建产物
  const staticRoot = isDevelopment
    ? join(process.cwd(), 'client')
    : join(process.cwd(), 'dist/client');
  app.useStaticAssets(staticRoot, { index: false });

  await configureApp(app, {
    disableSwagger: true,
  });

  app.setBaseViewsDir(staticRoot);
  app.setViewEngine('html');
  app.engine('html', hbsExpressEngine);

  await app.listen(port, host);
  logger.log(`Server running on ${host}:${port}`);
  logger.log(`API endpoints ready at http://${host}:${port}/api`);
}

bootstrap();

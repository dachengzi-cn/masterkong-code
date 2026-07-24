import { Controller, Get, Render, Req } from '@nestjs/common';
import type { Request } from 'express';

function safeScriptJson(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/\//g, '\\u002f')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

@Controller()
export class ViewController {
  private buildTemplateData(
    req: Request,
  ): Record<string, string> {
    const platformData = (req as any).__platform_data__ ?? {};
    const viteHost = process.env.NODE_ENV === 'development' ? 'http://localhost:8080' : '';
    const currentUrl =
      req.protocol + '://' + req.get('host') + req.originalUrl;
    // dev fallback: set default appId/basename so Auth SDK can resolve mock endpoint
    const devAppId = 'demo-app-local';
    const devBasename = process.env.CLIENT_BASE_PATH || '/';
    const resolvedAppId = String(platformData.appId ?? (process.env.NODE_ENV === 'development' ? devAppId : ''));
    // In dev mode, always use CLIENT_BASE_PATH from env; ignore platformData.basename
    const resolvedBasename = process.env.NODE_ENV === 'development'
      ? devBasename
      : String(platformData.basename ?? '');
    return {
      __platform__: safeScriptJson(platformData),
      __vite_host__: viteHost,
      csrfToken: String((platformData as any).csrfToken ?? ''),
      userId: String((platformData as any).userId ?? ''),
      tenantId: String((platformData as any).tenantId ?? ''),
      appId: resolvedAppId,
      environment: process.env.NODE_ENV || 'development',
      appName: String((platformData as any).appName ?? '数据分析系统'),
      appAvatar: String((platformData as any).appAvatar ?? '/favicon.svg'),
      appDescription: String((platformData as any).appDescription ?? ''),
      basename: resolvedBasename,
      currentUrl,
    };
  }

  @Get('/')
  @Render('index')
  async render(@Req() req: Request): Promise<Record<string, string>> {
    return this.buildTemplateData(req);
  }

  @Get('app/*')
  @Render('index')
  async renderApp(@Req() req: Request): Promise<Record<string, string>> {
    return this.buildTemplateData(req);
  }

  // SPA fallback: serve index.html for any unmatched client-side route
  @Get('*')
  @Render('index')
  async renderSpa(@Req() req: Request): Promise<Record<string, string>> {
    return this.buildTemplateData(req);
  }
}

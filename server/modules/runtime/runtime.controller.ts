import { Controller, Post, Get, Body, Param, Req } from '@nestjs/common';

interface MockUserInfo {
  userID: string;
  name: Array<{ language_code: number; text: string }>;
  avatar: { image: { large: string; medium: string; small: string } };
  email: string;
  desensitizedPhoneNumber: string;
}

interface MockUserResponse {
  data: {
    userInfo: MockUserInfo;
  };
  status: number;
  statusText: string;
}

const mockUserInfo: MockUserInfo = {
  userID: 'dev-user-001',
  name: [
    { language_code: 2052, text: '开发用户' },
    { language_code: 1033, text: 'Dev User' },
  ],
  avatar: {
    image: {
      large: 'https://s1-imfile.feishucdn.com/static-resource/feishu-icon_8b5c08d.png',
      medium: 'https://s1-imfile.feishucdn.com/static-resource/feishu-icon_8b5c08d.png',
      small: 'https://s1-imfile.feishucdn.com/static-resource/feishu-icon_8b5c08d.png',
    },
  },
  email: 'dev-user@example.com',
  desensitizedPhoneNumber: '138****0000',
};

@Controller()
export class RuntimeController {

  // Standard path: /app/:appId/__runtime__/api/v1/account/login/user
  @Post('app/:appId/__runtime__/api/v1/account/login/user')
  async getLoginUser(
    @Body() _body: any,
  ): Promise<MockUserResponse> {
    return {
      data: { userInfo: mockUserInfo },
      status: 200,
      statusText: 'OK',
    };
  }

  // Fallback path: /app//__runtime__/api/v1/account/login/user (empty appId)
  @Post('app//__runtime__/api/v1/account/login/user')
  async getLoginUserFallback(
    @Body() _body: any,
  ): Promise<MockUserResponse> {
    return {
      data: { userInfo: mockUserInfo },
      status: 200,
      statusText: 'OK',
    };
  }

  // Extra fallback: /__runtime__/api/v1/account/login/user
  @Post('__runtime__/api/v1/account/login/user')
  async getLoginUserDirect(
    @Body() _body: any,
  ): Promise<MockUserResponse> {
    return {
      data: { userInfo: mockUserInfo },
      status: 200,
      statusText: 'OK',
    };
  }

  // ============================================================================
  // Observability endpoints (metrics/traces/logs/time) - local dev stubs
  // The Lark APAAS SDK sends these in preview/dev builds; without stubs they 404
  // and the SPA fallback returns HTML, causing JSON parse errors.
  // ============================================================================

  private observabilityOk(): { code: number; data: Record<string, unknown> } {
    return { code: 0, data: {} };
  }

  private currentServerTimestamp(): { code: number; data: { timestampNs: string } } {
    const nowNs = BigInt(Date.now()) * BigInt(1e6);
    return { code: 0, data: { timestampNs: nowNs.toString() } };
  }

  // Non-prod (preview/dev) paths: /spark/app/:appId/runtime/api/v1/observability/...
  @Post('spark/app/:appId/runtime/api/v1/observability/logs/collect')
  async collectLogsSpark(@Body() _body: any) {
    return this.observabilityOk();
  }

  @Post('spark/app/:appId/runtime/api/v1/observability/traces/collect')
  async collectTracesSpark(@Body() _body: any) {
    return this.observabilityOk();
  }

  @Post('spark/app/:appId/runtime/api/v1/observability/metrics/collect')
  async collectMetricsSpark(@Body() _body: any) {
    return this.observabilityOk();
  }

  @Get('spark/app/:appId/runtime/api/v1/observability/current_server_timestamp')
  async getTimestampSpark() {
    return this.currentServerTimestamp();
  }

  // Empty appId variants
  @Post('spark/app//runtime/api/v1/observability/logs/collect')
  async collectLogsSparkEmpty(@Body() _body: any) {
    return this.observabilityOk();
  }

  @Post('spark/app//runtime/api/v1/observability/traces/collect')
  async collectTracesSparkEmpty(@Body() _body: any) {
    return this.observabilityOk();
  }

  @Post('spark/app//runtime/api/v1/observability/metrics/collect')
  async collectMetricsSparkEmpty(@Body() _body: any) {
    return this.observabilityOk();
  }

  @Get('spark/app//runtime/api/v1/observability/current_server_timestamp')
  async getTimestampSparkEmpty() {
    return this.currentServerTimestamp();
  }

  // Prod-ish paths: /app/:appId/__runtime__/api/v1/observability/...
  @Post('app/:appId/__runtime__/api/v1/observability/logs/collect')
  async collectLogsApp(@Body() _body: any) {
    return this.observabilityOk();
  }

  @Post('app/:appId/__runtime__/api/v1/observability/traces/collect')
  async collectTracesApp(@Body() _body: any) {
    return this.observabilityOk();
  }

  @Post('app/:appId/__runtime__/api/v1/observability/metrics/collect')
  async collectMetricsApp(@Body() _body: any) {
    return this.observabilityOk();
  }

  @Get('app/:appId/__runtime__/api/v1/observability/current_server_timestamp')
  async getTimestampApp() {
    return this.currentServerTimestamp();
  }

  // Empty appId variants
  @Post('app//__runtime__/api/v1/observability/logs/collect')
  async collectLogsAppEmpty(@Body() _body: any) {
    return this.observabilityOk();
  }

  @Post('app//__runtime__/api/v1/observability/traces/collect')
  async collectTracesAppEmpty(@Body() _body: any) {
    return this.observabilityOk();
  }

  @Post('app//__runtime__/api/v1/observability/metrics/collect')
  async collectMetricsAppEmpty(@Body() _body: any) {
    return this.observabilityOk();
  }

  @Get('app//__runtime__/api/v1/observability/current_server_timestamp')
  async getTimestampAppEmpty() {
    return this.currentServerTimestamp();
  }

  // Batch logger endpoint used by client-toolkit
  @Post('dev/logs/collect-batch')
  async collectBatchLogs(@Body() _body: any) {
    return { code: 0, data: {} };
  }

  // ============================================================================
  // Permissions / roles - used by auth-sdk and AppContainer
  // Returns empty role list so local dev does not crash on SPA fallback HTML.
  // ============================================================================

  private permissionsResponse(): { code: number; data: { roleList: unknown[] } } {
    return { code: 0, data: { roleList: [] } };
  }

  @Post('spark/app/:appId/runtime/api/v1/permissions/roles')
  async getPermissionsSpark(@Body() _body: any) {
    return this.permissionsResponse();
  }

  @Post('spark/app//runtime/api/v1/permissions/roles')
  async getPermissionsSparkEmpty(@Body() _body: any) {
    return this.permissionsResponse();
  }

  @Post('app/:appId/__runtime__/api/v1/permissions/roles')
  async getPermissionsApp(@Body() _body: any) {
    return this.permissionsResponse();
  }

  @Post('app//__runtime__/api/v1/permissions/roles')
  async getPermissionsAppEmpty(@Body() _body: any) {
    return this.permissionsResponse();
  }

  // Permission points endpoint used by auth-sdk
  @Get('app/:appId/api/sdk_innerapi/permission/user-points')
  async getPermissionPoints(@Param() _params: any) {
    return [];
  }

  // ============================================================================
  // Additional time offset path used by client-toolkit observable
  // ============================================================================

  @Get('spark/api/v1/observability/app/:appId/current_server_timestamp')
  async getTimestampSparkToolkit() {
    return this.currentServerTimestamp();
  }

  @Get('spark/api/v1/observability/app//current_server_timestamp')
  async getTimestampSparkToolkitEmpty() {
    return this.currentServerTimestamp();
  }

  // ============================================================================
  // Tenant / Lark user info - used by AppContainer safety / getLarkUser
  // ============================================================================

  private tenantInfoResponse(): {
    code: number;
    data: {
      tenant_info: { name: string; tenant_name?: string };
      is_internet_visible: boolean;
    };
  } {
    return {
      code: 0,
      data: {
        tenant_info: { name: '本地开发租户', tenant_name: '本地开发租户' },
        is_internet_visible: false,
      },
    };
  }

  @Get('spark/b/:appId/tenant_info')
  async getTenantInfoSpark(@Param() _params: any) {
    return this.tenantInfoResponse();
  }

  @Get('spark/b//tenant_info')
  async getTenantInfoSparkEmpty() {
    return this.tenantInfoResponse();
  }

  @Get('app/:appId/__runtime__/api/v1/studio/tenant_info')
  async getTenantInfoApp(@Param() _params: any) {
    return this.tenantInfoResponse();
  }

  @Get('app//__runtime__/api/v1/studio/tenant_info')
  async getTenantInfoAppEmpty() {
    return this.tenantInfoResponse();
  }

  @Get('spark/b/:appId/lark/user_info')
  async getLarkUserInfoSpark(@Param() _params: any) {
    return { code: 0, data: {} };
  }

  @Get('spark/b//lark/user_info')
  async getLarkUserInfoSparkEmpty() {
    return { code: 0, data: {} };
  }

  @Get('app/:appId/__runtime__/api/v1/studio/lark/user_info')
  async getLarkUserInfoApp(@Param() _params: any) {
    return { code: 0, data: {} };
  }

  @Get('app//__runtime__/api/v1/studio/lark/user_info')
  async getLarkUserInfoAppEmpty() {
    return { code: 0, data: {} };
  }
}

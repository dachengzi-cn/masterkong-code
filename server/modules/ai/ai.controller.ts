import { Body, Controller, Post } from '@nestjs/common';
import { AiService } from './ai.service';
import type { ChatCompletionsProxyDto } from './dto/chat-completions-proxy.dto';

@Controller('api/ai')
export class AiController {
  constructor(private readonly aiService: AiService) {}

  @Post('chat-completions')
  async chatCompletions(@Body() dto: ChatCompletionsProxyDto) {
    return this.aiService.chatCompletions(dto);
  }
}

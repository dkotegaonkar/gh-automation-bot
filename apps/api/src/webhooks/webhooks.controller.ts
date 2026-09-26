import {
  BadRequestException,
  Controller,
  Headers,
  HttpCode,
  Logger,
  Post,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { AppConfig } from '../config/config.module';
import { verifyGithubSignature } from './signature';
import { WebhookIntakeService } from './webhook-intake.service';

@Controller('webhooks')
export class WebhooksController {
  private readonly logger = new Logger(WebhooksController.name);

  constructor(
    private readonly config: AppConfig,
    private readonly intake: WebhookIntakeService,
  ) {}

  @Post('github')
  @HttpCode(202)
  async github(
    @Req() req: RawBodyRequest<Request>,
    @Headers('x-hub-signature-256') signature?: string,
    @Headers('x-github-delivery') deliveryId?: string,
    @Headers('x-github-event') event?: string,
  ) {
    // 1. Authenticity before anything else touches the payload.
    if (!req.rawBody || !verifyGithubSignature(this.config.get('GITHUB_WEBHOOK_SECRET'), req.rawBody, signature)) {
      this.logger.warn({ deliveryId, event, ip: req.ip }, 'rejected webhook: bad signature');
      throw new UnauthorizedException('invalid signature');
    }
    if (!deliveryId || !event) throw new BadRequestException('missing GitHub headers');

    if (event === 'ping') return { ok: true, pong: true };

    const result = await this.intake.intake(deliveryId, event, req.body as Record<string, any>);
    this.logger.log({ deliveryId, event, action: (req.body as any)?.action, ...result }, 'webhook received');
    return result;
  }
}

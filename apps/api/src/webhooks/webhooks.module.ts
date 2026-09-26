import { Module } from '@nestjs/common';
import { WebhookIntakeService } from './webhook-intake.service';
import { WebhooksController } from './webhooks.controller';

@Module({ controllers: [WebhooksController], providers: [WebhookIntakeService] })
export class WebhooksModule {}

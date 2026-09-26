import { Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import type { Message } from '@aws-sdk/client-sqs';
import { DeliveryMessage, SqsService } from '../queue/sqs.service';
import { backoffSeconds } from './backoff';
import { DeliveryProcessorService } from './delivery-processor.service';

/** Long-polling loop. At-least-once: a message is deleted only after processing succeeds. */
@Injectable()
export class SqsConsumerService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(SqsConsumerService.name);
  private readonly abort = new AbortController();
  private loop?: Promise<void>;

  constructor(
    private readonly sqs: SqsService,
    private readonly processor: DeliveryProcessorService,
  ) {}

  onApplicationBootstrap() {
    this.loop = this.run();
  }

  async onApplicationShutdown() {
    this.abort.abort();
    await this.loop;
  }

  private async run() {
    this.logger.log('consumer started');
    while (!this.abort.signal.aborted) {
      try {
        const messages = await this.sqs.receive(this.abort.signal);
        await Promise.all(messages.map((m) => this.handle(m)));
      } catch (err) {
        if (this.abort.signal.aborted) break;
        this.logger.error({ err }, 'receive failed; backing off');
        await sleep(5000);
      }
    }
    this.logger.log('consumer stopped');
  }

  private async handle(message: Message) {
    const receiveCount = Number(message.Attributes?.ApproximateReceiveCount ?? '1');
    let body: DeliveryMessage;
    try {
      body = JSON.parse(message.Body ?? '') as DeliveryMessage;
      if (!body.deliveryId) throw new Error('missing deliveryId');
    } catch (err) {
      // Poison message: retrying cannot help. Leave it for the DLQ via normal visibility expiry.
      this.logger.error({ err, messageId: message.MessageId }, 'unparseable message');
      return;
    }

    try {
      await this.processor.process(body.deliveryId, receiveCount);
      await this.sqs.delete(message.ReceiptHandle!);
    } catch (err) {
      const delay = backoffSeconds(receiveCount);
      this.logger.warn({ err, deliveryId: body.deliveryId, receiveCount, retryInSeconds: delay }, 'processing failed');
      await this.sqs.retryAfter(message.ReceiptHandle!, delay).catch(() => undefined);
    }
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

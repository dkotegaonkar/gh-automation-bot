import {
  ChangeMessageVisibilityCommand,
  DeleteMessageCommand,
  Message,
  ReceiveMessageCommand,
  SendMessageCommand,
  SQSClient,
} from '@aws-sdk/client-sqs';
import { Global, Injectable, Module } from '@nestjs/common';
import { AppConfig } from '../config/app-config';

export interface DeliveryMessage {
  deliveryId: string;
}

/**
 * Thin wrapper over SQS. Credentials come from the default provider chain:
 * the EC2 instance role in production, your local AWS profile in development.
 */
@Injectable()
export class SqsService {
  private readonly client: SQSClient;
  private readonly queueUrl: string;

  constructor(config: AppConfig) {
    this.client = new SQSClient({ region: config.get('AWS_REGION') });
    this.queueUrl = config.get('SQS_QUEUE_URL');
  }

  async enqueueDelivery(deliveryId: string): Promise<void> {
    const body: DeliveryMessage = { deliveryId };
    await this.client.send(new SendMessageCommand({ QueueUrl: this.queueUrl, MessageBody: JSON.stringify(body) }));
  }

  /** Long-polls for up to 20s. VisibilityTimeout covers one processing attempt. */
  async receive(abortSignal?: AbortSignal): Promise<Message[]> {
    const res = await this.client.send(
      new ReceiveMessageCommand({
        QueueUrl: this.queueUrl,
        MaxNumberOfMessages: 5,
        WaitTimeSeconds: 20,
        VisibilityTimeout: 60,
        MessageSystemAttributeNames: ['ApproximateReceiveCount'],
      }),
      { abortSignal },
    );
    return res.Messages ?? [];
  }

  async delete(receiptHandle: string): Promise<void> {
    await this.client.send(new DeleteMessageCommand({ QueueUrl: this.queueUrl, ReceiptHandle: receiptHandle }));
  }

  /** Delays the next retry of a failed message (exponential backoff is computed by the caller). */
  async retryAfter(receiptHandle: string, seconds: number): Promise<void> {
    await this.client.send(
      new ChangeMessageVisibilityCommand({
        QueueUrl: this.queueUrl,
        ReceiptHandle: receiptHandle,
        VisibilityTimeout: seconds,
      }),
    );
  }
}

@Global()
@Module({ providers: [SqsService], exports: [SqsService] })
export class QueueModule {}

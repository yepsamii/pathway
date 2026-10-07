import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';

@Injectable()
export class NotificationService {
  @OnEvent('payment.test')
  handleTestEvent(payload: { message: string; timestamp: number }) {
    console.log('[NotificationService] received payment.test:', payload);
  }
}
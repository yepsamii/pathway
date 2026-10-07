import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';

@Injectable()
export class NotificationsService {
  @OnEvent('payment.test')
  handleTestEvent(payload: { message: string; timestamp: number }) {
    console.log('[NotificationService] received payment.test:', payload);
  }
}
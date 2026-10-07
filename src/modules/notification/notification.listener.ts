import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';

/**
 * NotificationModule — Phase 01 stub.
 *
 * Subscribes to the `payment.test` event emitted by the payment module to
 * prove that the in-process event bus is wired end-to-end. Replaced by real
 * notification delivery logic in Phase 09.
 */
@Injectable()
export class NotificationListener {
  @OnEvent('payment.test', { async: false })
  handlePaymentTestEvent(payload: unknown): void {
    // eslint-disable-next-line no-console
    console.log('[notification] received payment.test event:', payload);
  }
}
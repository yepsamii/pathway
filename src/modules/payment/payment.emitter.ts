import { Injectable, OnModuleInit } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';

/**
 * Phase 01 proof that the in-process event bus works.
 *
 * Emits `payment.test` once on boot. NotificationListener subscribes to
 * this event and logs the payload. Phase 08 replaces this with a real
 * outbox + relay pattern; Phase 09 turns notification into real delivery.
 */
@Injectable()
export class PaymentTestEmitter implements OnModuleInit {
  constructor(private readonly emitter: EventEmitter2) {}

  onModuleInit() {
    setImmediate(() => {
      this.emitter.emit('payment.test', {
        timestamp: new Date().toISOString(),
        message: 'Phase 01 smoke: payment → notification event flow',
      });
    });
  }
}
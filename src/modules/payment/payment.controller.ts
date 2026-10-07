import { Controller, Post } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';

@Controller('payment')
export class PaymentController {
  constructor(private readonly eventEmitter: EventEmitter2) {}

  @Post('test-emit')
  testEmit() {
    this.eventEmitter.emit('payment.test', {
      message: 'test event fired',
      timestamp: Date.now()
    });
    return { emitted: true };
  }
}
import { Module } from '@nestjs/common';
import { PaymentTestEmitter } from './payment.emitter';

@Module({
  providers: [PaymentTestEmitter],
})
export class PaymentModule {}
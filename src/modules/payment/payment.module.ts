import { Module } from '@nestjs/common';
import { PaymentController } from './payment.controller';
import { NotificationModule } from '../notification/notification.module';

@Module({
  imports: [NotificationModule],
  controllers: [PaymentController]
})
export class PaymentModule {}
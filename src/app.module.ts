import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { UserModule } from './modules/user/user.module';
import { WalletModule } from './modules/wallet/wallet.module';
import { PaymentModule } from './modules/payment/payment.module';
import { NotificationModule } from './modules/notification/notification.module';
import { WebhookModule } from './modules/webhook/webhook.module';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { HealthModule } from './modules/health/health.module';

@Module({
  imports: [ConfigModule.forRoot({
    isGlobal: true}),EventEmitterModule.forRoot(),HealthModule,UserModule, WalletModule, PaymentModule, NotificationModule, WebhookModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}

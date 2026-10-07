import { Module, OnModuleInit } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { HealthModule } from './health/health.module';
import { NotificationModule } from './modules/notification/notification.module';
import { PaymentModule } from './modules/payment/payment.module';
import { UserModule } from './modules/user/user.module';
import { WalletModule } from './modules/wallet/wallet.module';
import { WebhookModule } from './modules/webhook/webhook.module';

/**
 * Root module. Composes the modular monolith:
 * - `user`, `wallet`, `payment`: business domains with controllers/services
 * - `notification`, `webhook`: async consumers of internal events
 * - `health`: liveness/readiness endpoints (no domain deps)
 *
 * All modules run in one Node process talking to one Postgres database.
 * Extraction path (Phase 12 doc): pull `notification` and `webhook` into
 * separate NestJS apps + replace `EventEmitter.emit` with `amqp.publish`.
 */
@Module({
  imports: [
    EventEmitterModule.forRoot({
      wildcard: true, // Phase 08 will rely on namespaced events (payment.*)
      maxListeners: 50,
    }),
    HealthModule,
    UserModule,
    WalletModule,
    PaymentModule,
    NotificationModule,
    WebhookModule,
  ],
})
export class AppModule implements OnModuleInit {
  // Phase 01 sanity check: prove that payment → notification flow works.
  // Replaced by real business events in Phase 08.
  onModuleInit() {
    // eslint-disable-next-line no-console
    console.log(
      '[payment] AppModule init complete. EventEmitterModule is wired.',
    );
  }
}
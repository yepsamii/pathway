import { Controller, Get } from '@nestjs/common';
import { HealthCheck, HealthCheckService } from '@nestjs/terminus';
import { PrismaHealthIndicator } from './prisma.health';
import { RedisHealthIndicator } from './redis.health';

/**
 * Health endpoints for PathPay.
 *
 * GET /health — liveness: process is alive. Always 200 unless the Node event
 *               loop is dead.
 * GET /ready  — readiness: Postgres + Redis are reachable. 503 if not.
 *
 * Implemented with @nestjs/terminus so the indicators can grow with the app
 * (e.g. add Kafka/queue health when we split modules later).
 */
@Controller()
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly db: PrismaHealthIndicator,
    private readonly redis: RedisHealthIndicator,
  ) {}

  @Get('health')
  @HealthCheck()
  liveness() {
    // Liveness should never check downstream deps — it only proves the
    // process is up. We use a no-op indicator so the terminus response shape
    // is consistent.
    return this.health.check([]);
  }

  @Get('ready')
  @HealthCheck()
  readiness() {
    return this.health.check([
      () => this.db.isHealthy('postgres'),
      () => this.redis.isHealthy('redis'),
    ]);
  }
}
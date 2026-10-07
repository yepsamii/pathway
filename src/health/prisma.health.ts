import { Injectable } from '@nestjs/common';
import { HealthIndicatorService } from '@nestjs/terminus';
import { PrismaClient } from '@prisma/client';

/**
 * Postgres readiness check.
 *
 * `@nestjs/terminus@12` replaced the old `HealthIndicator` base class with
 * a `HealthIndicatorService` that indicators inject and use to register a
 * named check. We follow that pattern here.
 */
@Injectable()
export class PrismaHealthIndicator {
  private readonly prisma = new PrismaClient();

  constructor(private readonly healthIndicatorService: HealthIndicatorService) {}

  async isHealthy(key: string) {
    const indicator = this.healthIndicatorService.check(key);
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return indicator.up();
    } catch (err) {
      return indicator.down({ message: (err as Error).message });
    }
  }
}
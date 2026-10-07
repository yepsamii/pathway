import { Injectable } from '@nestjs/common';
import { HealthIndicatorService } from '@nestjs/terminus';
import Redis from 'ioredis';

/**
 * Redis readiness check.
 *
 * Connects lazily, runs PING, disconnects. The cost (TCP handshake +
 * 1 round-trip) is fine for /ready probes that run every few seconds
 * (or whenever Kubernetes/k8s liveness-readiness asks).
 */
@Injectable()
export class RedisHealthIndicator {
  private readonly url: string;

  constructor(private readonly healthIndicatorService: HealthIndicatorService) {
    this.url = process.env.REDIS_URL ?? 'redis://localhost:6379';
  }

  async isHealthy(key: string) {
    const indicator = this.healthIndicatorService.check(key);
    const redis = new Redis(this.url, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
    });
    try {
      await redis.connect();
      const pong = await redis.ping();
      return pong === 'PONG' ? indicator.up() : indicator.down({ message: 'unexpected PING reply' });
    } catch (err) {
      return indicator.down({ message: (err as Error).message });
    } finally {
      redis.disconnect();
    }
  }
}
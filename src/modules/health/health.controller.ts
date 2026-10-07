import {
  Controller,
  Get,
  ServiceUnavailableException
} from '@nestjs/common';
import { HealthService } from './health.service';

@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  getLiveness() {
    return this.healthService.getLiveness();
  }

  @Get('ready')
  async getReadiness() {
    const [dbUp, redisUp] = await Promise.all([
      this.healthService.checkPostgres(),
      this.healthService.checkRedis()
    ]);

    if (dbUp && redisUp) {
      return {
        status: 'ready',
        db: 'up',
        redis: 'up'
      };
    }

    throw new ServiceUnavailableException({
      status: 'not_ready',
      db: dbUp ? 'up' : 'down',
      redis: redisUp ? 'up' : 'down'
    });
  }
}
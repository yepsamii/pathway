import { Injectable } from '@nestjs/common';
import * as net from 'net';

const PROBE_TIMEOUT_MS = 500;

@Injectable()
export class HealthService {
  getLiveness() {
    return { status: 'ok', service: 'pathpay' };
  }

  checkPostgres(): Promise<boolean> {
    return this.probeTcp(5432);
  }

  checkRedis(): Promise<boolean> {
    return this.probeTcp(6379);
  }

  private probeTcp(port: number): Promise<boolean> {
    return new Promise((resolve) => {
      const socket = new net.Socket();
      let settled = false;

      const finish = (result: boolean) => {
        if (settled) return;
        settled = true;
        socket.destroy();
        resolve(result);
      };

      socket.setTimeout(PROBE_TIMEOUT_MS);

      socket.once('connect', () => finish(true));
      socket.once('error', (err: NodeJS.ErrnoException) => {
        if (err && err.code === 'ECONNREFUSED') {
          finish(false);
          return;
        }
        finish(false);
      });
      socket.once('timeout', () => finish(false));

      socket.connect(port, '127.0.0.1');
    });
  }
}
import 'reflect-metadata';
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Phase 11 will add a request-id middleware here.
  // Phase 11 will add a global exception filter here.

  // Phase 03 will add ValidationPipe globally. Enabled early so any
  // future DTO added to a controller fails fast on bad input.
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port);

  Logger.log(`PathPay listening on port ${port}`, 'Bootstrap');
}

void bootstrap();
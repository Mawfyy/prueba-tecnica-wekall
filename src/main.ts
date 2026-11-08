import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  // El dashboard (React) corre en otro origen en desarrollo.
  app.enableCors({ origin: '*' });
  app.enableShutdownHooks();
  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port);
  console.log(`API escuchando en http://localhost:${port}`);
}
await bootstrap();

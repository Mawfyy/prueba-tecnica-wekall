import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { TypeOrmModule, TypeOrmModuleOptions } from '@nestjs/typeorm';
import { AgentsModule } from './agents/agents.module.js';
import { AssignmentModule } from './assignment/assignment.module.js';
import { CallsModule } from './calls/calls.module.js';
import { MaintenanceModule } from './cron/maintenance.module.js';
import { DashboardModule } from './dashboard/dashboard.module.js';
import { EventsModule } from './events/events.module.js';
import { QueuesModule } from './queues/queues.module.js';
import { SeedModule } from './seed/seed.module.js';
import { HealthController } from './health.controller.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService): TypeOrmModuleOptions => ({
        type: 'postgres',
        host: config.get('DB_HOST', 'localhost'),
        port: config.get<number>('DB_PORT', 5432),
        username: config.get('DB_USER', 'wekall'),
        password: config.get('DB_PASSWORD', 'wekall'),
        database: config.get('DB_NAME', 'wekall'),
        autoLoadEntities: true,
        // Suficiente para la prueba técnica; en producción usar migraciones.
        synchronize: true,
      }),
    }),
    QueuesModule,
    DashboardModule,
    AssignmentModule,
    AgentsModule,
    CallsModule,
    EventsModule,
    MaintenanceModule,
    SeedModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}

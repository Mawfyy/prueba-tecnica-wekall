import { Controller, Get } from '@nestjs/common';

@Controller()
export class HealthController {
  @Get()
  health() {
    return {
      app: 'wekall-contact-center',
      status: 'ok',
      timestamp: new Date().toISOString(),
    };
  }
}

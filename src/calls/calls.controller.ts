import { Controller, Get } from '@nestjs/common';
import { CallsService } from './calls.service.js';

@Controller('calls')
export class CallsController {
  constructor(private readonly callsService: CallsService) {}

  @Get()
  async list() {
    return this.callsService.findAll();
  }
}

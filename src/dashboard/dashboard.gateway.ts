import { Logger } from '@nestjs/common';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import { DashboardService } from './dashboard.service.js';

/**
 * Tablero en vivo (Requerimiento 6).
 *
 * - `dashboard:snapshot`: estado completo, enviado a cada cliente al
 *   conectarse. Es la resincronización silenciosa tras una reconexión:
 *   socket.io reconecta, el gateway reenvía el snapshot y el frontend
 *   reemplaza su estado sin recargar la página.
 * - `dashboard:state`: snapshot completo difundido tras cada mutación.
 */
@WebSocketGateway({ cors: { origin: '*' } })
export class DashboardGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger(DashboardGateway.name);

  @WebSocketServer()
  server!: Server;

  constructor(private readonly dashboard: DashboardService) {}

  afterInit(): void {
    this.dashboard.setServer(this.server);
    this.logger.log('Gateway del tablero inicializado');
  }

  async handleConnection(client: Socket): Promise<void> {
    client.emit('dashboard:snapshot', await this.dashboard.snapshot());
  }

  handleDisconnect(_client: Socket): void {
    this.logger.log('Cliente del tablero desconectado');
  }
}

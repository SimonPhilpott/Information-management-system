import { EventEmitter } from 'events';

/**
 * IMS Unified Real-Time EventBus & Server-Sent Events (SSE) Hub
 * Addresses Dev Idea #42 (Phase 3 of System Architecture Plan)
 *
 * Provides a single, low-latency SSE push stream (/api/events) replacing
 * repetitive client HTTP polling loops for glucose readings, doorbell alerts,
 * background job completions, tasks, device statuses, and live log streaming.
 */

class SystemEventBus extends EventEmitter {
  constructor() {
    super();
    this.clients = new Set();
    this.keepAliveTimer = null;
    this.clientSeq = 0;
    this.startKeepAlive();
  }

  /**
   * 20-second keep-alive heartbeats to keep ngrok/reverse proxy tunnels open
   */
  startKeepAlive() {
    if (this.keepAliveTimer) return;
    this.keepAliveTimer = setInterval(() => {
      this.sendRaw(': ping\n\n');
    }, 20000);
    if (this.keepAliveTimer.unref) {
      this.keepAliveTimer.unref();
    }
  }

  /**
   * Registers a new SSE client connection
   * @param {import('express').Response} res - Express response object
   * @param {string} clientId - Optional unique identifier or remote IP
   */
  addClient(res, clientId = `client-${++this.clientSeq}`) {
    const client = {
      id: clientId,
      res,
      connectedAt: Date.now()
    };
    this.clients.add(client);

    // Initial handshake event
    try {
      res.write(`event: connected\ndata: ${JSON.stringify({
        status: 'connected',
        clientId: client.id,
        connectedAt: client.connectedAt,
        activeClients: this.clients.size
      })}\n\n`);
    } catch (_) {
      this.clients.delete(client);
      return;
    }

    return client;
  }

  /**
   * Deregisters an SSE client connection
   */
  removeClient(client) {
    if (client) {
      this.clients.delete(client);
    }
  }

  /**
   * Sends raw SSE data chunk to all connected clients
   */
  sendRaw(data) {
    for (const client of this.clients) {
      try {
        client.res.write(data);
      } catch (_) {
        this.clients.delete(client);
      }
    }
  }

  /**
   * Broadcasts a named event with JSON payload to all active SSE subscribers
   * @param {string} event - Topic name (e.g. 'glucose:update', 'job:complete', 'doorbell:ding')
   * @param {object} data - Event payload
   */
  broadcast(event, data = {}) {
    // Emit internally for Node listeners
    this.emit(event, data);

    const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const client of this.clients) {
      try {
        client.res.write(payload);
      } catch (_) {
        this.clients.delete(client);
      }
    }
  }

  /**
   * Returns current active client count
   */
  getClientCount() {
    return this.clients.size;
  }
}

export const eventBus = new SystemEventBus();
export default eventBus;

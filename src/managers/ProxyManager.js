import { createServer as createHttpServer } from 'http';
import { createConnection } from 'net';
import { promisify } from 'util';

export class ProxyManager {
  constructor(logger) {
    this.logger = logger;
    this.socksServer = null;
    this.httpServer = null;
    this.socksPort = parseInt(process.env.SOCKS5_PORT || 1080);
    this.httpPort = parseInt(process.env.HTTP_PROXY_PORT || 8888);
    this.connections = [];
  }

  async start() {
    try {
      this.logger.info('Starting proxy servers...');

      // Start SOCKS5 proxy
      this.socksServer = this.createSOCKS5Server();
      await new Promise((resolve, reject) => {
        this.socksServer.listen(this.socksPort, '0.0.0.0', () => {
          this.logger.info(`✅ SOCKS5 proxy listening on port ${this.socksPort}`);
          resolve();
        });
        this.socksServer.on('error', reject);
      });

      // Start HTTP proxy
      this.httpServer = this.createHTTPProxyServer();
      await new Promise((resolve, reject) => {
        this.httpServer.listen(this.httpPort, '0.0.0.0', () => {
          this.logger.info(`✅ HTTP proxy listening on port ${this.httpPort}`);
          resolve();
        });
        this.httpServer.on('error', reject);
      });

      this.logger.info('✅ All proxy servers started');
    } catch (error) {
      this.logger.error({ error }, 'Failed to start proxy servers');
      throw error;
    }
  }

  createSOCKS5Server() {
    const server = createHttpServer();

    server.on('connection', (clientSocket) => {
      this.connections.push(clientSocket);
      this.logger.debug(`New SOCKS5 connection from ${clientSocket.remoteAddress}`);

      let stage = 0;
      let destAddr = null;
      let destPort = null;

      clientSocket.on('data', (data) => {
        try {
          if (stage === 0) {
            // SOCKS5 greeting
            const version = data[0];
            const nmethods = data[1];

            if (version === 5) {
              // Send server selection (no auth)
              clientSocket.write(Buffer.from([0x05, 0x00]));
              stage = 1;
            } else {
              clientSocket.end();
            }
          } else if (stage === 1) {
            // SOCKS5 request
            const version = data[0];
            const cmd = data[1];
            const addressType = data[3];

            let offset = 4;
            let address = '';
            let port = 0;

            if (addressType === 1) {
              // IPv4
              address = Array.from(data.slice(offset, offset + 4)).join('.');
              offset += 4;
              port = data.readUInt16BE(offset);
            } else if (addressType === 3) {
              // Domain name
              const domainLength = data[offset];
              offset++;
              address = data.toString('utf8', offset, offset + domainLength);
              offset += domainLength;
              port = data.readUInt16BE(offset);
            } else if (addressType === 4) {
              // IPv6
              address = Array.from(data.slice(offset, offset + 16))
                .map(b => b.toString(16))
                .join(':');
              offset += 16;
              port = data.readUInt16BE(offset);
            }

            destAddr = address;
            destPort = port;

            if (cmd === 1) {
              // CONNECT command
              const targetSocket = createConnection(port, address, () => {
                // Connection successful
                const response = Buffer.alloc(6);
                response[0] = 0x05; // Version
                response[1] = 0x00; // Success
                response[2] = 0x00; // Reserved
                response[3] = 0x01; // IPv4
                targetSocket.address().address.split('.').forEach((octet, i) => {
                  response[4 + i] = parseInt(octet);
                });
                response.writeUInt16BE(targetSocket.address().port, 8);

                clientSocket.write(response);
                stage = 2;
              });

              targetSocket.on('error', (err) => {
                this.logger.error({ error: err, address, port }, 'Target socket error');
                const response = Buffer.from([0x05, 0x04, 0x00, 0x01, 0, 0, 0, 0, 0, 0]);
                clientSocket.write(response);
                clientSocket.end();
              });

              targetSocket.on('data', (targetData) => {
                clientSocket.write(targetData);
              });

              targetSocket.on('end', () => {
                clientSocket.end();
              });

              clientSocket.targetSocket = targetSocket;
            }
          } else if (stage === 2) {
            // Data relay
            if (clientSocket.targetSocket && !clientSocket.targetSocket.destroyed) {
              clientSocket.targetSocket.write(data);
            }
          }
        } catch (error) {
          this.logger.error({ error }, 'SOCKS5 data processing error');
          clientSocket.end();
        }
      });

      clientSocket.on('error', (error) => {
        this.logger.debug({ error }, 'Client socket error');
        if (clientSocket.targetSocket) {
          clientSocket.targetSocket.destroy();
        }
      });

      clientSocket.on('end', () => {
        if (clientSocket.targetSocket) {
          clientSocket.targetSocket.destroy();
        }
        this.connections = this.connections.filter(c => c !== clientSocket);
      });
    });

    return server;
  }

  createHTTPProxyServer() {
    const server = createHttpServer((req, res) => {
      const targetURL = req.url;
      const url = new URL(targetURL);
      const hostname = url.hostname;
      const port = url.port || (url.protocol === 'https:' ? 443 : 80);
      const path = url.pathname + url.search;

      const targetSocket = createConnection(port, hostname, () => {
        const httpVersion = req.httpVersion;
        const method = req.method;
        const headers = req.headers;

        delete headers['proxy-connection'];

        let requestLine = `${method} ${path} HTTP/${httpVersion}\r\n`;
        let headerLines = '';

        Object.keys(headers).forEach(key => {
          headerLines += `${key}: ${headers[key]}\r\n`;
        });

        targetSocket.write(requestLine + headerLines + '\r\n');
      });

      targetSocket.on('data', (data) => {
        res.write(data);
      });

      targetSocket.on('end', () => {
        res.end();
      });

      targetSocket.on('error', (error) => {
        this.logger.error({ error, hostname, port }, 'Target socket error');
        res.writeHead(502, { 'Content-Type': 'text/plain' });
        res.end('Bad Gateway');
      });

      req.on('data', (data) => {
        targetSocket.write(data);
      });

      req.on('end', () => {
        if (req.method !== 'GET' && req.method !== 'HEAD') {
          targetSocket.end();
        }
      });

      req.on('error', (error) => {
        this.logger.error({ error }, 'Request error');
        targetSocket.destroy();
      });
    });

    // Handle CONNECT for HTTPS
    server.on('connect', (req, clientSocket, head) => {
      const { hostname, port } = new URL(`http://${req.url}`);

      const targetSocket = createConnection(port || 443, hostname, () => {
        clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
        targetSocket.write(head);
        clientSocket.pipe(targetSocket);
        targetSocket.pipe(clientSocket);
      });

      targetSocket.on('error', (error) => {
        this.logger.error({ error, hostname, port }, 'Target socket error');
        clientSocket.write('HTTP/1.1 502 Bad Gateway\r\n\r\n');
        clientSocket.end();
      });

      clientSocket.on('error', (error) => {
        this.logger.debug({ error }, 'Client socket error');
        targetSocket.destroy();
      });
    });

    return server;
  }

  async stop() {
    try {
      // Close all connections
      this.connections.forEach(conn => {
        try {
          conn.destroy();
        } catch (error) {
          this.logger.debug({ error }, 'Error closing connection');
        }
      });

      // Close servers
      if (this.socksServer) {
        await new Promise(resolve => this.socksServer.close(resolve));
      }
      if (this.httpServer) {
        await new Promise(resolve => this.httpServer.close(resolve));
      }

      this.logger.info('✅ Proxy servers stopped');
    } catch (error) {
      this.logger.error({ error }, 'Error stopping proxy servers');
    }
  }

  async getStatus() {
    return {
      socks5Port: this.socksPort,
      httpPort: this.httpPort,
      activeConnections: this.connections.length,
      socksServerRunning: this.socksServer?.listening || false,
      httpServerRunning: this.httpServer?.listening || false
    };
  }

  getConnectionStats() {
    return {
      totalConnections: this.connections.length,
      connections: this.connections.map(c => ({
        remoteAddress: c.remoteAddress,
        remotePort: c.remotePort
      }))
    };
  }
}

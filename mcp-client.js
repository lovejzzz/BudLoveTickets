'use strict';
const { spawn } = require('child_process');

/**
 * Lightweight MCP (Model Context Protocol) client over stdio.
 * Speaks JSON-RPC 2.0 to any MCP server process.
 */
class MCPClient {
  /**
   * @param {{ command: string, args?: string[], env?: object, timeout?: number }} opts
   */
  constructor({ command, args = [], env = {}, timeout = 30000 }) {
    this._command = command;
    this._args = args;
    this._env = { ...process.env, ...env };
    this._timeout = timeout;
    this._nextId = 1;
    this._pending = new Map();
    this._proc = null;
    this._buf = '';
  }

  /** Spawn the server process and perform the MCP initialize handshake. */
  async initialize() {
    this._proc = spawn(this._command, this._args, {
      env: this._env,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    this._proc.stdout.on('data', (chunk) => this._onData(chunk));
    this._proc.stderr.on('data', () => {}); // swallow stderr
    this._proc.on('error', (err) => this._rejectAll(err));
    this._proc.on('close', () => this._rejectAll(new Error('Server exited')));

    const res = await this._send('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'mcp-client', version: '1.0.0' },
    });
    // Send initialized notification (no id → notification)
    this._write({ jsonrpc: '2.0', method: 'notifications/initialized' });
    return res;
  }

  /** @returns {Promise<Array>} List of tool definitions from the server. */
  async listTools() {
    const res = await this._send('tools/list', {});
    return res.tools || [];
  }

  /**
   * Call a tool by name.
   * @param {string} name  Tool name
   * @param {object} args  Tool arguments
   * @returns {Promise<any>} The result content
   */
  async callTool(name, args = {}) {
    const res = await this._send('tools/call', { name, arguments: args });
    return res.content;
  }

  /** Gracefully shut down the server process. */
  close() {
    if (!this._proc) return;
    try { this._proc.stdin.end(); } catch {}
    setTimeout(() => { try { this._proc.kill(); } catch {} }, 500);
    this._rejectAll(new Error('Client closed'));
    this._proc = null;
  }

  // ── internals ──

  _send(method, params) {
    const id = this._nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this._pending.delete(id);
        reject(new Error(`Timeout (${this._timeout}ms) for ${method}`));
      }, this._timeout);
      this._pending.set(id, { resolve, reject, timer });
      this._write({ jsonrpc: '2.0', id, method, params });
    });
  }

  _write(obj) {
    const body = JSON.stringify(obj);
    this._proc.stdin.write(body + '\n');
  }

  _onData(chunk) {
    this._buf += chunk.toString();
    let nl;
    while ((nl = this._buf.indexOf('\n')) !== -1) {
      const line = this._buf.slice(0, nl).trim();
      this._buf = this._buf.slice(nl + 1);
      if (!line) continue;
      try {
        const msg = JSON.parse(line);
        if (msg.id != null && this._pending.has(msg.id)) {
          const { resolve, reject, timer } = this._pending.get(msg.id);
          clearTimeout(timer);
          this._pending.delete(msg.id);
          if (msg.error) reject(new Error(msg.error.message || JSON.stringify(msg.error)));
          else resolve(msg.result);
        }
        // notifications / server requests are silently ignored
      } catch {
        // non-JSON lines (e.g. server debug output) — skip
      }
    }
  }

  _rejectAll(err) {
    for (const [id, { reject, timer }] of this._pending) {
      clearTimeout(timer);
      reject(err);
    }
    this._pending.clear();
  }
}

/**
 * Connect to multiple MCP servers in parallel.
 * @param {Object<string, { command: string, args?: string[], env?: object, timeout?: number }>} config
 * @returns {Promise<Object<string, MCPClient>>} Keyed by server name, each initialized.
 */
async function connectServers(config) {
  const entries = Object.entries(config);
  const clients = {};
  await Promise.all(
    entries.map(async ([name, opts]) => {
      const client = new MCPClient(opts);
      await client.initialize();
      clients[name] = client;
    })
  );
  return clients;
}

// ── self-test ──
if (require.main === module) {
  (async () => {
    const testDir = __dirname;
    console.log(`⏳ Connecting to filesystem server (dir: ${testDir})…`);
    const client = new MCPClient({
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-filesystem', testDir],
      timeout: 30000,
    });
    try {
      const info = await client.initialize();
      console.log('✅ Initialized:', info.serverInfo?.name || 'unknown');

      const tools = await client.listTools();
      console.log(`🔧 ${tools.length} tools:`, tools.map((t) => t.name).join(', '));

      const result = await client.callTool('read_file', { path: __filename });
      const preview = (result[0]?.text || '').slice(0, 80);
      console.log(`📄 read_file preview: ${preview}…`);

      console.log('✅ Self-test passed');
    } catch (err) {
      console.error('❌ Self-test failed:', err.message);
      process.exitCode = 1;
    } finally {
      client.close();
    }
  })();
}

module.exports = { MCPClient, connectServers };

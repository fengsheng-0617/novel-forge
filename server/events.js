'use strict';
// Minimal server-side event hub (SSE fan-out) for chain/log/project-change notifications.

const util = require('./util');

class EventHub {
  constructor() { this.clients = new Set(); }

  /** Register an SSE connection; returns detach fn. */
  attach(res) {
    const w = new util.SSEWriter(res);
    w.init();
    const client = { w, lastSeen: Date.now() };
    this.clients.add(client);
    const detach = () => this.clients.delete(client);
    res.on('close', detach);
    res.on('error', detach);
    return detach;
  }

  emit(name, data) {
    for (const c of this.clients) c.w.send(name, data);
  }

  /** Heartbeat for keep-alive (call ~every 20s). */
  ping() {
    for (const c of this.clients) { c.w.comment(); c.lastSeen = Date.now(); }
  }

  closeAll() {
    for (const c of this.clients) c.w.close();
    this.clients.clear();
  }
}

const hub = new EventHub();

// ring log store (browser console "最近日志")
const LOG_RING = [];
function log(kind, text, projectId) {
  const entry = { id: util.uid('l_'), ts: Date.now(), kind: kind || 'info', text: String(text || '').slice(0, 2000), projectId: projectId || null };
  LOG_RING.push(entry);
  if (LOG_RING.length > 300) LOG_RING.shift();
  hub.emit('log', entry);
  return entry;
}
const getLogs = (after) => LOG_RING.filter((l) => !after || l.ts > after);

module.exports = { hub, log, getLogs };

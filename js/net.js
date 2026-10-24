// Peer-to-peer connection via PeerJS (WebRTC). The PeerJS public broker is only
// used to exchange connection info; game data flows directly between players.
/* global Peer */

const ID_PREFIX = 'digismash-';
const ALPHA = 'abcdefghjkmnpqrstuvwxyz23456789';
const roomCode = () => Array.from({ length: 6 }, () => ALPHA[Math.floor(Math.random() * ALPHA.length)]).join('');

export class Net {
  constructor(handlers) {
    this.h = handlers; // { onOpen(code), onConnect(), onData(msg), onClose(reason), onError(msg) }
    this.peer = null; this.conn = null; this.role = null; this.code = null;
  }

  host() {
    this.role = 'host';
    const tryOpen = (attempt) => {
      this.code = roomCode();
      const peer = new Peer(ID_PREFIX + this.code, { debug: 1 });
      this.peer = peer;
      peer.on('open', () => this.h.onOpen?.(this.code));
      peer.on('connection', (conn) => {
        if (this.conn && this.conn.open) { conn.on('open', () => { conn.send({ t: 'full' }); setTimeout(() => conn.close(), 500); }); return; }
        this.attach(conn);
      });
      peer.on('error', (err) => {
        if (err.type === 'unavailable-id' && attempt < 5) { peer.destroy(); tryOpen(attempt + 1); return; }
        this.h.onError?.(describe(err));
      });
      peer.on('disconnected', () => { if (!this.conn) peer.reconnect(); });
    };
    tryOpen(0);
  }

  join(code) {
    this.role = 'guest'; this.code = code;
    const peer = new Peer({ debug: 1 });
    this.peer = peer;
    peer.on('open', () => {
      const conn = peer.connect(ID_PREFIX + code, { serialization: 'json', reliable: true });
      this.attach(conn);
      setTimeout(() => { if (!this.conn || !this.conn.open) this.h.onError?.('Could not reach the host. Check the link, or ask them to host a new room.'); }, 15000);
    });
    peer.on('error', (err) => this.h.onError?.(describe(err)));
  }

  attach(conn) {
    this.conn = conn;
    conn.on('open', () => this.h.onConnect?.());
    conn.on('data', (msg) => this.h.onData?.(typeof msg === 'string' ? JSON.parse(msg) : msg));
    conn.on('close', () => { this.conn = null; this.h.onClose?.('Opponent disconnected.'); });
    conn.on('error', (e) => this.h.onError?.(describe(e)));
  }

  send(msg) { if (this.conn && this.conn.open) this.conn.send(msg); }
  get connected() { return !!(this.conn && this.conn.open); }

  close() {
    try { this.conn?.close(); } catch { /* ignore */ }
    try { this.peer?.destroy(); } catch { /* ignore */ }
    this.conn = null; this.peer = null;
  }
}

function describe(err) {
  const t = err && err.type;
  if (t === 'peer-unavailable') return 'That room does not exist (or the host closed it).';
  if (t === 'network' || t === 'server-error' || t === 'socket-error') return 'Could not reach the matchmaking server. Check your internet connection.';
  if (t === 'browser-incompatible') return 'This browser does not support WebRTC. Try Chrome, Edge or Firefox.';
  return (err && (err.message || err.type)) || 'Connection error';
}

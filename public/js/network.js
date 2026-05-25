export class Network extends EventTarget {
  constructor() {
    super();
    this.ws = null;
    this.connected = false;
  }

  connect(token, worldId) {
    const scheme = location.protocol === 'https:' ? 'wss' : 'ws';
    const url = `${scheme}://${location.host}/ws?token=${encodeURIComponent(token)}&world=${worldId}`;
    this.ws = new WebSocket(url);
    this.ws.addEventListener('open', () => {
      this.connected = true;
      this.dispatchEvent(new CustomEvent('open'));
    });
    this.ws.addEventListener('close', () => {
      this.connected = false;
      this.dispatchEvent(new CustomEvent('close'));
    });
    this.ws.addEventListener('error', (e) => {
      this.dispatchEvent(new CustomEvent('error', { detail: e }));
    });
    this.ws.addEventListener('message', (e) => {
      let msg;
      try { msg = JSON.parse(e.data); } catch { return; }
      this.dispatchEvent(new CustomEvent('msg', { detail: msg }));
    });
  }

  send(obj) {
    if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(obj));
  }

  close() {
    if (this.ws) this.ws.close();
    this.ws = null;
    this.connected = false;
  }
}

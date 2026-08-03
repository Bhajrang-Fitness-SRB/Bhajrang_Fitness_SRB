// Replaces 10-sec polling with WebSocket
class RealtimeSync {
  constructor(endpoint) {
    this.ws = new WebSocket(`wss://${endpoint}`);
    this.handlers = {};

    this.ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (this.handlers[data.type]) {
          this.handlers[data.type](data.payload);
        }
      } catch (e) {
        console.error('Failed to parse WS message', e);
      }
    };
  }

  on(eventType, callback) {
    this.handlers[eventType] = callback;
  }

  subscribeTelemetry() {
    this.send({action: 'subscribe', channel: 'telemetry'});
  }

  send(payload) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(payload));
    }
  }
}

// Usage example (in client-side JS):
// const sync = new RealtimeSync('your-app-url.com/ws');
// sync.on('telemetry_update', (data) => { document.getElementById('total_members').textContent = data.total_members; });

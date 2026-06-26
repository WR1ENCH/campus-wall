// ===== lib/sse.js - SSE 实时推送 =====

const sseClients = new Set();
let sseEventCounter = 0;

function broadcastSSE(eventName, payload = {}) {
  const msg = `id: ${++sseEventCounter}\nevent: ${eventName}\ndata: ${JSON.stringify(payload)}\n\n`;
  for (const client of sseClients) {
    try { client.write(msg); } catch (e) {}
  }
}

setInterval(() => {
  const pingMsg = `id: ${++sseEventCounter}\nevent: ping\ndata: ${JSON.stringify({ t: Date.now(), clients: sseClients.size })}\n\n`;
  for (const client of sseClients) {
    try { client.write(pingMsg); } catch (e) {}
  }
}, 15000);

module.exports = { sseClients, broadcastSSE };

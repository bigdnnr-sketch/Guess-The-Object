/* Talks to the server: JSON POSTs for actions, a Server-Sent Events stream for updates.
   app.js only uses emit / on / connect / disconnect, so a different transport
   (for example the offline preview) can stand in without touching the UI. */
window.Transport = (function () {
  'use strict';
  const handlers = { state: [], gone: [], lost: [] };
  let stream = null;
  let session = { code: null, pid: null };

  function fire(name, data) { handlers[name].forEach(fn => fn(data)); }

  function connect(code, pid) {
    disconnect();
    session = { code, pid };
    stream = new EventSource('/events?code=' + encodeURIComponent(code) + '&pid=' + encodeURIComponent(pid));
    stream.addEventListener('state', e => fire('state', JSON.parse(e.data)));
    stream.addEventListener('gone', () => { disconnect(); fire('gone'); });
    // A 404 closes the stream for good (the party no longer exists); network blips just retry.
    stream.onerror = () => { if (stream && stream.readyState === 2) { disconnect(); fire('lost'); } };
  }

  function disconnect() {
    if (stream) { stream.close(); stream = null; }
  }

  async function emit(event, payload, cb) {
    const body = Object.assign({ code: session.code, pid: session.pid }, payload || {});
    let res;
    try {
      const r = await fetch('/api/' + event, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      res = await r.json();
    } catch (e) {
      res = { error: 'Could not reach the server. Check your connection.' };
    }
    if (cb) cb(res);
  }

  function on(name, fn) { handlers[name].push(fn); }

  return { emit, on, connect, disconnect };
})();

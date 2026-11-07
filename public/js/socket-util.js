/* Shared Socket.IO helper: connects to our own server (served locally at
   /socket.io/socket.io.js) and shows a big "Reconnecting…" overlay whenever the
   connection drops, hiding it automatically when it comes back. */
/* global io */

function createSocket({ onReconnect } = {}) {
  const socket = io({
    reconnection: true,
    reconnectionDelay: 500,
    reconnectionDelayMax: 3000,
  });

  const overlay = document.getElementById("reconnect");
  const show = () => overlay && overlay.classList.add("show");
  const hide = () => overlay && overlay.classList.remove("show");

  socket.on("connect", () => {
    hide();
    if (onReconnect) onReconnect();
  });
  socket.on("disconnect", show);
  socket.on("connect_error", show);

  return socket;
}

/* Tiny helper: debounce taps so a double-tap does not count twice. */
function makeDebouncer(ms) {
  let last = 0;
  return function allow() {
    const now = Date.now();
    if (now - last < ms) return false;
    last = now;
    return true;
  };
}

/* Staff hub: builds a QR code to the controller page and wires up the links.
   The host comes from the server's DATAWALL_HOST (set by Ansible); if that is
   not set, the server returns the hostname this page was opened with, and if
   the fetch fails we fall back to window.location.hostname. The port is
   whatever port this /staff page is served on (e.g. 8080); Grafana is :3000. */
/* global QRCode */

const proto = window.location.protocol; // e.g. "http:"
const appPort = window.location.port; // e.g. "8080" ("" for default 80/443)

function build(host) {
  const appOrigin = appPort ? `${proto}//${host}:${appPort}` : `${proto}//${host}`;
  const controllerUrl = `${appOrigin}/controller`;
  const grafanaUrl = `${proto}//${host}:3000`;

  document.getElementById("controller-url").textContent = controllerUrl;
  document.getElementById("a-app").textContent = appOrigin;
  document.getElementById("a-grafana").textContent = grafanaUrl;
  document.getElementById("l-grafana").href = grafanaUrl;

  // Render the QR code locally (no internet).
  new QRCode(document.getElementById("qr"), {
    text: controllerUrl,
    width: 220,
    height: 220,
    correctLevel: QRCode.CorrectLevel.M,
  });
}

fetch("/api/config")
  .then((r) => r.json())
  .then((cfg) => build(cfg.host || window.location.hostname))
  .catch(() => build(window.location.hostname));

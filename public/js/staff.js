/* Staff hub: builds a QR code to the controller page and wires up the links.
   The Grafana link uses the hostname this page was opened with, on port 3000. */
/* global QRCode */

const origin = window.location.origin; // e.g. http://datawall.local:8080
const host = window.location.hostname; // e.g. datawall.local
const controllerUrl = `${origin}/controller`;
const grafanaUrl = `${window.location.protocol}//${host}:3000`;

document.getElementById("controller-url").textContent = controllerUrl;
document.getElementById("a-app").textContent = origin;
document.getElementById("a-grafana").textContent = grafanaUrl;
document.getElementById("l-grafana").href = grafanaUrl;

// Render the QR code locally (no internet).
new QRCode(document.getElementById("qr"), {
  text: controllerUrl,
  width: 220,
  height: 220,
  correctLevel: QRCode.CorrectLevel.M,
});

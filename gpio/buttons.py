#!/usr/bin/env python3
"""Optional GPIO arcade-button service for the STEM Data Wall.

Four buttons wired to the Raspberry Pi 5's GPIO act as a backup for the iPad:
they post to the app's /api/input endpoint on localhost, driving the exact same
game logic (board columns 1-4 / answers A-D).

Wiring (active-low with the Pi's internal pull-ups):
  each button connects its GPIO pin to GND; pressing pulls the pin LOW.

This uses gpiozero with the lgpio backend, which is the Pi 5-compatible pin
factory. Disabled by default — the Ansible "buttons" role only installs and
enables it when buttons_enabled=true.

Config via environment variables (set by the systemd unit):
  BUTTON_PINS  comma-separated BCM pin numbers (default "17,27,22,23")
  APP_URL      base URL of the app   (default "http://127.0.0.1:8080")
"""
import json
import os
import sys
import urllib.request
from signal import pause

APP_URL = os.environ.get("APP_URL", "http://127.0.0.1:8080").rstrip("/")
PINS = [int(p) for p in os.environ.get("BUTTON_PINS", "17,27,22,23").split(",") if p.strip()]


def post_number(n):
    """Tell the app a button was pressed (same as number-pad key n)."""
    data = json.dumps({"number": n}).encode()
    req = urllib.request.Request(
        APP_URL + "/api/input",
        data=data,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        urllib.request.urlopen(req, timeout=2)
    except Exception as e:  # noqa: BLE001 - keep running even if a press fails
        print(f"[buttons] POST failed: {e}", file=sys.stderr)


def main():
    try:
        from gpiozero import Button, Device
        from gpiozero.pins.lgpio import LGPIOFactory
    except ImportError:
        print(
            "[buttons] gpiozero/lgpio not installed. On the Pi:\n"
            "  sudo apt install -y python3-gpiozero python3-lgpio",
            file=sys.stderr,
        )
        sys.exit(1)

    # lgpio is the Pi 5-compatible backend.
    Device.pin_factory = LGPIOFactory()

    buttons = []
    for index, pin in enumerate(PINS, start=1):
        # pull_up=True -> internal pull-up; button shorts the pin to GND (active low).
        b = Button(pin, pull_up=True, bounce_time=0.05)
        b.when_pressed = (lambda n: (lambda: post_number(n)))(index)
        buttons.append(b)
        print(f"[buttons] button {index} -> GPIO{pin}")

    print(f"[buttons] ready; posting to {APP_URL}/api/input")
    pause()


if __name__ == "__main__":
    main()

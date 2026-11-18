(() => {
  "use strict";

  // PolyStar controller support. Uses the game's existing keyboard bindings,
  // so controller input works with the same vehicle-control path as the keyboard.
  const DEADZONE = 0.18;
  const PRESS_THRESHOLD = 0.35;
  const CONTROL_KEYS = ["KeyW", "KeyA", "KeyS", "KeyD"];
  const held = new Set();
  let resetPulse = false;
  let statusNode = null;
  let lastPadId = "";

  function sendKey(code, type) {
    window.dispatchEvent(new KeyboardEvent(type, {
      code,
      key: ({
        KeyW: "w", KeyA: "a", KeyS: "s", KeyD: "d",
        KeyR: "r", KeyT: "t"
      })[code] || code,
      bubbles: true,
      cancelable: true
    }));
  }

  function setHeld(code, down) {
    if (down && !held.has(code)) {
      held.add(code);
      sendKey(code, "keydown");
    } else if (!down && held.has(code)) {
      held.delete(code);
      sendKey(code, "keyup");
    }
  }

  function buttonPressed(pad, index, threshold = 0.5) {
    const button = pad.buttons[index];
    return !!button && (button.pressed || button.value >= threshold);
  }

  function ensureStatus() {
    if (statusNode) return;
    statusNode = document.createElement("div");
    statusNode.id = "polystar-gamepad-status";
    statusNode.style.cssText = [
      "position:fixed", "left:12px", "bottom:12px", "z-index:2147483000",
      "padding:7px 10px", "border:1px solid rgba(255,255,255,.22)",
      "border-radius:8px", "background:rgba(15,20,28,.88)", "color:#fff",
      "font:12px/1.35 system-ui,sans-serif", "pointer-events:none",
      "box-shadow:0 2px 10px #0005"
    ].join(";");
    statusNode.textContent = "Controller connected · Left stick / D-pad to steer";
    document.body.appendChild(statusNode);
  }

  function removeStatus() {
    if (statusNode) statusNode.remove();
    statusNode = null;
  }

  function releaseAll() {
    for (const code of [...held]) setHeld(code, false);
    resetPulse = false;
  }

  function poll() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    let pad = null;
    for (const candidate of pads) {
      if (candidate && candidate.connected) {
        pad = candidate;
        break;
      }
    }

    if (!pad) {
      releaseAll();
      lastPadId = "";
      removeStatus();
      requestAnimationFrame(poll);
      return;
    }

    if (pad.id !== lastPadId) {
      lastPadId = pad.id;
      ensureStatus();
      statusNode.textContent = "Controller connected · RT accelerate · LT brake";
    } else {
      ensureStatus();
    }

    const axis = Number.isFinite(pad.axes[0]) ? pad.axes[0] : 0;
    const steer = Math.abs(axis) < DEADZONE ? 0 : axis;
    const accelerate = (pad.buttons[7]?.value || 0) >= PRESS_THRESHOLD ||
      buttonPressed(pad, 12);
    const brake = (pad.buttons[6]?.value || 0) >= PRESS_THRESHOLD ||
      buttonPressed(pad, 13);
    const left = steer < -DEADZONE || buttonPressed(pad, 14);
    const right = steer > DEADZONE || buttonPressed(pad, 15);

    setHeld("KeyW", accelerate);
    setHeld("KeyS", brake);
    setHeld("KeyA", left);
    setHeld("KeyD", right);

    // Y / Triangle: checkpoint reset. A short key pulse triggers the game's
    // existing checkpoint-reset action without repeating while held.
    const resetDown = buttonPressed(pad, 3);
    if (resetDown && !resetPulse) {
      sendKey("KeyR", "keydown");
      resetPulse = true;
    } else if (!resetDown && resetPulse) {
      sendKey("KeyR", "keyup");
      resetPulse = false;
    }

    requestAnimationFrame(poll);
  }

  window.addEventListener("gamepaddisconnected", () => {
    releaseAll();
    lastPadId = "";
    removeStatus();
  });

  window.addEventListener("pagehide", releaseAll);
  requestAnimationFrame(poll);
})();

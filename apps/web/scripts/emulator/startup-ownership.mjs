import {
  closeSync,
  existsSync,
  fstatSync,
  ftruncateSync,
  openSync,
  readFileSync,
  statSync,
  writeFileSync,
  writeSync,
} from "node:fs";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";

export class StartupOwnership {
  constructor(statePath, state) {
    this.statePath = statePath;
    this.state = state;
    this.descriptor = openSync(statePath, "wx");
    writeSync(this.descriptor, `${JSON.stringify(state, null, 2)}\n`);
  }

  assertCurrent() {
    let current;
    try {
      current = statSync(this.statePath);
    } catch {}
    const claimed = fstatSync(this.descriptor);
    if (
      current?.ino !== claimed.ino ||
      current?.dev !== claimed.dev ||
      existsSync(stopPath(this.state))
    ) {
      throw new Error("Emulator startup ownership ended");
    }
  }

  start(createChild) {
    this.assertCurrent();
    const pid = createChild();
    this.state.pids.push(pid);
    this.publish();
    return pid;
  }

  publish() {
    this.assertCurrent();
    // Keep writing the claimed inode: deleting it cannot make a late startup recreate state or overwrite a new owner.
    const data = `${JSON.stringify(this.state, null, 2)}\n`;
    writeSync(this.descriptor, data, 0, "utf8");
    ftruncateSync(this.descriptor, Buffer.byteLength(data));
    this.assertCurrent();
  }

  close() {
    closeSync(this.descriptor);
  }
}

export function stopStartup(state) {
  writeFileSync(stopPath(state), "stopping\n");
}

function stopPath(state) {
  return path.join(state.runDir, "stopping");
}

export async function readStartupState(statePath) {
  for (let attempt = 0; ; attempt += 1) {
    let raw;
    try {
      raw = readFileSync(statePath, "utf8");
    } catch (error) {
      if (error.code === "ENOENT") return;
      throw error;
    }
    try {
      return JSON.parse(raw);
    } catch (error) {
      if (attempt === 3) throw error;
      await delay(10);
    }
  }
}

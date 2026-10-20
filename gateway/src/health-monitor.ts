import { getEnabledServers } from "./db.js";
import { UpstreamClientManager } from "./upstream-manager.js";

export class HealthMonitor {
  private timer: NodeJS.Timeout | null = null;
  private intervalMs: number = 15000; // 15-second background health ping (GATE-06, GATE-07)

  constructor(private upstreamManager: UpstreamClientManager) {}

  start() {
    console.log(`[health-monitor] Starting upstream background health monitoring (interval: ${this.intervalMs}ms)...`);
    // Run an initial ping immediately
    this.pollAll();
    this.timer = setInterval(() => this.pollAll(), this.intervalMs);
    this.timer.unref();
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async pollAll() {
    try {
      const servers = await getEnabledServers();
      for (const server of servers) {
        await this.upstreamManager.pingServer(server);
      }
    } catch (err: any) {
      console.error("[health-monitor] Error during background upstream polling:", err.message || err);
    }
  }
}

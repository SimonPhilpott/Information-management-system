/**
 * IMS Ring Doorbell Direct API Service
 * Integrates ring-client-api to provide real-time Ring doorbell event streaming
 * (SIP/WebSockets), persistent 2FA token storage, snapshot grabbing, and 
 * push notifications to the ESP32-S3-BOX-3 with Yorkshire spoken announcements.
 */

import { EventEmitter } from "events";
import { RingApi } from "ring-client-api";
import db, { getSetting, setSetting } from "../db/database.js";

// Initialize SQLite table for doorbell event logging
db.exec(`
  CREATE TABLE IF NOT EXISTS doorbell_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_type TEXT NOT NULL,       -- 'ding' (button press) | 'motion' (motion detected)
    camera_id TEXT,
    camera_name TEXT NOT NULL,
    location_name TEXT,
    battery_level INTEGER,
    snapshot_url TEXT,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_doorbell_events_created_at ON doorbell_events(created_at);
`);

class DoorbellService extends EventEmitter {
  constructor() {
    super();
    this.ringApi = null;
    this.activeSubscriptions = [];
    this.cameras = [];
    this.isConnecting = false;
    this.lastError = null;
    this.status = "unconfigured"; // 'unconfigured' | 'connecting' | 'connected' | 'error'
    this.lastDingTime = 0;
    this.lastMotionTime = 0;
    this.activeAlert = null;
    this.alertClearTimer = null;
  }

  /**
   * Yorkshire persona spoken announcement generators
   */
  getYorkshireAnnouncement(eventType, cameraName = "front door") {
    const isFrontDoor = !cameraName || cameraName.toLowerCase().includes("front") || cameraName.toLowerCase().includes("door");
    const loc = isFrontDoor ? "front door" : cameraName;

    if (eventType === "ding") {
      const dingPhrases = [
        `Hold on Simon, someone's at ${loc}!`,
        `Doorbell's gone, lad. Someone's outside.`,
        `Ey up Simon, there's somebody ringing the bell at ${loc}.`,
        `Right then, visitor at ${loc}! Best see who's knocking.`,
        `Doorbell's chiming, Simon. Better have a look.`
      ];
      return dingPhrases[Math.floor(Math.random() * dingPhrases.length)];
    } else {
      const motionPhrases = [
        `Ey up, there's movement out front by ${loc}.`,
        `Someone's milling about near ${loc}, Simon.`,
        `Motion detected at ${loc}.`,
        `Just a heads up Simon, sensor tripped at ${loc}.`
      ];
      return motionPhrases[Math.floor(Math.random() * motionPhrases.length)];
    }
  }

  /**
   * Initializes or re-initializes the Ring connection using the stored refresh token.
   */
  async init() {
    const token = getSetting("ring_refresh_token");
    if (!token || !token.trim()) {
      this.status = "unconfigured";
      this.lastError = "No Ring refresh token configured. Use 'npx -p ring-client-api ring-auth-cli' to generate a 2FA refresh token.";
      console.log(`[DoorbellService] 🔔 ${this.lastError}`);
      return false;
    }

    this.cleanupSubscriptions();
    this.isConnecting = true;
    this.status = "connecting";
    this.lastError = null;

    try {
      console.log("[DoorbellService] 🔔 Connecting to Ring API with refresh token...");
      this.ringApi = new RingApi({
        refreshToken: token.trim(),
        debug: false,
        cameraStatusPollingSeconds: 30
      });

      // Handle automatic token refresh and persist new token
      this.ringApi.onRefreshTokenUpdated.subscribe(async ({ newRefreshToken }) => {
        if (newRefreshToken) {
          console.log("[DoorbellService] 🔔 Ring refresh token automatically rotated by Ring API. Persisting to database...");
          setSetting("ring_refresh_token", newRefreshToken);
        }
      });

      // Discover locations and cameras
      const locations = await this.ringApi.getLocations();
      console.log(`[DoorbellService] 🔔 Found ${locations.length} Ring location(s)`);

      this.cameras = [];
      for (const location of locations) {
        const cameras = location.cameras || [];
        for (const camera of cameras) {
          const camMeta = {
            id: String(camera.id),
            name: camera.name || "Doorbell",
            kind: camera.deviceType || "doorbell",
            hasDoorbell: camera.isDoorbot || camera.doorbell || true,
            batteryLevel: camera.batteryLevel ?? null,
            location: location.name || "Home"
          };
          this.cameras.push(camMeta);

          // Subscribe to doorbell press (ding)
          const dingSub = camera.onDoorbellPressed.subscribe(() => {
            this.handleCameraEvent("ding", camera, location.name);
          });
          this.activeSubscriptions.push(dingSub);

          // Subscribe to motion detection
          const motionSub = camera.onMotionDetected.subscribe((motionActive) => {
            if (motionActive) {
              this.handleCameraEvent("motion", camera, location.name);
            }
          });
          this.activeSubscriptions.push(motionSub);

          console.log(`[DoorbellService] 🔔 Subscribed to events on camera: "${camMeta.name}" (${camMeta.id})`);
        }
      }

      this.status = "connected";
      this.isConnecting = false;
      this.lastError = null;
      console.log(`[DoorbellService] ✅ Successfully connected to Ring API (${this.cameras.length} camera(s) active)`);
      this.emit("statusChange", this.getStatus());
      return true;
    } catch (err) {
      this.status = "error";
      this.isConnecting = false;
      this.lastError = err.message || "Failed to connect to Ring API";
      console.error("[DoorbellService] ❌ Ring API connection failed:", err.message);
      this.emit("statusChange", this.getStatus());
      return false;
    }
  }

  /**
   * Handles incoming ding or motion event from Ring API
   */
  async handleCameraEvent(eventType, camera, locationName = "Home") {
    const now = Date.now();
    const cameraName = camera?.name || "Front Door";
    const cameraId = String(camera?.id || "unknown");
    const batteryLevel = camera?.batteryLevel ?? null;

    // Throttle duplicate dings within 10 seconds, and duplicate motions within 30 seconds
    if (eventType === "ding" && now - this.lastDingTime < 10000) {
      console.log(`[DoorbellService] 🔔 Throttling duplicate ding event on "${cameraName}"`);
      return;
    }
    if (eventType === "motion" && now - this.lastMotionTime < 30000) {
      console.log(`[DoorbellService] 🔔 Throttling duplicate motion event on "${cameraName}"`);
      return;
    }

    if (eventType === "ding") this.lastDingTime = now;
    if (eventType === "motion") this.lastMotionTime = now;

    console.log(`[DoorbellService] 🚨 RING EVENT: ${eventType.toUpperCase()} on "${cameraName}" (${locationName})`);

    // Log event into database
    try {
      db.prepare(`
        INSERT INTO doorbell_events (event_type, camera_id, camera_name, location_name, battery_level, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(eventType, cameraId, cameraName, locationName, batteryLevel, now);
    } catch (err) {
      console.error("[DoorbellService] Failed to log event to DB:", err.message);
    }

    const yorkshirePhrase = this.getYorkshireAnnouncement(eventType, cameraName);

    const alertPayload = {
      event: eventType,
      cameraName,
      cameraId,
      locationName,
      batteryLevel,
      yorkshirePhrase,
      timestamp: now,
      timeFormatted: new Date(now).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" })
    };

    this.activeAlert = alertPayload;
    if (this.alertClearTimer) clearTimeout(this.alertClearTimer);
    this.alertClearTimer = setTimeout(() => {
      this.activeAlert = null;
      this.emit("alertCleared");
    }, 45000); // clear active alert banner after 45 seconds

    // Emit event for server/index.js to push to ESP32-S3-BOX-3 and web UI
    this.emit(eventType, alertPayload);
    this.emit("doorbellEvent", alertPayload);
  }

  /**
   * Triggers a synthetic test event (ding or motion) for testing and verification
   */
  async triggerTestEvent(eventType = "ding", customCameraName = "Front Door") {
    console.log(`[DoorbellService] 🧪 Triggering test ${eventType} alert...`);
    const mockCamera = {
      name: customCameraName,
      id: "test-camera-1",
      batteryLevel: 94
    };
    await this.handleCameraEvent(eventType, mockCamera, "Home");
    return this.activeAlert;
  }

  /**
   * Grabs a fresh JPEG snapshot from a camera
   */
  async getCameraSnapshot(cameraId) {
    if (!this.ringApi) throw new Error("Ring API is not connected");
    const locations = await this.ringApi.getLocations();
    for (const location of locations) {
      const camera = location.cameras.find((c) => String(c.id) === String(cameraId));
      if (camera) {
        return await camera.getSnapshot();
      }
    }
    throw new Error(`Camera with ID ${cameraId} not found`);
  }

  /**
   * Cleans up any existing subscriptions
   */
  cleanupSubscriptions() {
    for (const sub of this.activeSubscriptions) {
      try {
        if (typeof sub.unsubscribe === "function") sub.unsubscribe();
      } catch (_) { }
    }
    this.activeSubscriptions = [];
  }

  /**
   * Returns current service status and camera summaries
   */
  getStatus() {
    const hasToken = !!(getSetting("ring_refresh_token") || "").trim();
    return {
      status: this.status,
      configured: hasToken,
      isConnecting: this.isConnecting,
      lastError: this.lastError,
      cameraCount: this.cameras.length,
      cameras: this.cameras,
      activeAlert: this.activeAlert,
      lastDingTime: this.lastDingTime,
      lastMotionTime: this.lastMotionTime
    };
  }

  /**
   * Returns recent doorbell event history
   */
  getEvents(limit = 50) {
    try {
      return db.prepare(`
        SELECT id, event_type, camera_id, camera_name, location_name, battery_level, created_at
        FROM doorbell_events
        ORDER BY created_at DESC
        LIMIT ?
      `).all(limit);
    } catch (err) {
      console.error("[DoorbellService] Failed to fetch events:", err.message);
      return [];
    }
  }

  /**
   * Saves or updates the Ring 2FA Refresh Token
   */
  async saveRefreshToken(token) {
    if (!token || !token.trim()) {
      setSetting("ring_refresh_token", "");
      this.status = "unconfigured";
      this.cleanupSubscriptions();
      this.cameras = [];
      return { success: true, message: "Token cleared" };
    }

    setSetting("ring_refresh_token", token.trim());
    const connected = await this.init();
    return {
      success: connected,
      status: this.status,
      error: this.lastError
    };
  }
}

export const doorbellService = new DoorbellService();
export default doorbellService;

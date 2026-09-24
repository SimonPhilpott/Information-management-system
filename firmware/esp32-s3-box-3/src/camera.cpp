#include "camera.h"

#include <Arduino.h>
#include <HTTPClient.h>
#include <WiFi.h>
#include <stdarg.h>
#include "esp_heap_caps.h"
#include "usb/usb_host.h"
#include "usb/uvc_host.h"

// Everything USB/camera related runs in tasks on Core 1 (audio owns Core 0).
// The USB library callbacks stay tiny (copy a frame, set a flag); all real
// work - opening/closing the stream, HTTP uploads, logging - happens in
// cameraManagerTask(), so USB timing is never held up by the network.

static const char *g_host = nullptr;
static uint16_t g_port = 0;
static bool g_started = false;

static volatile bool g_wantAwake = true;   // boot initialises the camera; the backend then takes over
static volatile bool g_present = false;    // a UVC device is enumerated
static volatile bool g_newDevice = false;  // enumeration just happened - dump its formats
static volatile bool g_needClose = false;  // device vanished while a stream was open
static volatile uint8_t g_devAddr = 0;
static volatile uint8_t g_streamIdx = 0;
static uint32_t g_bootGraceUntil = 0;      // ignore "asleep" pushes while the first wake settles
static uvc_host_stream_hdl_t g_stream = nullptr;
static volatile bool g_streaming = false;

// Newest MJPEG frame, written by the USB frame callback, read by the uploader.
static const size_t JPG_MAX = 200 * 1024;
static uint8_t *g_jpg = nullptr;
static uint8_t *g_tx = nullptr;
static volatile size_t g_jpgLen = 0;
static volatile uint32_t g_jpgSeq = 0;
static uint32_t g_sentSeq = 0;
static SemaphoreHandle_t g_jpgMux = nullptr;

// Diagnostic lines, drained to the backend by the manager task (the box has
// no serial port to read while it's running as a camera host).
static QueueHandle_t g_logQ = nullptr;
static void camLogf(const char *fmt, ...) {
  char buf[160];
  va_list ap;
  va_start(ap, fmt);
  vsnprintf(buf, sizeof(buf), fmt, ap);
  va_end(ap);
  Serial.println(buf);
  if (g_logQ) xQueueSend(g_logQ, buf, 0);
}

static void usbDaemonTask(void *) {
  for (;;) {
    uint32_t flags = 0;
    usb_host_lib_handle_events(portMAX_DELAY, &flags);
    if (flags & USB_HOST_LIB_EVENT_FLAGS_NO_CLIENTS) usb_host_device_free_all();
  }
}


// ---- Raw USB diagnostics ---------------------------------------------------
// The UVC driver only speaks up for devices it accepts as video. This second,
// plain host client reports EVERY device the port sees (speed, IDs, video
// endpoint sizes), so "camera not powered / not seen at all" can be told
// apart from "seen, but not accepted as UVC".
static usb_host_client_handle_t g_diagClient = nullptr;
static volatile bool g_diagNew = false, g_diagGone = false;
static volatile uint8_t g_diagAddr = 0;
static uint32_t g_devicesSeen = 0;

static void diagClientCb(const usb_host_client_event_msg_t *msg, void *) {
  if (msg->event == USB_HOST_CLIENT_EVENT_NEW_DEV) {
    g_diagAddr = msg->new_dev.address;
    g_diagNew = true;
  } else if (msg->event == USB_HOST_CLIENT_EVENT_DEV_GONE) {
    g_diagGone = true;
  }
}

static void describeDevice(uint8_t addr) {
  usb_device_handle_t dev = nullptr;
  if (usb_host_device_open(g_diagClient, addr, &dev) != ESP_OK) {
    camLogf("[USB] device %u seen but could not be opened", (unsigned)addr);
    return;
  }
  usb_device_info_t info = {};
  usb_host_device_info(dev, &info);
  const usb_device_desc_t *dd = nullptr;
  usb_host_get_device_descriptor(dev, &dd);
  if (dd) {
    camLogf("[USB] device %u: VID %04X PID %04X class %02X speed %s", (unsigned)addr, dd->idVendor, dd->idProduct,
            dd->bDeviceClass, info.speed == USB_SPEED_FULL ? "FULL" : info.speed == USB_SPEED_HIGH ? "HIGH" : "LOW");
  }
  const usb_config_desc_t *cd = nullptr;
  if (usb_host_get_active_config_descriptor(dev, &cd) == ESP_OK && cd) {
    camLogf("[USB]   config: %u interfaces, %u bytes", (unsigned)cd->bNumInterfaces, (unsigned)cd->wTotalLength);
    const uint8_t *p = (const uint8_t *)cd;
    uint16_t total = cd->wTotalLength;
    int lines = 0;
    bool inVideoStream = false;
    uint8_t alt = 0;
    for (uint16_t i = 0; i + 1 < total && p[i] != 0 && lines < 24; i += p[i]) {
      if (p[i + 1] == 0x04) { // interface descriptor
        inVideoStream = (p[i + 5] == 0x0E && p[i + 6] == 0x02); // Video / VideoStreaming
        alt = p[i + 3];
        if (p[i + 5] == 0x0E && alt == 0) {
          camLogf("[USB]   video interface %u (%s)", (unsigned)p[i + 2], p[i + 6] == 0x01 ? "control" : p[i + 6] == 0x02 ? "streaming" : "other");
          lines++;
        }
      } else if (p[i + 1] == 0x05 && inVideoStream) { // endpoint in a video-streaming interface
        camLogf("[USB]     alt %u ep 0x%02X type %u max packet %u", (unsigned)alt, (unsigned)p[i + 2], (unsigned)(p[i + 3] & 3),
                (unsigned)(p[i + 4] | (p[i + 5] << 8)));
        lines++;
      }
    }
  }
  usb_host_device_close(g_diagClient, dev);
}

static void diagTask(void *) {
  uint32_t lastAlive = 0;
  for (;;) {
    usb_host_client_handle_events(g_diagClient, pdMS_TO_TICKS(500));
    if (g_diagNew) {
      g_diagNew = false;
      g_devicesSeen++;
      camLogf("[USB] a device was detected on the port");
      describeDevice(g_diagAddr);
    }
    if (g_diagGone) {
      g_diagGone = false;
      camLogf("[USB] a device was removed");
    }
    if (millis() - lastAlive > 30000) {
      lastAlive = millis();
      usb_host_lib_info_t li = {};
      usb_host_lib_info(&li);
      camLogf("[USB] host alive - devices seen so far: %u (lib: %d devices, %d clients)", (unsigned)g_devicesSeen, li.num_devices, li.num_clients);
    }
  }
}

static void driverEventCb(const uvc_host_driver_event_data_t *ev, void *) {
  if (ev->type == UVC_HOST_DRIVER_EVENT_DEVICE_CONNECTED) {
    g_devAddr = ev->device_connected.dev_addr;
    g_streamIdx = ev->device_connected.uvc_stream_index;
    g_present = true;
    g_newDevice = true;
  }
}

static void streamEventCb(const uvc_host_stream_event_data_t *ev, void *) {
  switch (ev->type) {
  case UVC_HOST_DEVICE_DISCONNECTED:
    g_present = false;
    g_streaming = false;
    g_needClose = true;
    break;
  case UVC_HOST_TRANSFER_ERROR:
    break; // counted/reported by the manager if frames stop arriving
  default:
    break;
  }
}

static bool frameCb(const uvc_host_frame_t *frame, void *) {
  if (frame->vs_format.format == UVC_VS_FORMAT_MJPEG && frame->data_len > 0 && frame->data_len <= JPG_MAX &&
      xSemaphoreTake(g_jpgMux, 0) == pdTRUE) {
    memcpy(g_jpg, frame->data, frame->data_len);
    g_jpgLen = frame->data_len;
    g_jpgSeq++;
    xSemaphoreGive(g_jpgMux);
  }
  return true; // frame handled; buffer goes straight back to the driver
}

static void dumpFormats() {
  size_t n = 0;
  uvc_host_get_frame_list(g_devAddr, g_streamIdx, nullptr, &n);
  camLogf("[Camera] UVC device connected (addr %u, %u frame formats)", (unsigned)g_devAddr, (unsigned)n);
  if (n == 0 || n > 40) return;
  uvc_host_frame_info_t *list = (uvc_host_frame_info_t *)calloc(n, sizeof(uvc_host_frame_info_t));
  if (!list) return;
  size_t cap = n;
  if (uvc_host_get_frame_list(g_devAddr, g_streamIdx, (uvc_host_frame_info_t(*)[])list, &cap) == ESP_OK) {
    for (size_t i = 0; i < cap; i++) {
      const char *fmt = list[i].format == UVC_VS_FORMAT_MJPEG ? "MJPEG" : list[i].format == UVC_VS_FORMAT_YUY2 ? "YUY2" : "other";
      camLogf("[Camera]   format %u: %s %ux%u", (unsigned)i, fmt, list[i].h_res, list[i].v_res);
    }
  }
  free(list);
}

static bool openAndStart() {
  // Full-speed USB carries very little, so try small MJPEG modes first-class
  // and fall back through smaller ones until the camera accepts one.
  static const struct { unsigned w, h; float fps; } tries[] = {
      {640, 480, 15}, {320, 240, 15}, {640, 480, 10}, {320, 240, 30}, {160, 120, 15}};
  for (auto &t : tries) {
    uvc_host_stream_config_t cfg = {};
    cfg.event_cb = streamEventCb;
    cfg.frame_cb = frameCb;
    cfg.usb.dev_addr = 0;
    cfg.usb.vid = 0;
    cfg.usb.pid = 0;
    cfg.usb.uvc_stream_index = 0;
    cfg.vs_format.h_res = t.w;
    cfg.vs_format.v_res = t.h;
    cfg.vs_format.fps = t.fps;
    cfg.vs_format.format = UVC_VS_FORMAT_MJPEG;
    cfg.advanced.number_of_frame_buffers = 2;
    cfg.advanced.frame_size = 0;
    cfg.advanced.frame_heap_caps = MALLOC_CAP_SPIRAM;
    cfg.advanced.number_of_urbs = 3;
    cfg.advanced.urb_size = 0;
    esp_err_t e = uvc_host_stream_open(&cfg, 1000, &g_stream);
    if (e != ESP_OK) {
      camLogf("[Camera] open %ux%u@%.0f failed: %s", t.w, t.h, t.fps, esp_err_to_name(e));
      g_stream = nullptr;
      continue;
    }
    e = uvc_host_stream_start(g_stream);
    if (e != ESP_OK) {
      camLogf("[Camera] start %ux%u@%.0f failed: %s", t.w, t.h, t.fps, esp_err_to_name(e));
      uvc_host_stream_close(g_stream);
      g_stream = nullptr;
      continue;
    }
    camLogf("[Camera] streaming MJPEG %ux%u @ %.0f fps", t.w, t.h, t.fps);
    g_streaming = true;
    return true;
  }
  return false;
}

static void closeStream() {
  if (!g_stream) return;
  uvc_host_stream_stop(g_stream);
  uvc_host_stream_close(g_stream);
  g_stream = nullptr;
  g_streaming = false;
  camLogf("[Camera] stream stopped (camera asleep)");
}

static bool postBytes(const char *path, const uint8_t *data, size_t len, const char *contentType) {
  if (WiFi.status() != WL_CONNECTED) return false;
  HTTPClient http;
  String url = String("http://") + g_host + ":" + g_port + path;
  http.setConnectTimeout(2000);
  http.setTimeout(3000);
  if (!http.begin(url)) return false;
  http.addHeader("Content-Type", contentType);
  int code = http.POST((uint8_t *)data, len);
  http.end();
  return code == 200;
}

static void cameraManagerTask(void *) {
  uint32_t nextTryMs = 0, lastUploadMs = 0, lastBeatMs = 0;
  bool bootBeatSent = false;
  char line[160];

  for (;;) {
    vTaskDelay(pdMS_TO_TICKS(250));

    if (g_newDevice) {
      g_newDevice = false;
      dumpFormats();
    }
    if (g_needClose && g_stream) {
      uvc_host_stream_close(g_stream);
      g_stream = nullptr;
      g_needClose = false;
      camLogf("[Camera] camera unplugged");
    }

    const bool want = g_present && g_wantAwake;
    if (want && !g_stream && millis() >= nextTryMs) {
      if (!openAndStart()) nextTryMs = millis() + 8000; // don't hammer a camera that won't stream
    } else if (!want && g_stream) {
      closeStream();
    }

    // "A camera is attached" heartbeat (the very first also tells the backend
    // this was a boot, which wakes the camera for its 10 minutes).
    if (g_present && millis() - lastBeatMs > 10000) {
      lastBeatMs = millis();
      if (postBytes(bootBeatSent ? "/device/camera/heartbeat" : "/device/camera/heartbeat?boot=1", (const uint8_t *)"", 0, "text/plain")) bootBeatSent = true;
    }

    // Newest frame -> backend, ~2 per second while awake and streaming.
    if (g_streaming && g_jpgSeq != g_sentSeq && millis() - lastUploadMs > 500) {
      size_t len = 0;
      if (xSemaphoreTake(g_jpgMux, pdMS_TO_TICKS(20)) == pdTRUE) {
        len = g_jpgLen;
        if (len > 0) memcpy(g_tx, g_jpg, len);
        g_sentSeq = g_jpgSeq;
        xSemaphoreGive(g_jpgMux);
      }
      if (len > 0) {
        postBytes("/device/camera/frame", g_tx, len, "image/jpeg");
        lastUploadMs = millis();
      }
    }

    // Drain diagnostic log lines (a few per pass so uploads aren't starved).
    for (int i = 0; i < 4 && xQueueReceive(g_logQ, line, 0) == pdTRUE; i++) {
      postBytes("/device/camera/log", (const uint8_t *)line, strlen(line), "text/plain");
    }
  }
}

void cameraBegin(const char *backendHost, uint16_t httpPort) {
  if (g_started) return;
  g_host = backendHost;
  g_port = httpPort;
  g_bootGraceUntil = millis() + 45000;

  g_jpg = (uint8_t *)heap_caps_malloc(JPG_MAX, MALLOC_CAP_SPIRAM);
  g_tx = (uint8_t *)heap_caps_malloc(JPG_MAX, MALLOC_CAP_SPIRAM);
  g_jpgMux = xSemaphoreCreateMutex();
  g_logQ = xQueueCreate(64, 160);
  if (!g_jpg || !g_tx || !g_jpgMux || !g_logQ) {
    Serial.println("[Camera] out of memory - camera disabled");
    return;
  }

  camLogf("[Camera] starting USB host (COM3 unavailable while running)");
  // The USB-Serial/JTAG driver behind COM3 (Arduino's "Serial") owns the
  // S3's single internal USB PHY. Release it first, or the OTG host below
  // installs "successfully" yet never sees a device on the wires.
  delay(100);
  Serial.end();
  delay(200);
  usb_host_config_t hc = {};
  hc.skip_phy_setup = false;
  hc.intr_flags = ESP_INTR_FLAG_LEVEL1;
  esp_err_t e = usb_host_install(&hc);
  if (e != ESP_OK) {
    camLogf("[Camera] usb_host_install failed: %s", esp_err_to_name(e));
    return;
  }
  xTaskCreatePinnedToCore(usbDaemonTask, "usb_lib", 4096, nullptr, 5, nullptr, 1);
  camLogf("[USB] root port power: %s", esp_err_to_name(usb_host_lib_set_root_port_power(true)));

  usb_host_client_config_t cc = {};
  cc.is_synchronous = false;
  cc.max_num_event_msg = 5;
  cc.async.client_event_callback = diagClientCb;
  cc.async.callback_arg = nullptr;
  if (usb_host_client_register(&cc, &g_diagClient) == ESP_OK) {
    xTaskCreatePinnedToCore(diagTask, "usb_diag", 4096, nullptr, 4, nullptr, 1);
  } else {
    camLogf("[USB] diagnostic client could not be registered");
  }

  uvc_host_driver_config_t dc = {};
  dc.driver_task_stack_size = 4096;
  dc.driver_task_priority = 5;
  dc.xCoreID = 1;
  dc.create_background_task = true;
  dc.event_cb = driverEventCb;
  dc.user_ctx = nullptr;
  e = uvc_host_install(&dc);
  if (e != ESP_OK) {
    camLogf("[Camera] uvc_host_install failed: %s", esp_err_to_name(e));
    return;
  }

  g_started = true;
  xTaskCreatePinnedToCore(cameraManagerTask, "cam_mgr", 8192, nullptr, 3, nullptr, 1);
  camLogf("[Camera] host ready, waiting for a camera");
}

void cameraSetAwake(bool awake) {
  if (!g_started) return;
  // The first status pushes after boot can predate the backend hearing the
  // boot heartbeat; don't let a stale "asleep" undo the boot wake.
  if (!awake && (int32_t)(g_bootGraceUntil - millis()) > 0) return;
  g_wantAwake = awake;
}

bool cameraStarted() { return g_started; }
bool cameraPresent() { return g_present; }

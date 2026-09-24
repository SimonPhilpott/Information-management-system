#pragma once
#include <stdint.h>

// USB webcam (UVC) support for the desk dock's USB-A port.
//
// The ESP32-S3 has ONE USB PHY, shared between the USB-Serial/JTAG port (COM3:
// flashing + serial log) and USB host. Starting host mode therefore takes the
// PC serial link away, which is why main.cpp only calls cameraBegin() when no
// PC is plugged in (the box is running from the dock's own power).
//
// The camera is woken at boot and then follows the backend's awake/asleep
// state (awake ~10 min after boot or any use, then asleep). Awake = the UVC
// stream is running and JPEG frames are posted to the backend at ~2 fps;
// asleep = the stream is stopped so the camera idles.
void cameraBegin(const char *backendHost, uint16_t httpPort);
void cameraSetAwake(bool awake); // from the backend's status push
bool cameraStarted();            // cameraBegin() ran
bool cameraPresent();            // a UVC camera is enumerated

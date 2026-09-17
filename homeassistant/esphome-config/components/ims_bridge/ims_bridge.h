#pragma once

#include "esphome/core/component.h"
#include "esphome/components/audio/audio.h"
#include "esphome/components/microphone/microphone.h"
#include "esphome/components/speaker/speaker.h"

#include <deque>
#include <mutex>
#include <string>
#include <vector>

namespace esphome {
namespace ims_bridge {

// Bridges the BOX-3's mic/speaker straight to the IMS backend's Gemini Live
// proxy over a plain TCP socket, bypassing Home Assistant's Assist pipeline
// entirely for a low-latency, continuously-streamed conversation like the
// main IMS web app gets from Gemini Live - not a turn-based wake-word flow.
//
// Wire format matches the backend's HardwareTcpClient shim exactly:
//   [1 byte type: 0x00 text/JSON, 0x01 binary PCM][4 bytes big-endian
//   payload length][payload]
class ImsBridge : public Component {
 public:
  void set_microphone(microphone::Microphone *mic) { this->mic_ = mic; }
  void set_speaker(speaker::Speaker *spk) { this->speaker_ = spk; }
  void set_host(const std::string &host) { this->host_ = host; }
  void set_port(uint16_t port) { this->port_ = port; }

  void setup() override;
  void loop() override;
  float get_setup_priority() const override { return setup_priority::AFTER_WIFI; }

 protected:
  void try_connect_();
  void on_connected_();
  void disconnect_(const char *reason);
  void send_frame_(uint8_t type, const uint8_t *data, size_t len);
  void send_setup_message_();
  void drain_socket_();
  void drain_mic_queue_();
  void handle_frame_(uint8_t type, const std::vector<uint8_t> &payload);

  microphone::Microphone *mic_{nullptr};
  speaker::Speaker *speaker_{nullptr};
  std::string host_;
  uint16_t port_{3002};

  int sock_{-1};
  bool connected_{false};
  uint32_t last_connect_attempt_{0};

  // Mic capture happens on a different task than loop() (confirmed by
  // ESPHome's own voice_assistant component, which documents the same
  // hazard) - this queue is the only thing the mic callback touches
  // directly, guarded by a mutex. All socket I/O and speaker playback stays
  // on the main component loop() task.
  std::mutex mic_queue_mutex_;
  std::deque<std::vector<uint8_t>> mic_queue_;

  // Incoming frame parser state (drained a little at a time in loop() since
  // a single TCP read can span multiple frames or end mid-frame).
  std::vector<uint8_t> rx_buffer_;
};

}  // namespace ims_bridge
}  // namespace esphome

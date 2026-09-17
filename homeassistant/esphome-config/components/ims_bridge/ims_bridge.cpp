#include "ims_bridge.h"
#include "esphome/core/log.h"

#include <cerrno>
#include <cstring>
#include <fcntl.h>
#include <netdb.h>
#include <sys/socket.h>
#include <unistd.h>

namespace esphome {
namespace ims_bridge {

static const char *const TAG = "ims_bridge";

// Same setup handshake shape as hardwareClientService.js / the earlier
// PlatformIO firmware, kept as a fixed literal since nothing here needs to
// be dynamic (voice/model are not user-configurable from this component).
static const char *const SETUP_JSON =
    "{\"setup\":{\"model\":\"models/gemini-2.5-flash-native-audio-latest\","
    "\"generationConfig\":{\"responseModalities\":[\"AUDIO\"],\"temperature\":1,"
    "\"speechConfig\":{\"voiceConfig\":{\"prebuiltVoiceConfig\":{\"voiceName\":\"Puck\"}}}},"
    "\"systemInstruction\":{\"parts\":[{\"text\":\"You are Ims, an intelligent voice "
    "assistant on an ESP32-S3-BOX-3 device. Respond concisely in natural British "
    "English. Keep all answers short and suitable for voice. Never terminate or "
    "close the session.\"}]},"
    "\"tools\":[{\"functionDeclarations\":[{\"name\":\"searchLibrary\","
    "\"description\":\"Searches the local PDF knowledge base for relevant facts and "
    "information.\",\"parameters\":{\"type\":\"OBJECT\",\"properties\":{\"query\":"
    "{\"type\":\"STRING\",\"description\":\"The search term or question to find in the "
    "documents.\"}},\"required\":[\"query\"]}}]}]}}";

void ImsBridge::setup() {
  ESP_LOGI(TAG, "Starting IMS bridge -> %s:%u", this->host_.c_str(), this->port_);

  // Mic callback fires from the microphone component's own task, not loop() -
  // only ever touch the mutex-guarded queue here, nothing else.
  this->mic_->add_data_callback([this](const std::vector<uint8_t> &data) {
    std::lock_guard<std::mutex> lock(this->mic_queue_mutex_);
    // Cap the queue so a slow/dropped connection can't grow memory
    // unbounded - drop the oldest chunk rather than stall audio capture.
    if (this->mic_queue_.size() > 20) {
      this->mic_queue_.pop_front();
    }
    this->mic_queue_.emplace_back(data);
  });
  // Mic and speaker share ONE i2s_audio bus with full_duplex: true (YAML) -
  // the RX/TX channels are allocated together by the driver, so both can
  // just start immediately here, true full duplex.
  this->mic_->start();
  // Tell the resampler (gemini_speaker in YAML) what format Gemini Live
  // actually sends - 24kHz/16-bit/mono - so it converts down to the 16kHz
  // the base i2s_audio speaker runs at, rather than us writing mismatched-
  // rate audio directly to that speaker.
  this->speaker_->set_audio_stream_info(audio::AudioStreamInfo(16, 1, 24000));
  this->speaker_->start();
}

void ImsBridge::loop() {
  if (!this->connected_) {
    this->try_connect_();
    return;
  }
  this->drain_mic_queue_();
  this->drain_socket_();
}

void ImsBridge::try_connect_() {
  uint32_t now = millis();
  if (now - this->last_connect_attempt_ < 5000) {
    return;
  }
  this->last_connect_attempt_ = now;

  ESP_LOGI(TAG, "Connecting to %s:%u...", this->host_.c_str(), this->port_);

  struct addrinfo hints = {};
  hints.ai_family = AF_INET;
  hints.ai_socktype = SOCK_STREAM;
  struct addrinfo *res = nullptr;
  char port_str[6];
  snprintf(port_str, sizeof(port_str), "%u", this->port_);
  if (getaddrinfo(this->host_.c_str(), port_str, &hints, &res) != 0 || res == nullptr) {
    ESP_LOGW(TAG, "DNS lookup failed for %s", this->host_.c_str());
    return;
  }

  int sock = socket(res->ai_family, res->ai_socktype, res->ai_protocol);
  if (sock < 0) {
    ESP_LOGW(TAG, "socket() failed: %d", errno);
    freeaddrinfo(res);
    return;
  }

  // Bounded-timeout connect: non-blocking connect + select(), rather than a
  // plain blocking connect that could stall loop() for the OS default (often
  // 30-75s) if the backend is unreachable.
  fcntl(sock, F_SETFL, O_NONBLOCK);
  int rc = connect(sock, res->ai_addr, res->ai_addrlen);
  freeaddrinfo(res);

  if (rc < 0 && errno != EINPROGRESS) {
    ESP_LOGW(TAG, "connect() failed immediately: %d", errno);
    close(sock);
    return;
  }

  if (rc != 0) {
    fd_set write_fds;
    FD_ZERO(&write_fds);
    FD_SET(sock, &write_fds);
    struct timeval tv{.tv_sec = 3, .tv_usec = 0};
    rc = select(sock + 1, nullptr, &write_fds, nullptr, &tv);
    if (rc <= 0) {
      ESP_LOGW(TAG, "connect() timed out");
      close(sock);
      return;
    }
    int so_error = 0;
    socklen_t len = sizeof(so_error);
    getsockopt(sock, SOL_SOCKET, SO_ERROR, &so_error, &len);
    if (so_error != 0) {
      ESP_LOGW(TAG, "connect() failed: %d", so_error);
      close(sock);
      return;
    }
  }

  // O_NONBLOCK was only needed to bound the connect() timeout above. Clear it
  // now: send_frame_() retries on EAGAIN with no backoff, which would busy-
  // spin forever on a non-blocking socket the moment the TCP send buffer
  // filled even briefly, hogging the only task this component (and the rest
  // of ESPHome's loop-driven components) runs on. recv() stays non-blocking
  // per-call via MSG_DONTWAIT regardless of this socket-level flag.
  fcntl(sock, F_SETFL, 0);

  this->sock_ = sock;
  this->connected_ = true;
  this->on_connected_();
}

void ImsBridge::on_connected_() {
  ESP_LOGI(TAG, "Connected to IMS backend");
  this->rx_buffer_.clear();
  {
    std::lock_guard<std::mutex> lock(this->mic_queue_mutex_);
    this->mic_queue_.clear();
  }
  this->send_setup_message_();
}

void ImsBridge::disconnect_(const char *reason) {
  if (!this->connected_)
    return;
  ESP_LOGW(TAG, "Disconnected: %s", reason);
  close(this->sock_);
  this->sock_ = -1;
  this->connected_ = false;
}

void ImsBridge::send_setup_message_() {
  this->send_frame_(0x00, reinterpret_cast<const uint8_t *>(SETUP_JSON), strlen(SETUP_JSON));
}

void ImsBridge::send_frame_(uint8_t type, const uint8_t *data, size_t len) {
  if (!this->connected_)
    return;
  uint8_t header[5];
  header[0] = type;
  header[1] = (len >> 24) & 0xFF;
  header[2] = (len >> 16) & 0xFF;
  header[3] = (len >> 8) & 0xFF;
  header[4] = len & 0xFF;

  if (send(this->sock_, header, sizeof(header), 0) < 0) {
    this->disconnect_("write failed (header)");
    return;
  }
  size_t sent = 0;
  while (sent < len) {
    ssize_t n = send(this->sock_, data + sent, len - sent, 0);
    if (n < 0) {
      if (errno == EAGAIN || errno == EWOULDBLOCK)
        continue;
      this->disconnect_("write failed (payload)");
      return;
    }
    sent += n;
  }
}

void ImsBridge::drain_mic_queue_() {
  std::deque<std::vector<uint8_t>> pending;
  {
    std::lock_guard<std::mutex> lock(this->mic_queue_mutex_);
    std::swap(pending, this->mic_queue_);
  }
  static uint32_t last_mic_log = 0;
  static size_t bytes_since_log = 0;
  for (auto &chunk : pending) {
    bytes_since_log += chunk.size();
    this->send_frame_(0x01, chunk.data(), chunk.size());
    if (!this->connected_)
      return;
  }
  uint32_t now = millis();
  if (now - last_mic_log > 2000) {
    ESP_LOGD(TAG, "Mic: sent %u bytes in last ~2s (queue drains: %u)", (unsigned) bytes_since_log,
             (unsigned) pending.size());
    last_mic_log = now;
    bytes_since_log = 0;
  }
}

void ImsBridge::drain_socket_() {
  uint8_t buf[2048];
  while (true) {
    ssize_t n = recv(this->sock_, buf, sizeof(buf), MSG_DONTWAIT);
    if (n > 0) {
      this->rx_buffer_.insert(this->rx_buffer_.end(), buf, buf + n);
      continue;
    }
    if (n == 0) {
      this->disconnect_("backend closed connection");
      return;
    }
    // n < 0
    if (errno == EAGAIN || errno == EWOULDBLOCK)
      break;  // no more data available right now
    this->disconnect_("read failed");
    return;
  }

  // Parse every complete frame currently buffered.
  while (this->rx_buffer_.size() >= 5) {
    uint8_t type = this->rx_buffer_[0];
    uint32_t len = (static_cast<uint32_t>(this->rx_buffer_[1]) << 24) |
                   (static_cast<uint32_t>(this->rx_buffer_[2]) << 16) |
                   (static_cast<uint32_t>(this->rx_buffer_[3]) << 8) |
                   static_cast<uint32_t>(this->rx_buffer_[4]);
    if (this->rx_buffer_.size() < 5 + len)
      break;
    std::vector<uint8_t> payload(this->rx_buffer_.begin() + 5, this->rx_buffer_.begin() + 5 + len);
    this->rx_buffer_.erase(this->rx_buffer_.begin(), this->rx_buffer_.begin() + 5 + len);
    this->handle_frame_(type, payload);
  }
}

void ImsBridge::handle_frame_(uint8_t type, const std::vector<uint8_t> &payload) {
  if (type == 0x01) {
    // 24kHz PCM audio from Gemini, straight to the speaker (mic and speaker
    // run continuously on separate master/secondary I2S buses - see YAML).
    size_t written = this->speaker_->play(payload.data(), payload.size());
    ESP_LOGD(TAG, "Speaker: got %u bytes from Gemini, speaker accepted %u (running=%d, "
                  "stopped=%d, buffered=%d)",
             (unsigned) payload.size(), (unsigned) written, this->speaker_->is_running(),
             this->speaker_->is_stopped(), this->speaker_->has_buffered_data());
  } else {
    // Text/JSON control message - just log it for now (setupComplete ack,
    // transcript text, etc.). Nothing here needs to be acted on for basic
    // playback to work.
    ESP_LOGD(TAG, "Control message: %.*s", (int) payload.size(), payload.data());
  }
}

}  // namespace ims_bridge
}  // namespace esphome

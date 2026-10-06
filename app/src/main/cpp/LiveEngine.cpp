// See LiveEngine.h: the Oboe stream around LiveCore, reopened after a disconnect.
#include "LiveEngine.h"

#include <oboe/OboeExtensions.h>
#include <time.h>

#include <chrono>

namespace arc {

bool LiveEngine::open() {
    std::lock_guard<std::mutex> l(lock_);
    if (stream_) return true;
    closing_ = false;
    if (!openLocked()) return false;
    state_.store(State::Running, std::memory_order_release);
    return true;
}

bool LiveEngine::openLocked() {
    oboe::AudioStreamBuilder builder;
    builder.setDirection(oboe::Direction::Output)
        ->setPerformanceMode(oboe::PerformanceMode::LowLatency)
        ->setSharingMode(oboe::SharingMode::Exclusive)
        ->setUsage(oboe::Usage::Game)
        ->setContentType(oboe::ContentType::Music)
        ->setChannelCount(oboe::ChannelCount::Stereo)
        ->setFormat(oboe::AudioFormat::Float)
        ->setFormatConversionAllowed(true)
        ->setDataCallback(shared_from_this())
        ->setErrorCallback(shared_from_this());
    std::shared_ptr<oboe::AudioStream> s;
    if (builder.openStream(s) != oboe::Result::OK || !s) return false;
    const oboe::AudioFormat format = s->getFormat();
    if (s->getChannelCount() != 2 || (format != oboe::AudioFormat::Float && format != oboe::AudioFormat::I16) ||
        s->getSampleRate() <= 0) {
        s->close();
        return false;
    }
    rate_ = s->getSampleRate();
    burst_ = s->getFramesPerBurst() > 0 ? s->getFramesPerBurst() : 192;
    capacity_ = s->getBufferCapacityInFrames();
    floatOut_ = format == oboe::AudioFormat::Float;
    // Two bursts on the low-latency path; a stream that didn't get it keeps its own buffer.
    const bool fast = s->getPerformanceMode() == oboe::PerformanceMode::LowLatency;
    if (fast) s->setBufferSizeInFrames(2 * burst_);
    bufferSize_ = s->getBufferSizeInFrames();
    tuner_ = BufferTuner(burst_, fast ? 2 * burst_ : bufferSize_);
    xruns_ = 0;
    played_ = 0;
    if (core_) {
        core_->restart(rate_);
    } else {
        core_ = std::make_unique<LiveCore>(rate_);
    }
    frameBase_.store(core_->frame(), std::memory_order_release);
    if (s->requestStart() != oboe::Result::OK) {
        s->close();
        return false;
    }
    stream_ = s;
    generation_.fetch_add(1, std::memory_order_acq_rel);
    return true;
}

void LiveEngine::shutdown() {
    std::shared_ptr<oboe::AudioStream> s;
    {
        std::lock_guard<std::mutex> l(lock_);
        closing_ = true;
        s = std::move(stream_);
        stream_.reset();
        state_.store(State::Closed, std::memory_order_release);
    }
    wake_.notify_all();
    if (s) {
        s->stop();
        s->close();
    }
}

void LiveEngine::onErrorAfterClose(oboe::AudioStream *stream, oboe::Result /* error */) {
    std::unique_lock<std::mutex> l(lock_);
    if (closing_ || stream_.get() != stream) return;
    stream_.reset();
    state_.store(State::Restarting, std::memory_order_release);
    // The new route may take a moment to appear (a USB device settling).
    static constexpr int DELAYS_MS[] = {0, 50, 200, 500, 1000, 2000};
    for (int delay : DELAYS_MS) {
        if (delay > 0 && wake_.wait_for(l, std::chrono::milliseconds(delay), [this] { return closing_; })) return;
        if (closing_) return;
        if (openLocked()) {
            state_.store(State::Running, std::memory_order_release);
            return;
        }
    }
    state_.store(State::Dead, std::memory_order_release);
}

bool LiveEngine::info(int32_t *out) {
    std::lock_guard<std::mutex> l(lock_);
    if (!stream_) return false;
    out[RATE] = stream_->getSampleRate();
    out[BURST] = stream_->getFramesPerBurst();
    out[BUFFER] = stream_->getBufferSizeInFrames();
    out[CAPACITY] = stream_->getBufferCapacityInFrames();
    out[EXCLUSIVE] = stream_->getSharingMode() == oboe::SharingMode::Exclusive ? 1 : 0;
    out[MMAP] = oboe::OboeExtensions::isMMapUsed(stream_.get()) ? 1 : 0;
    out[LOW_LATENCY] = stream_->getPerformanceMode() == oboe::PerformanceMode::LowLatency ? 1 : 0;
    out[AAUDIO] = stream_->usesAAudio() ? 1 : 0;
    out[DEVICE] = stream_->getDeviceId();
    return true;
}

int LiveEngine::timestamp(int64_t *out) {
    // A reopen holds the lock a while: the caller then goes without, rather than wait.
    std::unique_lock<std::mutex> l(lock_, std::try_to_lock);
    if (!l.owns_lock() || !stream_) return 0;
    const int64_t base = frameBase_.load(std::memory_order_acquire);
    const oboe::ResultWithValue<oboe::FrameTimestamp> stamp = stream_->getTimestamp(CLOCK_MONOTONIC);
    if (stamp) {
        out[0] = base + stamp.value().position;
        out[1] = stamp.value().timestamp;
        return 1;
    }
    // No timestamp yet (the stream just started): the frames the device has taken, as of now.
    timespec now{};
    clock_gettime(CLOCK_MONOTONIC, &now);
    out[0] = base + stream_->getFramesRead();
    out[1] = static_cast<int64_t>(now.tv_sec) * 1'000'000'000LL + now.tv_nsec;
    return 2;
}

oboe::DataCallbackResult LiveEngine::onAudioReady(oboe::AudioStream *stream, void *audioData, int32_t numFrames) {
    callbacks_.fetch_add(1, std::memory_order_relaxed);
    LiveCore *core = core_.get();
    if (floatOut_) {
        auto *out = static_cast<float *>(audioData);
        for (int32_t done = 0; done < numFrames;) {
            const int32_t n = numFrames - done < LiveCore::CHUNK ? numFrames - done : LiveCore::CHUNK;
            core->render(scratch_, n);
            for (int32_t i = 0; i < 2 * n; i++) out[2 * done + i] = static_cast<float>(scratch_[i]) * (1.0f / 32768.0f);
            done += n;
        }
    } else {
        core->render(static_cast<int16_t *>(audioData), numFrames);
    }
    tune(stream, numFrames);
    return oboe::DataCallbackResult::Continue;
}

void LiveEngine::tune(oboe::AudioStream *stream, int32_t numFrames) {
    played_ += numFrames;
    const oboe::ResultWithValue<int32_t> xruns = stream->getXRunCount();
    if (!xruns) return;
    // Whole seconds and the rest apart: played_ * 1e9 alone would overflow after
    // about 53 hours at 48 kHz, and this lasts thousands of years.
    const int64_t now = played_ / rate_ * 1'000'000'000LL + played_ % rate_ * 1'000'000'000LL / rate_;
    const int32_t want = tuner_.resize(bufferSize_, capacity_, xruns.value(), now);
    bool changed = xruns.value() != xruns_;
    xruns_ = xruns.value();
    if (want != bufferSize_) {
        const oboe::ResultWithValue<int32_t> set = stream->setBufferSizeInFrames(want);
        if (set && set.value() > 0 && set.value() != bufferSize_) {
            bufferSize_ = set.value();
            changed = true;
        }
    }
    if (changed) core_->reportOutput(xruns_, bufferSize_);
}

}  // namespace arc

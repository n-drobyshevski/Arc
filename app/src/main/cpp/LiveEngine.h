// Live's native output (an addition): one Oboe stream (AAudio) that LiveCore
// fills from the data callback. Low-latency performance mode, exclusive
// sharing (AAudio gives shared when exclusive isn't to be had), game usage,
// music content, stereo float at the device's own rate: no rate is asked
// for, so nothing resamples the stream and the mixer converts the EP-133's
// sounds as it reads them.
//
// The buffer starts at two bursts, grows a burst after each xrun and steps
// back down a burst after ten seconds without one, never under two bursts
// (BufferTuner, as OutputPacer does for the AudioTrack output); the callback
// does this itself, timing it by the frames it has played.
//
// A disconnect (headphones in or out, a USB device gone) closes the stream;
// Oboe then calls onErrorAfterClose on a thread of its own, which opens a new
// stream on the new route, retrying a few times, so Live keeps sounding. Past
// that the engine is [State::Dead] and the app falls back to AudioTrack.
//
// The data callback only renders and tunes the buffer: no lock, allocation,
// log or JNI. Opening, closing and the queries below take the engine's
// lock, on app threads or Oboe's error thread. The engine is held by
// shared_ptr, and each stream holds it too (its callbacks), so Oboe's error
// thread can't outlive it.
#pragma once

#include <oboe/Oboe.h>

#include <atomic>
#include <condition_variable>
#include <cstdint>
#include <memory>
#include <mutex>

#include "BufferTuner.h"
#include "LiveCore.h"

namespace arc {

class LiveEngine : public oboe::AudioStreamDataCallback,
                   public oboe::AudioStreamErrorCallback,
                   public std::enable_shared_from_this<LiveEngine> {
public:
    enum class State : int32_t { Closed = 0, Running = 1, Restarting = 2, Dead = 3 };

    /** [info]'s fields, in order. */
    enum Info : int {
        RATE, BURST, BUFFER, CAPACITY, EXCLUSIVE, MMAP, LOW_LATENCY, AAUDIO, DEVICE, INFO_SIZE
    };

    LiveEngine() = default;
    ~LiveEngine() override = default;

    /** Opens and starts the stream; false when there is none to be had. */
    bool open();
    /** Stops and closes the stream for good. */
    void shutdown();

    /** The core, once [open] succeeded (null before). */
    LiveCore *core() { return core_.get(); }

    /** How the stream is set up now ([Info]); false while there is none. */
    bool info(int32_t *out);
    /**
     * When mix frame out[0] is (or will be) heard: out[1], System.nanoTime's
     * clock. 1 from the stream's timestamp, 2 estimated from the frames the
     * device has read and the time now, 0 for no stream.
     */
    int timestamp(int64_t *out);

    State state() const { return state_.load(std::memory_order_acquire); }
    /** Data callbacks so far: the app's watchdog sees the stream move. */
    int64_t callbacks() const { return callbacks_.load(std::memory_order_relaxed); }
    /** Goes up each time a stream opens (the route, rate or mode may have changed). */
    int32_t generation() const { return generation_.load(std::memory_order_acquire); }

    oboe::DataCallbackResult onAudioReady(oboe::AudioStream *stream, void *audioData, int32_t numFrames) override;
    void onErrorAfterClose(oboe::AudioStream *stream, oboe::Result error) override;

private:
    /** Opens and starts a stream, with the lock held. */
    bool openLocked();
    /** The callback's buffer tuning, after each callback. */
    void tune(oboe::AudioStream *stream, int32_t numFrames);

    std::mutex lock_;
    std::condition_variable wake_;
    bool closing_ = false;
    std::shared_ptr<oboe::AudioStream> stream_;
    std::unique_ptr<LiveCore> core_;
    // The core's frame when the current stream began: stream frame f is mix frame base + f.
    std::atomic<int64_t> frameBase_{0};

    std::atomic<State> state_{State::Closed};
    std::atomic<int64_t> callbacks_{0};
    std::atomic<int32_t> generation_{0};

    // The callback's own, set before each stream starts.
    BufferTuner tuner_{1, 1};
    bool floatOut_ = true;
    int32_t rate_ = 48000;
    int32_t burst_ = 0;
    int32_t capacity_ = 0;
    int32_t bufferSize_ = 0;
    int32_t xruns_ = 0;
    int64_t played_ = 0;
    int16_t scratch_[2 * LiveCore::CHUNK] = {};
};

}  // namespace arc

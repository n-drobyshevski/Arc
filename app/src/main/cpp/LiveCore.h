// What the native Live engine does on the audio thread, without the stream
// (an addition): the commands from the app, the sounds in native memory, the
// mixer, and the reports going back. LiveEngine feeds it from the Oboe
// callback; the host test drives it directly.
//
// Three kinds of thread, each with its own side:
// - the producer (one app thread at a time; the Kotlin side serializes them)
//   queues commands: load, unload, start, release, cut, stop all;
// - the audio thread ([render]) applies them, mixes, and reports: voices
//   started (key, frame, the press's tag), the keys sounding when they change,
//   the output's xruns and buffer size, and, while REC is on, the mix itself
//   (each block with its first frame and the first voice start in it);
// - the consumer (the app's poll thread) reads the reports ([poll],
//   [readMix]) and frees the sounds the audio thread no longer reads.
//
// Every hand-over is a lock-free single-producer, single-consumer ring, and
// the audio thread neither allocates, locks, logs nor frees. A sound is
// copied into native memory once and then referred to by its slot. Unloading
// it never frees memory a voice is reading: the audio thread lets go of it
// only once no voice reads it, through a ring back to the consumer, which
// deletes it.
#pragma once

#include <atomic>
#include <cstdint>

#include "SpscRing.h"
#include "VoiceMixer.h"

namespace arc {

class LiveCore {
public:
    /** Sound slots (the app picks the slot; it may reuse one as soon as it has unloaded it). */
    static constexpr int MAX_SAMPLES = 1024;
    /** Frames mixed at a time, and the largest mix block [readMix] hands back. */
    static constexpr int CHUNK = 1024;

    /** [poll]'s encoding: each report a type, then its numbers. */
    enum Report : int64_t {
        /** Then key, frame, tag. */
        STARTED = 1,
        /** Then n, then n keys. */
        KEYS = 2,
        /** Then xruns so far, the buffer size in frames. */
        OUTPUT = 3,
    };

    explicit LiveCore(int outRate);
    ~LiveCore();
    LiveCore(const LiveCore &) = delete;
    LiveCore &operator=(const LiveCore &) = delete;

    // ---------- producer ----------

    /** Puts [sample] in [slot] (taking it over); false when the queue is full or the slot is out of range (it stays the caller's). */
    bool load(int32_t slot, Sample *sample);
    /** Empties [slot]; voices playing its sound play on. */
    bool unload(int32_t slot);
    /**
     * Starts voice [key] on [slot]'s sound, read at [sampleRate], [pitch] times
     * faster, shaped by [shape] (VoiceMixer's); [tag] comes back with STARTED.
     */
    bool start(int32_t key, int32_t slot, int32_t sampleRate, double pitch, int64_t tag,
               const VoiceShape &shape = VoiceShape());
    bool release(int32_t key);
    bool cut(int32_t key);
    bool stopAll();

    /** REC: whether the mix goes back to the consumer (any thread). */
    void setRecording(bool on) { recording_.store(on, std::memory_order_relaxed); }

    // ---------- audio thread ----------

    /** Applies the waiting commands and mixes the next [frames] stereo frames into [out]. */
    void render(int16_t *out, int frames);
    /** Reports the output's xruns so far and its buffer size. */
    void reportOutput(int32_t xruns, int32_t bufferSize);
    /** Output frames mixed so far (or between streams). */
    int64_t frame() const { return mixer_.frame(); }
    int outRate() const { return mixer_.outRate(); }

    // ---------- between streams (no render running) ----------

    /**
     * The stream reopened at [outRate]: the next render applies the loads and
     * unloads queued meanwhile and drops the rest (presses made while nothing
     * played aren't heard late); what was sounding fades out, or, at a new
     * rate, is dropped at once.
     */
    void restart(int outRate);

    // ---------- consumer ----------

    /**
     * Frees the sounds no longer read, then writes waiting reports into [out]
     * (see [Report]) while whole ones fit in [capacity]; returns the longs written.
     */
    int poll(int64_t *out, int capacity);
    /**
     * The next block of REC mix: up to CHUNK stereo frames into [out], which
     * holds [capacityFrames]; [header] gets its first frame, the first voice
     * start in it (-1 for none) and the rate. Returns the frames, 0 when none
     * wait, -1 when [out] is too small (the block stays).
     */
    int readMix(int16_t *out, int capacityFrames, int64_t *header);
    /** Sounds [poll] has freed so far. */
    int64_t freed() const { return freedCount_; }

private:
    enum class Kind : uint8_t { Load, Unload, Start, Release, Cut, StopAll };

    struct Command {
        Kind kind;
        int32_t key;
        int32_t slot;
        int32_t rate;
        double pitch;
        int64_t tag;
        Sample *sample;
        VoiceShape shape;
    };

    struct Event {
        int64_t type;
        int32_t count;
        int64_t a, b, c;
        int32_t keys[VoiceMixer::MAX_KEYS];
    };

    struct MixBlock {
        int64_t frame;
        int64_t firstStart;
        int32_t frames;
        int32_t rate;
    };

    static constexpr int MAX_RETIRED = 512;

    void apply(const Command &c, bool flush);
    void retire(Sample *s);
    void sweep();

    VoiceMixer mixer_;
    Sample *slots_[MAX_SAMPLES] = {};
    // Unloaded sounds a voice may still read (the audio thread only).
    Sample *retired_[MAX_RETIRED] = {};
    int retiredCount_ = 0;
    uint32_t keysSent_ = 0;
    std::atomic<bool> recording_{false};
    std::atomic<bool> flushing_{false};

    SpscRing<Command, 1024> commands_;
    SpscRing<Event, 256> events_;
    SpscRing<Sample *, 2048> freed_;
    int64_t freedCount_ = 0;  // the consumer's
    SpscRing<MixBlock, 4096> mixBlocks_;
    // About five seconds of stereo at 48 kHz: the poll thread reads every few milliseconds.
    SpscSampleRing<1u << 19> mixData_;
};

}  // namespace arc

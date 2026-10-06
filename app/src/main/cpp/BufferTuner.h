// Port of OutputPacer.resize (app/src/main/kotlin/dev/arc/ep133/audio/OutputPacer.kt)
// for the native Live engine (an addition): the buffer grows a burst when the
// output runs dry, and after DECAY_NS without that steps back down a burst,
// never under the floor. Same rules; the deltas: time is whatever clock the
// caller passes (the engine counts it in frames played, so the audio callback
// reads no clock), and it keeps no buffer size of its own.
#pragma once

#include <cstdint>

namespace arc {

class BufferTuner {
public:
    /** A buffer grown after the output ran dry shrinks again after this long without it running dry. */
    static constexpr int64_t DECAY_NS = 10'000'000'000LL;

    BufferTuner(int32_t burst, int32_t floor) : burst_(burst), floor_(floor) {}

    /**
     * The buffer size to use, the output having run dry [underruns] times so
     * far: a burst more after a new one (within [capacity]), a burst less after
     * DECAY_NS without one (down to the floor), else [size] as it is.
     */
    int32_t resize(int32_t size, int32_t capacity, int32_t underruns, int64_t now) {
        if (changedAt_ == NONE) changedAt_ = now;
        if (underruns > underruns_) {
            underruns_ = underruns;
            changedAt_ = now;
            return size + burst_ <= capacity ? size + burst_ : size;
        }
        if (size - burst_ >= floor_ && now - changedAt_ > DECAY_NS) {
            changedAt_ = now;
            return size - burst_;
        }
        return size;
    }

private:
    // No time yet.
    static constexpr int64_t NONE = INT64_MIN;

    int32_t burst_;
    int32_t floor_;
    int32_t underruns_ = 0;
    int64_t changedAt_ = NONE;
};

}  // namespace arc

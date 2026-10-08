// Port of the FX bus's commands and its Effect interface, from
// core/src/main/kotlin/dev/arc/ep133/formats/fx/FxBus.kt (an addition).
//
// Deltas from the Kotlin ones:
// - Its own header (Kotlin keeps both in FxBus.kt), so each effect's header
//   can include it without including the bus.
// - FxControl is a struct of constexpr ints; Effect is an abstract class, its
//   [silent] a function, and it has [setRate] (the native mixer can start over
//   at another rate: VoiceMixer::reset).
#pragma once

#include <cstdint>

namespace arc::fx {

/**
 * What VoiceMixer::control takes: the command (FX_TYPE to PUNCH) with its
 * index and two values; the effect types (NONE to COMPRESSOR) and the
 * punch-in slots (PITCH_RANDOM to DECIMATOR, the pad each is on in the comment).
 */
struct FxControl {
    /** index: the type (NONE to COMPRESSOR); x, y: its knobs, 0..1. */
    static constexpr int32_t FX_TYPE = 1;
    /** x, y: the effect's knobs, 0..1. */
    static constexpr int32_t FX_XY = 2;
    /** index: the group, 0..3; x: its send to the effect, 0..1. */
    static constexpr int32_t SEND = 3;
    /** index: 1 on, 0 off; x: the master compressor's drive, y: its speed, 0..1. */
    static constexpr int32_t COMP = 4;
    /** index: the groups ducked (bit g for group g; 0 is off); x: the duck's length, y: its shape, 0..1. */
    static constexpr int32_t SIDECHAIN = 5;
    /** x: the tempo, in BPM (held to 20..300). */
    static constexpr int32_t TEMPO = 6;
    /** index: the slot (PITCH_RANDOM to DECIMATOR); x: its depth, 0..1 (0 or less lets go of it). */
    static constexpr int32_t PUNCH = 7;

    static constexpr int32_t NONE = 0;
    static constexpr int32_t DELAY = 1;
    static constexpr int32_t REVERB = 2;
    static constexpr int32_t DISTORTION = 3;
    static constexpr int32_t CHORUS = 4;
    static constexpr int32_t FILTER = 5;
    static constexpr int32_t COMPRESSOR = 6;
    /** The types, NONE included. */
    static constexpr int32_t TYPES = 7;

    static constexpr int32_t PITCH_RANDOM = 0;  // '.'
    static constexpr int32_t SLICE = 1;         // '0'
    static constexpr int32_t STUTTER = 2;       // ENTER
    static constexpr int32_t BEAT_REPEAT = 3;   // '1'
    static constexpr int32_t TAPE_STOP = 4;     // '2'
    static constexpr int32_t FILTER_LFO = 5;    // '3'
    static constexpr int32_t LPF = 6;           // '4'
    static constexpr int32_t HPF = 7;           // '5'
    static constexpr int32_t SEND_FX = 8;       // '6'
    static constexpr int32_t TREMOLO = 9;       // '7'
    static constexpr int32_t OCTAVE_DOWN = 10;  // '8'
    static constexpr int32_t DECIMATOR = 11;    // '9'
    static constexpr int32_t SLOTS = 12;

    /** The groups with a send (A to D); a voice on bus -1 has none. */
    static constexpr int32_t GROUPS = 4;
};

/**
 * An effect on the send bus. Levels are the mixer's (16-bit scale floats, as
 * its mix is); buffers are stereo, interleaved.
 */
class Effect {
public:
    virtual ~Effect() = default;

    /** Starts over at [rate]: back to silence, its coefficients worked out again. */
    virtual void setRate(int32_t rate) = 0;
    /** True when its tail has died away (below 1e-6) and its input was silent for a whole block: the bus may skip it. */
    virtual bool silent() const = 0;
    /** Back to silence, its tail dropped. */
    virtual void reset() = 0;
    /** Its knobs [x] and [y] (0..1, smoothed) and the tempo, at most once a block, before [process]. */
    virtual void setParams(float x, float y, float bpm) = 0;
    /** Adds its return for [frames] frames of [in] into [out]. */
    virtual void process(const float *in, float *out, int frames) = 0;
};

}  // namespace arc::fx

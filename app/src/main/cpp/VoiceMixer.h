// Port of core/src/main/kotlin/dev/arc/ep133/formats/VoiceMixer.kt, for the
// native Live engine (an addition). Same gate, minimum gate, fade, choke,
// cut, stopAll, voice limit and steal order, the same voice shapes (gain, pan,
// trim, attack, release, play mode, mute group), the same resampling in the
// same float and double arithmetic in the same order, so it renders the same
// samples as the Kotlin mixer, bit for bit: the host test
// (app/src/test/cpp/VoiceMixerParityTest.cpp) checks that against vectors the
// Kotlin mixer wrote (app/src/test/cpp/voice-mixer.golden).
//
// Deltas from the Kotlin mixer:
// - Keys are small ints (the app maps its string keys to them), so the audio
//   thread never touches a string; a voice reads a Sample by pointer.
// - Fixed storage, nothing allocated after construction: at most VOICE_SLOTS
//   voices alive (held, let go of or fading), MAX_COMMANDS queued between two
//   renders ([room] says how many more fit; a full queue refuses), MAX_STARTED
//   reports per render, at most maxFrames per render. Past VOICE_SLOTS the
//   oldest voice already cut short is dropped (it was fading out anyway).
// - [start] takes the sound's rate and the pitch ratio (Kotlin's pitchRatio,
//   worked out on the Kotlin side, so both use the same pow) and works out the
//   step as the Kotlin start does. Its [VoiceShape] is Kotlin's less the
//   semitones, which the Kotlin side has already folded into that pitch; the
//   mode is VoiceMode's ordinal, and a voice is "on the same sound" for
//   legato when it reads the same Sample (Kotlin: the same array).
// - [keysVersion] counts changes of [keys] (Kotlin: a new set object).
// - [reset] starts over at another output rate (the stream reopened on a new
//   device), keeping the frame count.
// - Each voice counts itself on its Sample (Sample::voices), and so does each
//   timed start waiting for its frame (Sample::pending), so the engine knows
//   when a sound let go of is no longer read.
// - Timed commands wait in fixed storage too: at most MAX_PENDING, kept in
//   order by insertion; one that finds it full is applied at once, as if it
//   came late (Kotlin keeps any number).
//
// Commands take effect at the next [render]; one thread calls everything.
#pragma once

#include <cstdint>

namespace arc {

/** Kotlin's VoiceMode, by ordinal: how a voice answers its release and the same key again. */
enum class VoiceMode : int32_t { Gate = 0, OneShot = 1, Key = 2, Legato = 3 };

/**
 * How a voice plays its sound: Kotlin's VoiceShape less its semitones (folded
 * into the pitch). The defaults play a sound as the mixer always has.
 */
struct VoiceShape {
    /** Linear, 0..1. */
    float gain = 1.0f;
    /** -16 (left) to 16 (right); each side's gain is min(1, (16 -/+ pan) / 16). */
    int32_t pan = 0;
    /** The trim, in the sound's frames: from [start] to before [end] (clamped to the sound; nothing left, nothing plays). */
    int32_t start = 0;
    int32_t end = INT32_MAX;
    /** Fades in from silence over this long. */
    int32_t attackMs = 0;
    /** The fade after release; never shorter than FADE_MS (24). */
    int32_t releaseMs = 24;
    /** A VoiceMode. */
    int32_t mode = static_cast<int32_t>(VoiceMode::Gate);
    /** Above 0: starting this voice cuts every other sounding voice of the group. */
    int32_t muteGroup = 0;
};

/** A sound in native memory: 16-bit PCM, [channels] interleaved. Its owner frees it. */
struct Sample {
    int16_t *pcm = nullptr;
    int32_t frames = 0;
    int32_t channels = 1;
    /** Voices reading it (the mixer's thread only). */
    int32_t voices = 0;
    /** Timed starts waiting in a mixer to read it (the mixer's thread only). */
    int32_t pending = 0;
    /** Let go of by the app: freed once no voice reads it (the mixer's thread only). */
    bool unloaded = false;

    Sample(int16_t *pcm, int32_t frames, int32_t channels) : pcm(pcm), frames(frames), channels(channels) {}
    ~Sample() { delete[] pcm; }
    Sample(const Sample &) = delete;
    Sample &operator=(const Sample &) = delete;
};

class VoiceMixer {
public:
    static constexpr int MAX_VOICES = 8;
    static constexpr int MIN_GATE_MS = 60;
    static constexpr int FADE_MS = 24;
    /** A voice cut short (the same key again, too many, or [cut]) fades this fast. */
    static constexpr int CHOKE_MS = 3;
    /** VoiceShape::pan's reach either way. */
    static constexpr int PAN_MAX = 16;

    /** Voices alive at once, fading ones included. */
    static constexpr int VOICE_SLOTS = 64;
    /** The largest voice limit (and so the most keys at once). */
    static constexpr int MAX_KEYS = 32;
    static constexpr int MAX_STARTED = 64;
    static constexpr int MAX_COMMANDS = 256;
    /** Timed commands waiting for their frame. */
    static constexpr int MAX_PENDING = 256;
    /** A command's frame when it isn't timed: it takes effect at the next [render]'s start. */
    static constexpr int64_t NOW = INT64_MIN;

    /** A voice that began in the last [render]: its [tag] (the caller's), at output frame [frame]. */
    struct Started {
        int32_t key;
        int64_t tag;
        int64_t frame;
    };

    VoiceMixer(int outRate, int maxVoices, int maxFrames);
    ~VoiceMixer();
    VoiceMixer(const VoiceMixer &) = delete;
    VoiceMixer &operator=(const VoiceMixer &) = delete;

    int outRate() const { return outRate_; }

    /**
     * Plays [sample] (read at [sampleRate], [pitch] times faster: Kotlin's
     * VoiceMixer.pitchRatio) as voice [key], shaped by [shape], until
     * [release]. [tag] comes back in [started]. Timed, it starts at output
     * frame [at] (NOW: at the next render). False when the command queue is
     * full.
     */
    bool start(int32_t key, Sample *sample, int32_t sampleRate, double pitch, int64_t tag,
               const VoiceShape &shape = VoiceShape(), int64_t at = NOW);
    /**
     * Lets go of voice [key] (all of a Key-mode key's): it fades out now, or
     * once it has sounded MIN_GATE_MS. A OneShot voice plays on. Timed, it
     * lets go at output frame [at]; a [tag] other than 0 lets go of only the
     * voices started with that tag.
     */
    bool release(int32_t key, int64_t at = NOW, int64_t tag = 0);
    /** Ends voice [key] (all of its voices) now, in CHOKE_MS, even inside its MIN_GATE_MS: the press was a scroll. */
    bool cut(int32_t key);
    /** Fades every voice out quickly. */
    bool stopAll();
    /** Drops the timed starts and releases still waiting for their frame; those sent after it wait as usual. */
    bool flushTimed();
    /** Commands that still fit before the next [render]. */
    int room() const { return MAX_COMMANDS - commandCount_; }

    /**
     * Mixes the next [frames] (at most maxFrames) stereo frames into [out]
     * (left, right, …): the commands first, then the timed ones already due,
     * then the voices up to the next timed command's frame inside the render,
     * that command, and on.
     */
    void render(int16_t *out, int frames);

    /** Drops every voice and queued or timed command and starts over at [outRate]; the frame count goes on. */
    void reset(int outRate);

    /** Output frames rendered so far. */
    int64_t frame() const { return frame_; }

    /** Voices that began in the last [render]. */
    const Started *started() const { return started_; }
    int startedCount() const { return startedCount_; }

    /** The keys sounding (and not cut short) after the last [render], in voice order. */
    const int32_t *keys() const { return keys_; }
    int keyCount() const { return keyCount_; }
    /** Goes up each time [keys] changes. */
    uint32_t keysVersion() const { return keysVersion_; }

private:
    enum class Kind : uint8_t { Start, Release, Cut, StopAll, FlushTimed };

    // [at]: the output frame a timed command waits for, NOW for none. A
    // Release's [tag] other than 0: only the voices started with it.
    struct Command {
        Kind kind;
        int32_t key;
        Sample *sample;
        double step;
        int64_t tag;
        VoiceShape shape;
        int64_t at;
    };

    // Kotlin's Voice: [sample] read up to before frame [end], [level] and the
    // pan's [left] and [right] its gains, faded in over [attack] frames and out
    // over [release] after its gate.
    struct Voice {
        int32_t key;
        int64_t tag;
        Sample *sample;
        int32_t end;
        double step;
        int64_t startFrame;
        float level;
        float left;
        float right;
        int32_t attack;
        int32_t release;
        int32_t mode;
        int32_t group;
        double pos;
        /** The output frame the fade starts at; INT64_MAX while held. */
        int64_t fadeAt;
        int32_t fadeFrames;
        /** Cut short: no longer the voice of its key. */
        bool choked;
        /** Released (a OneShot voice too, though it plays on): stolen before voices still held. */
        bool letGo;
    };

    void setRate(int outRate);
    bool queue(const Command &c);
    void take(const Command &c);
    void applyDue();
    void flushPending();
    void playAll(int offset, int frames);
    void apply(const Command &c);
    void cutKey(int32_t key);
    void cutVoice(Voice &v);
    bool legato(const Command &c);
    int32_t framesOf(int32_t ms) const;
    bool keyBefore(int index) const;
    float gain(const Voice &v, int64_t at) const;
    float ramp(const Voice &v, int64_t at) const;
    bool play(Voice &v, int offset, int frames);
    bool keysChanged() const;
    void removeVoice(int index);

    int outRate_ = 0;
    const int maxVoices_;
    const int maxFrames_;
    int64_t minGate_ = 0;
    int32_t fade_ = 1;
    int32_t choke_ = 1;

    Command commands_[MAX_COMMANDS];
    int commandCount_ = 0;
    // Timed commands waiting for their frame: by frame, then as they came.
    Command pending_[MAX_PENDING];
    int pendingCount_ = 0;
    Voice voices_[VOICE_SLOTS];
    int voiceCount_ = 0;
    float *mix_;
    int64_t frame_ = 0;
    Started started_[MAX_STARTED];
    int startedCount_ = 0;
    int32_t keys_[MAX_KEYS];
    int keyCount_ = 0;
    uint32_t keysVersion_ = 0;
};

}  // namespace arc

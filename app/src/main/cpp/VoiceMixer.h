// Port of core/src/main/kotlin/dev/arc/ep133/formats/VoiceMixer.kt, for the
// native Live engine (an addition). Same gate, minimum gate, fade, choke,
// cut, stopAll, voice limit and steal order, the same resampling in the same
// float and double arithmetic in the same order, so it renders the same
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
//   step as the Kotlin start does.
// - [keysVersion] counts changes of [keys] (Kotlin: a new set object).
// - [reset] starts over at another output rate (the stream reopened on a new
//   device), keeping the frame count.
// - Each voice counts itself on its Sample (Sample::voices), so the engine
//   knows when a sound let go of is no longer read.
//
// Commands take effect at the next [render]; one thread calls everything.
#pragma once

#include <cstdint>

namespace arc {

/** A sound in native memory: 16-bit PCM, [channels] interleaved. Its owner frees it. */
struct Sample {
    int16_t *pcm = nullptr;
    int32_t frames = 0;
    int32_t channels = 1;
    /** Voices reading it (the mixer's thread only). */
    int32_t voices = 0;
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

    /** Voices alive at once, fading ones included. */
    static constexpr int VOICE_SLOTS = 64;
    /** The largest voice limit (and so the most keys at once). */
    static constexpr int MAX_KEYS = 32;
    static constexpr int MAX_STARTED = 64;
    static constexpr int MAX_COMMANDS = 256;

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
     * VoiceMixer.pitchRatio) as voice [key] until [release]. [tag] comes back
     * in [started]. False when the command queue is full.
     */
    bool start(int32_t key, Sample *sample, int32_t sampleRate, double pitch, int64_t tag);
    /** Lets go of voice [key]: it fades out now, or once it has sounded MIN_GATE_MS. */
    bool release(int32_t key);
    /** Ends voice [key] now, in CHOKE_MS, even inside its MIN_GATE_MS: the press was a scroll. */
    bool cut(int32_t key);
    /** Fades every voice out quickly. */
    bool stopAll();
    /** Commands that still fit before the next [render]. */
    int room() const { return MAX_COMMANDS - commandCount_; }

    /** Mixes the next [frames] (at most maxFrames) stereo frames into [out] (left, right, …). */
    void render(int16_t *out, int frames);

    /** Drops every voice and queued command and starts over at [outRate]; the frame count goes on. */
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
    enum class Kind : uint8_t { Start, Release, Cut, StopAll };

    struct Command {
        Kind kind;
        int32_t key;
        Sample *sample;
        double step;
        int64_t tag;
    };

    struct Voice {
        int32_t key;
        Sample *sample;
        int32_t frames;
        double step;
        int64_t startFrame;
        double pos;
        /** The output frame the fade starts at; INT64_MAX while held. */
        int64_t fadeAt;
        int32_t fadeFrames;
        /** Cut short: no longer the voice of its key. */
        bool choked;
    };

    void setRate(int outRate);
    bool queue(const Command &c);
    void apply(const Command &c);
    void cutKey(int32_t key);
    void cutVoice(Voice &v);
    float gain(const Voice &v, int64_t at) const;
    bool play(Voice &v, int frames);
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

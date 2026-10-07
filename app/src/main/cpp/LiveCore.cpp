// See LiveCore.h: the native Live engine's audio-thread work, without the stream.
#include "LiveCore.h"

namespace arc {

LiveCore::LiveCore(int outRate) : mixer_(outRate, VoiceMixer::MAX_VOICES, CHUNK) {
    keysSent_ = mixer_.keysVersion();
}

LiveCore::~LiveCore() {
    // Nothing renders now: every sound still held anywhere goes.
    for (Sample *&s : slots_) {
        delete s;
        s = nullptr;
    }
    for (int i = 0; i < retiredCount_; i++) delete retired_[i];
    Sample *s = nullptr;
    while (freed_.pop(s)) delete s;
    Command c{};
    while (commands_.pop(c)) {
        if (c.kind == Kind::Load) delete c.sample;
    }
}

// ---------- producer ----------

bool LiveCore::load(int32_t slot, Sample *sample) {
    if (slot < 0 || slot >= MAX_SAMPLES || sample == nullptr) return false;
    return commands_.push({Kind::Load, 0, slot, 0, 0.0, 0, sample, VoiceShape()});
}

bool LiveCore::unload(int32_t slot) {
    if (slot < 0 || slot >= MAX_SAMPLES) return false;
    return commands_.push({Kind::Unload, 0, slot, 0, 0.0, 0, nullptr, VoiceShape()});
}

bool LiveCore::start(int32_t key, int32_t slot, int32_t sampleRate, double pitch, int64_t tag, const VoiceShape &shape) {
    if (slot < 0 || slot >= MAX_SAMPLES) return false;
    return commands_.push({Kind::Start, key, slot, sampleRate, pitch, tag, nullptr, shape});
}

bool LiveCore::release(int32_t key) { return commands_.push({Kind::Release, key, 0, 0, 0.0, 0, nullptr, VoiceShape()}); }

bool LiveCore::cut(int32_t key) { return commands_.push({Kind::Cut, key, 0, 0, 0.0, 0, nullptr, VoiceShape()}); }

bool LiveCore::stopAll() { return commands_.push({Kind::StopAll, 0, 0, 0, 0.0, 0, nullptr, VoiceShape()}); }

// ---------- audio thread ----------

void LiveCore::render(int16_t *out, int frames) {
    // Commands are only taken with a render to apply them: a start queued in the
    // mixer must not outlive the sweep that may free its sound.
    if (frames <= 0) return;
    const bool flush = flushing_.exchange(false, std::memory_order_acq_rel);
    // Room kept for the stop a restart adds; what doesn't fit waits for the next render.
    Command c{};
    while (mixer_.room() > 1 && commands_.pop(c)) apply(c, flush);
    if (flush) mixer_.stopAll();

    const bool recording = recording_.load(std::memory_order_relaxed);
    for (int done = 0; done < frames;) {
        const int n = frames - done < CHUNK ? frames - done : CHUNK;
        int16_t *block = out + 2 * done;
        const int64_t at = mixer_.frame();
        mixer_.render(block, n);
        int64_t first = -1;
        for (int i = 0; i < mixer_.startedCount(); i++) {
            const VoiceMixer::Started &s = mixer_.started()[i];
            if (first < 0 || s.frame < first) first = s.frame;
            Event e{};
            e.type = STARTED;
            e.a = s.key;
            e.b = s.frame;
            e.c = s.tag;
            events_.push(e);
        }
        // A block goes back whole or not at all (the take then misses it), never torn.
        if (recording && !mixBlocks_.full() && mixData_.room() >= static_cast<uint32_t>(2 * n)) {
            mixData_.write(block, static_cast<uint32_t>(2 * n));
            mixBlocks_.push({at, first, n, mixer_.outRate()});
        }
        done += n;
    }
    // A full ring keeps the keys unsent; the next render tries again.
    if (mixer_.keysVersion() != keysSent_) {
        Event e{};
        e.type = KEYS;
        e.count = mixer_.keyCount();
        for (int i = 0; i < e.count; i++) e.keys[i] = mixer_.keys()[i];
        if (events_.push(e)) keysSent_ = mixer_.keysVersion();
    }
    sweep();
}

void LiveCore::apply(const Command &c, bool flush) {
    switch (c.kind) {
        case Kind::Load:
            if (slots_[c.slot] != nullptr) retire(slots_[c.slot]);
            slots_[c.slot] = c.sample;
            return;
        case Kind::Unload:
            if (slots_[c.slot] != nullptr) retire(slots_[c.slot]);
            slots_[c.slot] = nullptr;
            return;
        case Kind::Start:
            if (!flush && slots_[c.slot] != nullptr) mixer_.start(c.key, slots_[c.slot], c.rate, c.pitch, c.tag, c.shape);
            return;
        case Kind::Release:
            if (!flush) mixer_.release(c.key);
            return;
        case Kind::Cut:
            if (!flush) mixer_.cut(c.key);
            return;
        case Kind::StopAll:
            if (!flush) mixer_.stopAll();
            return;
    }
}

// A start queued in the mixer may still point at [s]: it is only let go of after a render.
void LiveCore::retire(Sample *s) {
    s->unloaded = true;
    // Past MAX_RETIRED (never in practice) the sound is kept for good rather than freed under a voice.
    if (retiredCount_ < MAX_RETIRED) retired_[retiredCount_++] = s;
}

// Hands the unloaded sounds no voice reads to the consumer, which frees them.
void LiveCore::sweep() {
    int kept = 0;
    for (int i = 0; i < retiredCount_; i++) {
        Sample *s = retired_[i];
        if (s->voices > 0 || !freed_.push(s)) retired_[kept++] = s;
    }
    retiredCount_ = kept;
}

void LiveCore::reportOutput(int32_t xruns, int32_t bufferSize) {
    Event e{};
    e.type = OUTPUT;
    e.a = xruns;
    e.b = bufferSize;
    events_.push(e);
}

// ---------- between streams ----------

void LiveCore::restart(int outRate) {
    if (outRate != mixer_.outRate()) mixer_.reset(outRate);
    flushing_.store(true, std::memory_order_release);
}

// ---------- consumer ----------

int LiveCore::poll(int64_t *out, int capacity) {
    Sample *s = nullptr;
    while (freed_.pop(s)) {
        delete s;
        freedCount_++;
    }
    int n = 0;
    while (const Event *e = events_.peek()) {
        const int size = e->type == KEYS ? 2 + e->count : (e->type == STARTED ? 4 : 3);
        if (n + size > capacity) break;
        out[n++] = e->type;
        if (e->type == KEYS) {
            out[n++] = e->count;
            for (int i = 0; i < e->count; i++) out[n++] = e->keys[i];
        } else if (e->type == STARTED) {
            out[n++] = e->a;
            out[n++] = e->b;
            out[n++] = e->c;
        } else {
            out[n++] = e->a;
            out[n++] = e->b;
        }
        events_.drop();
    }
    return n;
}

int LiveCore::readMix(int16_t *out, int capacityFrames, int64_t *header) {
    const MixBlock *b = mixBlocks_.peek();
    if (b == nullptr) return 0;
    if (b->frames > capacityFrames) return -1;
    const MixBlock block = *b;
    mixData_.read(out, static_cast<uint32_t>(2 * block.frames));
    mixBlocks_.drop();
    header[0] = block.frame;
    header[1] = block.firstStart;
    header[2] = block.rate;
    return block.frames;
}

}  // namespace arc

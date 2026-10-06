// Replays voice-mixer.golden (written by VoiceMixerGoldenTest from the Kotlin
// VoiceMixer) through the C++ port and wants the same results: every sample
// of short renders, a hash of long ones, the voices started and the keys.
#include <cstdint>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <fstream>
#include <memory>
#include <sstream>
#include <string>
#include <vector>

#include "HostTest.h"
#include "VoiceMixer.h"

using arc::Sample;
using arc::VoiceMixer;

namespace {

// FNV-1a over 16-bit words, as VoiceMixerGoldenTest hashes them.
uint64_t fnv(const std::vector<int16_t> &pcm) {
    uint64_t h = 0xcbf29ce484222325ULL;
    for (int16_t v : pcm) {
        h ^= static_cast<uint16_t>(v);
        h *= 0x100000001b3ULL;
    }
    return h;
}

// VoiceMixerGoldenTest's noise: xorshift64, the top 16 bits of each step.
int16_t *noise(size_t size, int64_t seed) {
    auto *pcm = new int16_t[size > 0 ? size : 1];
    uint64_t x = static_cast<uint64_t>(seed);
    for (size_t i = 0; i < size; i++) {
        x ^= x << 13;
        x ^= x >> 7;
        x ^= x << 17;
        pcm[i] = static_cast<int16_t>(static_cast<uint16_t>(x >> 48));
    }
    return pcm;
}

struct Replay {
    std::string scenario;
    int render = 0;
    int reported = 0;
    std::unique_ptr<VoiceMixer> mixer;
    std::vector<std::unique_ptr<Sample>> samples;
    std::vector<int16_t> out;

    void mismatch(const char *what, const std::string &detail) {
        arc::test::failures()++;
        // The first few of a scenario say enough.
        if (reported++ < 5) {
            std::fprintf(stderr, "voice-mixer.golden: scenario %s, render %d: %s differs (%s)\n", scenario.c_str(), render,
                         what, detail.c_str());
        }
    }

    void addSample(int id, int channels, int size, int16_t *pcm) {
        if (static_cast<int>(samples.size()) <= id) samples.resize(id + 1);
        samples[id] = std::make_unique<Sample>(pcm, size / channels, channels);
    }
};

}  // namespace

int runVoiceMixerParity(const char *goldenPath) {
    std::ifstream in(goldenPath);
    if (!in) {
        std::fprintf(stderr, "can't read %s\n", goldenPath);
        arc::test::failures()++;
        return 0;
    }
    Replay r;
    int scenarios = 0;
    std::string line;
    while (std::getline(in, line)) {
        if (line.empty() || line[0] == '#') continue;
        std::istringstream words(line);
        std::string op;
        words >> op;
        if (op == "scenario") {
            int rate = 0;
            int maxVoices = 0;
            words >> r.scenario >> rate >> maxVoices;
            r.mixer.reset();
            r.samples.clear();
            r.mixer = std::make_unique<VoiceMixer>(rate, maxVoices, 1 << 16);
            r.render = 0;
            r.reported = 0;
        } else if (op == "sample") {
            int id = 0;
            int channels = 0;
            int size = 0;
            words >> id >> channels >> size;
            auto *pcm = new int16_t[size > 0 ? size : 1];
            for (int i = 0; i < size; i++) {
                int v = 0;
                words >> v;
                pcm[i] = static_cast<int16_t>(v);
            }
            r.addSample(id, channels, size, pcm);
        } else if (op == "fill") {
            int id = 0;
            int channels = 0;
            int size = 0;
            int value = 0;
            words >> id >> channels >> size >> value;
            auto *pcm = new int16_t[size > 0 ? size : 1];
            for (int i = 0; i < size; i++) pcm[i] = static_cast<int16_t>(value);
            r.addSample(id, channels, size, pcm);
        } else if (op == "noise") {
            int id = 0;
            int channels = 0;
            int size = 0;
            int64_t seed = 0;
            words >> id >> channels >> size >> seed;
            r.addSample(id, channels, size, noise(static_cast<size_t>(size), seed));
        } else if (op == "start") {
            int key = 0;
            int id = 0;
            int rate = 0;
            std::string pitchBits;
            int64_t tag = 0;
            words >> key >> id >> rate >> pitchBits >> tag;
            const uint64_t bits = std::strtoull(pitchBits.c_str(), nullptr, 16);
            double pitch = 0;
            std::memcpy(&pitch, &bits, sizeof pitch);
            CHECK(r.mixer->start(key, r.samples[id].get(), rate, pitch, tag));
        } else if (op == "release" || op == "cut") {
            int key = 0;
            words >> key;
            CHECK(op == "release" ? r.mixer->release(key) : r.mixer->cut(key));
        } else if (op == "stop") {
            CHECK(r.mixer->stopAll());
        } else if (op == "render") {
            int frames = 0;
            words >> frames;
            r.render++;
            r.out.assign(static_cast<size_t>(frames) * 2, 0);
            r.mixer->render(r.out.data(), frames);
        } else if (op == "out") {
            size_t n = 0;
            words >> n;
            if (n != r.out.size()) r.mismatch("length", std::to_string(n) + " vs " + std::to_string(r.out.size()));
            for (size_t i = 0; i < n && i < r.out.size(); i++) {
                int v = 0;
                words >> v;
                if (v != r.out[i]) {
                    r.mismatch("sample", "at " + std::to_string(i) + ": Kotlin " + std::to_string(v) + ", C++ " +
                                             std::to_string(r.out[i]));
                    break;
                }
            }
        } else if (op == "hash") {
            std::string hex;
            words >> hex;
            const uint64_t want = std::strtoull(hex.c_str(), nullptr, 16);
            if (want != fnv(r.out)) r.mismatch("hash of the render", hex);
        } else if (op == "started") {
            int n = 0;
            words >> n;
            if (n != r.mixer->startedCount()) {
                r.mismatch("started count", std::to_string(n) + " vs " + std::to_string(r.mixer->startedCount()));
                continue;
            }
            for (int i = 0; i < n; i++) {
                int key = 0;
                int64_t tag = 0;
                int64_t frame = 0;
                words >> key >> tag >> frame;
                const VoiceMixer::Started &s = r.mixer->started()[i];
                if (s.key != key || s.tag != tag || s.frame != frame) r.mismatch("started", "voice " + std::to_string(i));
            }
        } else if (op == "keys") {
            int n = 0;
            words >> n;
            bool same = n == r.mixer->keyCount();
            for (int i = 0; same && i < n; i++) {
                int key = 0;
                words >> key;
                same = key == r.mixer->keys()[i];
            }
            if (!same) r.mismatch("keys", line);
        } else if (op == "frame") {
            int64_t frame = 0;
            words >> frame;
            if (frame != r.mixer->frame()) r.mismatch("frame", std::to_string(frame));
        } else if (op == "end") {
            scenarios++;
        } else {
            std::fprintf(stderr, "voice-mixer.golden: unknown line: %s\n", line.c_str());
            arc::test::failures()++;
        }
    }
    r.mixer.reset();
    CHECK(scenarios > 20);
    return scenarios;
}

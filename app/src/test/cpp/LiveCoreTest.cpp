// LiveCore on the host: commands in, sounds held and let go of safely,
// reports and REC blocks out, a restart, the sequencer's timed commands (a
// sound kept while a timed start waits on it), the FX bus's settings (kept
// across a restart, a knob's drag merged), and the three threads at once (built
// with AddressSanitizer where the compiler has it, so a sound freed under a
// voice fails the run).
#include <atomic>
#include <chrono>
#include <cstdint>
#include <memory>
#include <thread>
#include <vector>

#include "HostTest.h"
#include "LiveCore.h"

using arc::LiveCore;
using arc::Sample;
using arc::fx::FxControl;

namespace {

Sample *steady(int frames, int16_t v, int channels = 1) {
    auto *pcm = new int16_t[static_cast<size_t>(frames) * channels];
    for (int i = 0; i < frames * channels; i++) pcm[i] = v;
    return new Sample(pcm, frames, channels);
}

struct Reports {
    struct Started {
        int64_t key, frame, tag;
    };
    std::vector<Started> started;
    std::vector<std::vector<int64_t>> keys;
    std::vector<std::pair<int64_t, int64_t>> output;

    explicit Reports(LiveCore &core) {
        int64_t buffer[4096];
        const int n = core.poll(buffer, 4096);
        for (int i = 0; i < n;) {
            if (buffer[i] == LiveCore::STARTED) {
                started.push_back({buffer[i + 1], buffer[i + 2], buffer[i + 3]});
                i += 4;
            } else if (buffer[i] == LiveCore::KEYS) {
                keys.emplace_back(buffer + i + 2, buffer + i + 2 + buffer[i + 1]);
                i += 2 + static_cast<int>(buffer[i + 1]);
            } else {
                output.emplace_back(buffer[i + 1], buffer[i + 2]);
                i += 3;
            }
        }
    }
};

// Reads (and drops) what was reported; frees what was let go of.
void drain(LiveCore &core) { Reports discard(core); }

std::vector<int16_t> render(LiveCore &core, int frames) {
    std::vector<int16_t> out(static_cast<size_t>(frames) * 2);
    core.render(out.data(), frames);
    return out;
}

void aLoadedSoundPlaysAndIsReported() {
    LiveCore core(1000);
    CHECK(core.load(0, steady(100, 1000)));
    CHECK(core.start(7, 0, 1000, 1.0, 42));
    const auto out = render(core, 10);
    CHECK(out[0] == 1000 && out[1] == 1000 && out[19] == 1000);
    Reports r(core);
    CHECK(r.started.size() == 1 && r.started[0].key == 7 && r.started[0].frame == 0 && r.started[0].tag == 42);
    CHECK(r.keys.size() == 1 && r.keys[0] == std::vector<int64_t>{7});
    // Nothing new: nothing reported.
    render(core, 10);
    Reports again(core);
    CHECK(again.started.empty() && again.keys.empty());
}

void anUnloadedSoundPlaysOnAndIsFreedOnceItEnds() {
    LiveCore core(1000);
    CHECK(core.load(3, steady(1000, 1000)));
    CHECK(core.start(1, 3, 1000, 1.0, 0));
    render(core, 10);
    CHECK(core.unload(3));
    const auto playing = render(core, 10);
    CHECK(playing[0] == 1000 && playing[19] == 1000);
    drain(core);
    CHECK(core.freed() == 0);
    // An empty slot plays nothing.
    CHECK(core.start(2, 3, 1000, 1.0, 0));
    CHECK(core.release(1));
    render(core, 200);
    Reports r(core);
    CHECK(core.freed() == 1);
    CHECK(r.started.empty());
    CHECK(!r.keys.empty() && r.keys.back().empty());
}

void aStartAndAnUnloadTogetherStillPlay() {
    LiveCore core(1000);
    CHECK(core.load(0, steady(30, 500)));
    // The start reads the slot as the commands are applied: before the unload empties it.
    CHECK(core.start(1, 0, 1000, 1.0, 0));
    CHECK(core.unload(0));
    // A callback with no frames takes no commands, so nothing is freed before the start is applied.
    core.render(nullptr, 0);
    drain(core);
    const auto out = render(core, 10);
    CHECK(out[0] == 500);
    drain(core);
    CHECK(core.freed() == 0);
    render(core, 30);
    drain(core);
    CHECK(core.freed() == 1);
}

void aLoadIntoAFullSlotLetsTheOldSoundGo() {
    LiveCore core(1000);
    CHECK(core.load(0, steady(10, 1)));
    CHECK(core.load(0, steady(10, 2)));
    CHECK(core.start(1, 0, 1000, 1.0, 0));
    const auto out = render(core, 1);
    CHECK(out[0] == 2);
    drain(core);
    CHECK(core.freed() == 1);
}

void aRestartDropsTheStartsQueuedMeanwhileAndFadesOut() {
    LiveCore core(1000);
    CHECK(core.load(0, steady(1000, 1000)));
    CHECK(core.start(1, 0, 1000, 1.0, 5));
    render(core, 10);
    drain(core);
    // The stream went away; presses meanwhile aren't heard late.
    CHECK(core.start(2, 0, 1000, 1.0, 6));
    core.restart(1000);
    const auto out = render(core, 10);
    CHECK(out[0] > 0 && out[0] <= 1000);
    CHECK(out[2 * 4] == 0);
    Reports r(core);
    CHECK(r.started.empty());
    CHECK(!r.keys.empty() && r.keys.back().empty());
    // After it, presses play as before.
    CHECK(core.start(3, 0, 1000, 1.0, 7));
    CHECK(render(core, 1)[0] == 1000);
    CHECK(Reports(core).started.size() == 1);
}

void aRestartAtAnotherRateStartsTheMixerOver() {
    LiveCore core(1000);
    CHECK(core.load(0, steady(1000, 1000)));
    CHECK(core.start(1, 0, 1000, 1.0, 0));
    render(core, 10);
    drain(core);
    core.restart(2000);
    CHECK(core.outRate() == 2000);
    CHECK(core.frame() == 10);
    CHECK(render(core, 4)[0] == 0);
    Reports r(core);
    CHECK(!r.keys.empty() && r.keys.back().empty());
    // The sound is now read at half a frame per output frame.
    CHECK(core.start(2, 0, 1000, 1.0, 0));
    render(core, 4);
    drain(core);
    CHECK(core.freed() == 0);
}

void recHandsBackEachBlockWholeWithItsFirstStart() {
    LiveCore core(48000);
    CHECK(core.load(0, steady(48000, 100)));
    render(core, 64);
    int16_t mix[2 * LiveCore::CHUNK];
    int64_t header[3];
    // Off: nothing comes back.
    CHECK(core.readMix(mix, LiveCore::CHUNK, header) == 0);
    core.setRecording(true);
    CHECK(core.start(1, 0, 48000, 1.0, 9));
    const auto out = render(core, 3000);
    const int sizes[] = {1024, 1024, 952};
    int64_t at = 64;
    size_t offset = 0;
    for (int size : sizes) {
        CHECK(core.readMix(mix, LiveCore::CHUNK, header) == size);
        CHECK(header[0] == at);
        CHECK(header[1] == (at == 64 ? 64 : -1));
        CHECK(header[2] == 48000);
        bool same = true;
        for (int i = 0; i < 2 * size; i++) same = same && mix[i] == out[offset + i];
        CHECK(same);
        at += size;
        offset += 2 * static_cast<size_t>(size);
    }
    CHECK(core.readMix(mix, LiveCore::CHUNK, header) == 0);
    // A buffer too small leaves the block where it is.
    render(core, 100);
    CHECK(core.readMix(mix, 50, header) == -1);
    CHECK(core.readMix(mix, LiveCore::CHUNK, header) == 100);
    core.setRecording(false);
    render(core, 100);
    CHECK(core.readMix(mix, LiveCore::CHUNK, header) == 0);
}

void aFullQueueRefuses() {
    LiveCore core(1000);
    int pushed = 0;
    while (core.release(1)) pushed++;
    CHECK(pushed == 1024);
    // A render takes what fits in the mixer's queue; the rest waits for the next.
    render(core, 1);
    CHECK(core.release(1));
    Sample *s = steady(1, 1);
    CHECK(core.load(-1, s) == false);
    CHECK(core.load(LiveCore::MAX_SAMPLES, s) == false);
    delete s;
}

void aTimedStartPlaysOnItsFrameAndIsReportedThere() {
    LiveCore core(1000);
    CHECK(core.rendered() == 0);
    CHECK(core.load(0, steady(100, 1000)));
    CHECK(core.start(7, 0, 1000, 1.0, -1, arc::VoiceShape(), 20));
    render(core, 16);
    CHECK(core.rendered() == 16);
    CHECK(Reports(core).started.empty());
    const auto out = render(core, 16);
    CHECK(out[2 * 3] == 0 && out[2 * 4] == 1000);
    CHECK(core.rendered() == 32);
    Reports r(core);
    CHECK(r.started.size() == 1 && r.started[0].key == 7 && r.started[0].frame == 20 && r.started[0].tag == -1);
    // A callback with no frames renders nothing, and the count stays.
    core.render(nullptr, 0);
    CHECK(core.rendered() == 32);
}

void aTaggedReleaseLetsGoOfItsOwnVoiceOnly() {
    LiveCore core(1000);
    CHECK(core.load(0, steady(1000, 1000)));
    CHECK(core.start(1, 0, 1000, 1.0, 5));
    // Another tag: the voice plays on.
    CHECK(core.releaseAt(1, 10, -9));
    render(core, 200);
    Reports held(core);
    CHECK(!held.keys.empty() && held.keys.back() == std::vector<int64_t>{1});
    CHECK(core.releaseAt(1, 210, 5));
    render(core, 8);
    drain(core);
    const auto out = render(core, 100);
    CHECK(out[0] == 1000);
    CHECK(out[2 * 30] == 0);
    Reports r(core);
    CHECK(!r.keys.empty() && r.keys.back().empty());
}

void aSoundIsKeptWhileATimedStartWaitsOnIt() {
    LiveCore core(1000);
    CHECK(core.load(0, steady(10, 700)));
    CHECK(core.start(1, 0, 1000, 1.0, -1, arc::VoiceShape(), 40));
    render(core, 16);
    CHECK(core.unload(0));
    render(core, 16);
    drain(core);
    // Unloaded, but a start still waits to read it.
    CHECK(core.freed() == 0);
    const auto out = render(core, 16);
    CHECK(out[2 * 8] == 700);
    render(core, 16);
    drain(core);
    CHECK(core.freed() == 1);
}

void flushTimedDropsWhatWaitsAndLetsItsSoundGo() {
    LiveCore core(1000);
    CHECK(core.load(0, steady(10, 700)));
    CHECK(core.start(1, 0, 1000, 1.0, -1, arc::VoiceShape(), 40));
    render(core, 16);
    CHECK(core.unload(0));
    CHECK(core.flushTimed());
    render(core, 64);
    Reports r(core);
    CHECK(r.started.empty());
    CHECK(core.freed() == 1);
}

void aRestartDropsTimedCommandsWaiting() {
    LiveCore core(1000);
    CHECK(core.load(0, steady(1000, 1000)));
    CHECK(core.start(1, 0, 1000, 1.0, -1, arc::VoiceShape(), 40));
    render(core, 16);
    // One still in the queue too.
    CHECK(core.start(2, 0, 1000, 1.0, -2, arc::VoiceShape(), 50));
    core.restart(1000);
    render(core, 64);
    CHECK(Reports(core).started.empty());
    // At another rate as well.
    CHECK(core.start(3, 0, 1000, 1.0, -3, arc::VoiceShape(), 200));
    render(core, 16);
    core.restart(2000);
    CHECK(core.unload(0));
    render(core, 400);
    CHECK(Reports(core).started.empty());
    CHECK(core.freed() == 1);
}

void pastTheTimedCommandsItHoldsTheMixerPlaysOneAtOnce() {
    LiveCore core(1000);
    CHECK(core.load(0, steady(10, 1)));
    for (int i = 0; i < arc::VoiceMixer::MAX_PENDING; i++) CHECK(core.start(1, 0, 1000, 1.0, -1, arc::VoiceShape(), 1000000));
    // A render takes what fits in the mixer's queue.
    render(core, 1);
    render(core, 1);
    CHECK(Reports(core).started.empty());
    CHECK(core.start(2, 0, 1000, 1.0, -2, arc::VoiceShape(), 1000000));
    render(core, 1);
    Reports r(core);
    CHECK(r.started.size() == 1 && r.started[0].key == 2 && r.started[0].frame == 2);
    // The sound goes once nothing waits on it.
    CHECK(core.unload(0));
    render(core, 20);
    drain(core);
    CHECK(core.freed() == 0);
    CHECK(core.flushTimed());
    render(core, 1);
    drain(core);
    CHECK(core.freed() == 1);
}

void outputReportsComeBack() {
    LiveCore core(1000);
    core.reportOutput(2, 288);
    Reports r(core);
    CHECK(r.output.size() == 1 && r.output[0].first == 2 && r.output[0].second == 288);
}

// A voice on group 0's bus, at [rate]: the FX bus's send and effect apply to it.
bool startOnBus(LiveCore &core, int32_t key, int64_t tag) {
    arc::VoiceShape shape;
    shape.bus = 0;
    return core.start(key, 0, 48000, 1.0, tag, shape);
}

void aControlReachesTheMixersFxBus() {
    LiveCore dry(48000);
    LiveCore wet(48000);
    for (LiveCore *core : {&dry, &wet}) {
        CHECK(core->load(0, steady(48000, 12000)));
        CHECK(startOnBus(*core, 1, 0));
    }
    CHECK(wet.control(FxControl::SEND, 0, 1.0f, 0.0f));
    CHECK(wet.control(FxControl::FX_TYPE, FxControl::DISTORTION, 1.0f, 0.5f));
    const auto a = render(dry, 256);
    const auto b = render(wet, 256);
    CHECK(a[2 * 255] == 12000);
    CHECK(a != b);
}

void aRestartKeepsTheControlsQueuedMeanwhile() {
    LiveCore before(48000);
    LiveCore after(48000);
    for (LiveCore *core : {&before, &after}) {
        CHECK(core->load(0, steady(48000, 12000)));
        render(*core, 16);
    }
    // The same settings, one engine's sent while its stream was away.
    CHECK(before.control(FxControl::SEND, 0, 1.0f, 0.0f));
    CHECK(before.control(FxControl::FX_TYPE, FxControl::FILTER, 0.2f, 0.5f));
    render(before, 16);
    CHECK(after.control(FxControl::SEND, 0, 1.0f, 0.0f));
    CHECK(after.control(FxControl::FX_TYPE, FxControl::FILTER, 0.2f, 0.5f));
    CHECK(startOnBus(after, 1, 0));
    after.restart(48000);
    // The press made meanwhile is dropped; the settings aren't.
    CHECK(render(after, 16)[0] == 0);
    CHECK(Reports(after).started.empty());
    CHECK(startOnBus(before, 2, 0));
    CHECK(startOnBus(after, 2, 0));
    CHECK(render(before, 256) == render(after, 256));
}

void aKnobsDragTakesOneOfTheMixersCommands() {
    LiveCore core(48000);
    CHECK(core.load(0, steady(48000, 1000)));
    // Far more than the mixer takes in one render, all the same knob: only the last is applied.
    for (int i = 0; i < 1000; i++) CHECK(core.control(FxControl::FX_XY, 0, static_cast<float>(i) / 1000.0f, 0.5f));
    CHECK(core.start(1, 0, 48000, 1.0, 9));
    render(core, 16);
    CHECK(Reports(core).started.size() == 1);
    // Two knobs in turn aren't merged: the start waits for the renders that take them all.
    for (int i = 0; i < 1000; i++) CHECK(core.control(FxControl::SEND, i % 2, 0.5f, 0.0f));
    CHECK(core.start(2, 0, 48000, 1.0, 10));
    render(core, 16);
    CHECK(Reports(core).started.empty());
    for (int i = 0; i < 4; i++) render(core, 16);
    const Reports r(core);
    CHECK(r.started.size() == 1 && r.started[0].tag == 10);
}

// The producer, the audio thread and the poll thread at once, sounds loaded,
// played and unloaded all the while. AddressSanitizer catches a sound freed
// while a voice reads it; the counts catch one never freed.
void threeThreadsAtOnce() {
    auto core = std::make_unique<LiveCore>(48000);
    std::atomic<bool> done{false};
    std::atomic<int64_t> loaded{0};
    std::thread audio([&] {
        int16_t out[2 * 192];
        while (!done.load()) core->render(out, 192);
        // What was still queued.
        for (int i = 0; i < 64; i++) core->render(out, 192);
    });
    std::thread poll([&] {
        int64_t buffer[1024];
        while (!done.load()) core->poll(buffer, 1024);
    });
    uint32_t seed = 1;
    for (int i = 0; i < 20000; i++) {
        seed = seed * 1664525u + 1013904223u;
        const int slot = static_cast<int>(seed >> 8) % 16;
        const int key = static_cast<int>(seed >> 16) % 12;
        switch ((seed >> 24) % 5) {
            case 0: {
                Sample *s = steady(1 + static_cast<int>(seed % 4000), static_cast<int16_t>(seed), 1 + static_cast<int>(seed >> 30) % 2);
                if (core->load(slot, s)) {
                    loaded++;
                } else {
                    delete s;
                }
                break;
            }
            case 1:
                core->unload(slot);
                break;
            case 2:
                if ((seed & 1) != 0) {
                    core->start(key, slot, 46875, 1.0 + (seed % 7) * 0.25, i + 1);
                } else {
                    // A sequencer's note, some way ahead of the mix, now and then flushed.
                    core->start(key, slot, 46875, 1.0, -(i + 1), arc::VoiceShape(), core->rendered() + seed % 2000);
                    if (seed % 61 == 0) core->flushTimed();
                }
                break;
            case 3:
                if ((seed & 1) != 0) {
                    core->release(key);
                } else {
                    core->releaseAt(key, core->rendered() + seed % 3000, -(i - static_cast<int>(seed % 50)));
                }
                break;
            default:
                core->cut(key);
                break;
        }
        if (i % 64 == 0) std::this_thread::yield();
    }
    for (int s = 0; s < 16; s++) {
        while (!core->unload(s)) std::this_thread::yield();
    }
    while (!core->stopAll()) std::this_thread::yield();
    std::this_thread::sleep_for(std::chrono::milliseconds(50));
    done.store(true);
    audio.join();
    poll.join();
    int64_t buffer[1024];
    core->poll(buffer, 1024);
    // Every sound unloaded and no longer playing is back and freed.
    CHECK(core->freed() == loaded.load());
    core.reset();
}

}  // namespace

void runLiveCoreTests() {
    aLoadedSoundPlaysAndIsReported();
    anUnloadedSoundPlaysOnAndIsFreedOnceItEnds();
    aStartAndAnUnloadTogetherStillPlay();
    aLoadIntoAFullSlotLetsTheOldSoundGo();
    aRestartDropsTheStartsQueuedMeanwhileAndFadesOut();
    aRestartAtAnotherRateStartsTheMixerOver();
    recHandsBackEachBlockWholeWithItsFirstStart();
    aFullQueueRefuses();
    aTimedStartPlaysOnItsFrameAndIsReportedThere();
    aTaggedReleaseLetsGoOfItsOwnVoiceOnly();
    aSoundIsKeptWhileATimedStartWaitsOnIt();
    flushTimedDropsWhatWaitsAndLetsItsSoundGo();
    aRestartDropsTimedCommandsWaiting();
    pastTheTimedCommandsItHoldsTheMixerPlaysOneAtOnce();
    outputReportsComeBack();
    aControlReachesTheMixersFxBus();
    aRestartKeepsTheControlsQueuedMeanwhile();
    aKnobsDragTakesOneOfTheMixersCommands();
    threeThreadsAtOnce();
}

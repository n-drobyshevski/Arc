// BufferTuner against OutputPacerTest's resize case: the same sizes at the same times.
#include "BufferTuner.h"
#include "HostTest.h"

using arc::BufferTuner;

void runBufferTunerTests() {
    BufferTuner t(192, 384);
    const int32_t cap = 192 * 8;
    int64_t now = 0;
    CHECK(t.resize(384, cap, 0, now) == 384);
    CHECK(t.resize(384, cap, 1, now) == 576);
    CHECK(t.resize(576, cap, 2, now) == 768);
    // No growing past the capacity.
    CHECK(t.resize(cap, cap, 3, now) == cap);
    now += BufferTuner::DECAY_NS - 1;
    CHECK(t.resize(768, cap, 3, now) == 768);
    now += 2;
    CHECK(t.resize(768, cap, 3, now) == 576);
    now += BufferTuner::DECAY_NS + 1;
    CHECK(t.resize(576, cap, 3, now) == 384);
    now += BufferTuner::DECAY_NS + 1;
    CHECK(t.resize(384, cap, 3, now) == 384);
}

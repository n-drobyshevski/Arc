// The rings: order kept across two threads, refusals when full, runs of samples across the wrap.
#include <cstdint>
#include <memory>
#include <thread>

#include "HostTest.h"
#include "SpscRing.h"

using arc::SpscRing;
using arc::SpscSampleRing;

void runRingTests() {
    {
        SpscRing<int, 4> ring;
        int v = 0;
        CHECK(!ring.pop(v));
        for (int i = 0; i < 4; i++) CHECK(ring.push(i));
        CHECK(ring.full());
        CHECK(!ring.push(9));
        CHECK(ring.peek() != nullptr && *ring.peek() == 0);
        ring.drop();
        CHECK(ring.pop(v) && v == 1);
        CHECK(!ring.full());
    }
    {
        // A million items through a small ring, in order.
        auto ring = std::make_unique<SpscRing<int64_t, 64>>();
        constexpr int64_t N = 1000000;
        std::thread producer([&] {
            for (int64_t i = 0; i < N;) {
                if (ring->push(i)) i++;
            }
        });
        int64_t next = 0;
        bool ordered = true;
        while (next < N) {
            int64_t v = 0;
            if (ring->pop(v)) ordered = ordered && v == next++;
        }
        producer.join();
        CHECK(ordered);
    }
    {
        auto ring = std::make_unique<SpscSampleRing<16>>();
        int16_t in[16];
        int16_t out[16];
        for (int i = 0; i < 16; i++) in[i] = static_cast<int16_t>(i + 1);
        CHECK(ring->write(in, 10));
        CHECK(!ring->write(in, 7));
        CHECK(ring->room() == 6);
        CHECK(!ring->read(out, 11));
        CHECK(ring->read(out, 10) && out[0] == 1 && out[9] == 10);
        // Across the end of the buffer.
        CHECK(ring->write(in, 12));
        CHECK(ring->read(out, 12));
        bool same = true;
        for (int i = 0; i < 12; i++) same = same && out[i] == in[i];
        CHECK(same);
    }
}

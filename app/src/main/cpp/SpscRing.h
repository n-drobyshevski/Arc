// Lock-free rings between exactly one producer thread and one consumer
// thread (an addition): how commands reach the audio callback and how its
// reports come back, without a lock or an allocation on either side.
//
// Fixed capacity (a power of two), set at compile time: a full ring refuses a
// push rather than growing or waiting, and the caller decides what to drop.
// The producer publishes an item with a release store of its tail; the
// consumer reads it after an acquire load, so the item's contents (and
// anything written before the push, such as a sample's PCM) are visible.
#pragma once

#include <atomic>
#include <cstdint>
#include <cstring>

namespace arc {

/** Items of [T] (copied in and out), at most [N] waiting. */
template <typename T, uint32_t N>
class SpscRing {
    static_assert(N >= 2 && (N & (N - 1)) == 0, "capacity must be a power of two");

public:
    /** Producer: adds [item]; false when the ring is full. */
    bool push(const T &item) {
        const uint32_t tail = tail_.load(std::memory_order_relaxed);
        if (tail - head_.load(std::memory_order_acquire) == N) return false;
        items_[tail & (N - 1)] = item;
        tail_.store(tail + 1, std::memory_order_release);
        return true;
    }

    /** Consumer: takes the oldest item into [item]; false when the ring is empty. */
    bool pop(T &item) {
        const uint32_t head = head_.load(std::memory_order_relaxed);
        if (tail_.load(std::memory_order_acquire) == head) return false;
        item = items_[head & (N - 1)];
        head_.store(head + 1, std::memory_order_release);
        return true;
    }

    /** Producer: whether a [push] now would be refused (it stays false until the producer pushes). */
    bool full() const {
        return tail_.load(std::memory_order_relaxed) - head_.load(std::memory_order_acquire) == N;
    }

    /** Consumer: the oldest item, left in the ring; null when empty. */
    const T *peek() const {
        const uint32_t head = head_.load(std::memory_order_relaxed);
        if (tail_.load(std::memory_order_acquire) == head) return nullptr;
        return &items_[head & (N - 1)];
    }

    /** Consumer: drops the item [peek] returned. */
    void drop() { head_.store(head_.load(std::memory_order_relaxed) + 1, std::memory_order_release); }

private:
    // Each index on its own cache line: the two threads don't fight over one.
    alignas(64) std::atomic<uint32_t> head_{0};  // written by the consumer
    alignas(64) std::atomic<uint32_t> tail_{0};  // written by the producer
    alignas(64) T items_[N]{};
};

/** 16-bit samples written and read in runs, all or nothing; at most [N] waiting. */
template <uint32_t N>
class SpscSampleRing {
    static_assert(N >= 2 && (N & (N - 1)) == 0, "capacity must be a power of two");

public:
    /** Producer: appends [n] samples; false (and nothing written) when they don't fit. */
    bool write(const int16_t *from, uint32_t n) {
        const uint32_t tail = tail_.load(std::memory_order_relaxed);
        if (N - (tail - head_.load(std::memory_order_acquire)) < n) return false;
        const uint32_t at = tail & (N - 1);
        const uint32_t first = n < N - at ? n : N - at;
        std::memcpy(data_ + at, from, first * sizeof(int16_t));
        std::memcpy(data_, from + first, (n - first) * sizeof(int16_t));
        tail_.store(tail + n, std::memory_order_release);
        return true;
    }

    /** Producer: how many samples a [write] could take now (at least that many until the producer writes). */
    uint32_t room() const { return N - (tail_.load(std::memory_order_relaxed) - head_.load(std::memory_order_acquire)); }

    /** Consumer: takes the next [n] samples; false (and nothing read) when fewer are waiting. */
    bool read(int16_t *to, uint32_t n) {
        const uint32_t head = head_.load(std::memory_order_relaxed);
        if (tail_.load(std::memory_order_acquire) - head < n) return false;
        const uint32_t at = head & (N - 1);
        const uint32_t first = n < N - at ? n : N - at;
        std::memcpy(to, data_ + at, first * sizeof(int16_t));
        std::memcpy(to + first, data_, (n - first) * sizeof(int16_t));
        head_.store(head + n, std::memory_order_release);
        return true;
    }

private:
    alignas(64) std::atomic<uint32_t> head_{0};
    alignas(64) std::atomic<uint32_t> tail_{0};
    alignas(64) int16_t data_[N]{};
};

}  // namespace arc

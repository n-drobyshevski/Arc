// A few lines of test harness for the native engine's host test (an
// addition): CHECK records a failure with where it was, and the run fails if
// any did. No framework, so any C++17 compiler builds it.
#pragma once

#include <cstdio>

namespace arc::test {

inline int &failures() {
    static int n = 0;
    return n;
}

}  // namespace arc::test

#define CHECK(cond)                                                                   \
    do {                                                                              \
        if (!(cond)) {                                                                \
            std::fprintf(stderr, "%s:%d: CHECK failed: %s\n", __FILE__, __LINE__, #cond); \
            arc::test::failures()++;                                                  \
        }                                                                             \
    } while (0)

// The suites, each in its own file.
int runVoiceMixerParity(const char *goldenPath);
int runFxMathParity(const char *goldenPath);
void runLiveCoreTests();
void runBufferTunerTests();
void runRingTests();

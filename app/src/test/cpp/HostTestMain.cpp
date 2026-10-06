// The native engine's host test (an addition): `arc-host-test <voice-mixer.golden>`.
// Built and run by :app:hostMixerTest (app/build.gradle.kts), part of `./gradlew test`.
#include <cstdio>

#include "HostTest.h"

int main(int argc, char **argv) {
    if (argc < 2) {
        std::fprintf(stderr, "usage: %s <voice-mixer.golden>\n", argv[0]);
        return 2;
    }
    const int scenarios = runVoiceMixerParity(argv[1]);
    runLiveCoreTests();
    runBufferTunerTests();
    runRingTests();
    if (arc::test::failures() > 0) {
        std::fprintf(stderr, "native host test: %d failure(s)\n", arc::test::failures());
        return 1;
    }
    std::printf("native host test: passed (%d mixer scenarios matched the Kotlin mixer)\n", scenarios);
    return 0;
}

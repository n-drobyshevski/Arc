// Replays fx-math.golden (written by FxMathGoldenTest from the Kotlin FxMath)
// through the C++ port and wants the same bits: each line is a function, its
// arguments (floats as bits, ints in decimal) and what it gave; "lcg" and
// "lcgunit" lines are a seed's first states and first numbers in 0..1.
#include <cstdint>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <fstream>
#include <sstream>
#include <string>

#include "HostTest.h"
#include "fx/FxMath.h"

namespace {

float readFloat(std::istringstream &words) {
    std::string hex;
    words >> hex;
    return arc::fx::fromBits(static_cast<uint32_t>(std::strtoul(hex.c_str(), nullptr, 16)));
}

uint32_t bitsOf(float v) {
    uint32_t b;
    std::memcpy(&b, &v, sizeof b);
    return b;
}

int reported = 0;

void expectBits(const std::string &line, float want, float got) {
    if (bitsOf(want) == bitsOf(got)) return;
    arc::test::failures()++;
    // The first few say enough.
    if (reported++ < 10) {
        std::fprintf(stderr, "fx-math.golden: %s: Kotlin %08x, C++ %08x\n", line.c_str(), bitsOf(want), bitsOf(got));
    }
}

}  // namespace

int runFxMathParity(const char *goldenPath) {
    namespace fx = arc::fx;
    std::ifstream in(goldenPath);
    if (!in) {
        std::fprintf(stderr, "can't read %s\n", goldenPath);
        arc::test::failures()++;
        return 0;
    }
    int vectors = 0;
    bool ended = false;
    std::string line;
    while (std::getline(in, line)) {
        if (line.empty() || line[0] == '#') continue;
        std::istringstream words(line);
        std::string op;
        words >> op;
        if (op == "const") {
            std::string name;
            words >> name;
            const float want = readFloat(words);
            if (name == "DENORMAL") {
                expectBits(line, want, fx::DENORMAL);
            } else if (name == "PI_F") {
                expectBits(line, want, fx::PI_F);
            } else {
                std::fprintf(stderr, "fx-math.golden: unknown constant: %s\n", line.c_str());
                arc::test::failures()++;
            }
        } else if (op == "flush") {
            const float x = readFloat(words);
            expectBits(line, readFloat(words), fx::flush(x));
        } else if (op == "clamp01") {
            const float x = readFloat(words);
            expectBits(line, readFloat(words), fx::clamp01(x));
        } else if (op == "lerp") {
            const float a = readFloat(words);
            const float b = readFloat(words);
            const float t = readFloat(words);
            expectBits(line, readFloat(words), fx::lerp(a, b, t));
        } else if (op == "onePoleCoef") {
            const float ms = readFloat(words);
            int32_t rate = 0;
            words >> rate;
            expectBits(line, readFloat(words), fx::onePoleCoef(ms, rate));
        } else if (op == "tanApprox") {
            const float w = readFloat(words);
            expectBits(line, readFloat(words), fx::tanApprox(w));
        } else if (op == "svfG") {
            const float hz = readFloat(words);
            int32_t rate = 0;
            words >> rate;
            expectBits(line, readFloat(words), fx::svfG(hz, rate));
        } else if (op == "softClip") {
            const float x = readFloat(words);
            expectBits(line, readFloat(words), fx::softClip(x));
        } else if (op == "knobHz") {
            const float k = readFloat(words);
            const float lo = readFloat(words);
            const float hi = readFloat(words);
            expectBits(line, readFloat(words), fx::knobHz(k, lo, hi));
        } else if (op == "triangle") {
            const float p = readFloat(words);
            expectBits(line, readFloat(words), fx::triangle(p));
        } else if (op == "parabolicSine") {
            const float p = readFloat(words);
            expectBits(line, readFloat(words), fx::parabolicSine(p));
        } else if (op == "wrap01") {
            const float p = readFloat(words);
            expectBits(line, readFloat(words), fx::wrap01(p));
        } else if (op == "semitoneRatio") {
            int32_t n = 0;
            words >> n;
            expectBits(line, readFloat(words), fx::semitoneRatio(n));
        } else if (op == "lcg" || op == "lcgunit") {
            int32_t seed = 0;
            int n = 0;
            words >> seed >> n;
            fx::Lcg lcg(seed);
            for (int i = 0; i < n; i++) {
                if (op == "lcg") {
                    int64_t want = 0;
                    words >> want;
                    const int32_t got = lcg.next();
                    if (want != got) {
                        arc::test::failures()++;
                        if (reported++ < 10) {
                            std::fprintf(stderr, "fx-math.golden: lcg %d, number %d: Kotlin %lld, C++ %d\n", seed, i,
                                         static_cast<long long>(want), got);
                        }
                    }
                } else {
                    expectBits(line, readFloat(words), lcg.unit());
                }
            }
        } else if (op == "end") {
            ended = true;
            continue;
        } else {
            std::fprintf(stderr, "fx-math.golden: unknown line: %s\n", line.c_str());
            arc::test::failures()++;
            continue;
        }
        vectors++;
    }
    CHECK(ended);
    CHECK(vectors > 500);
    return vectors;
}

# Live's native audio engine (an addition): libarc_live.so, an Oboe (AAudio)
# output that the app prefers for Live and falls back from to AudioTrack
# (see LiveAudio.kt). Oboe comes as a prefab package from Google Maven, built
# against the shared C++ runtime, so the app uses c++_shared too (build.gradle.kts).
#
# The mixer must round as the Kotlin one does (VoiceMixer.h), so no
# floating-point contraction. It is built optimized in debug builds too,
# since those are the test builds people play.
cmake_minimum_required(VERSION 3.22.1)
project(arc_live LANGUAGES CXX)

find_package(oboe REQUIRED CONFIG)

add_library(arc_live SHARED
    NativeAudio.cpp
    LiveEngine.cpp
    LiveCore.cpp
    VoiceMixer.cpp
)

target_compile_features(arc_live PRIVATE cxx_std_17)
target_compile_options(arc_live PRIVATE -Wall -Wextra -Werror -O2 -ffp-contract=off -fno-fast-math)

target_link_libraries(arc_live PRIVATE oboe::oboe)

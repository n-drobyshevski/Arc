# Live's native audio engine (an addition): libarc_live.so, an Oboe (AAudio)
# output that the app prefers for Live and falls back from to AudioTrack
# (see LiveAudio.kt). Oboe is built from source (the third_party/oboe
# submodule) and linked in statically, with the static C++ runtime
# (build.gradle.kts), so the app ships this one library instead of three.
#
# The mixer must round as the Kotlin one does (VoiceMixer.h), so no
# floating-point contraction. It is built optimized in debug builds too,
# since those are the test builds people play (Oboe's own build is -O3 there).
cmake_minimum_required(VERSION 3.22.1)
project(arc_live LANGUAGES CXX)

set(OBOE_DIR ${CMAKE_CURRENT_SOURCE_DIR}/../../../../third_party/oboe)
if(NOT EXISTS ${OBOE_DIR}/CMakeLists.txt)
    message(FATAL_ERROR "Oboe's source is missing at third_party/oboe: run git submodule update --init")
endif()
add_subdirectory(${OBOE_DIR} oboe)
# Oboe logs its debug and verbose lines in debug builds; the prebuilt it replaces didn't.
foreach(property COMPILE_DEFINITIONS INTERFACE_COMPILE_DEFINITIONS)
    get_target_property(definitions oboe ${property})
    list(REMOVE_ITEM definitions "$<$<CONFIG:DEBUG>:OBOE_ENABLE_LOGGING=1>")
    set_target_properties(oboe PROPERTIES ${property} "${definitions}")
endforeach()

add_library(arc_live SHARED
    NativeAudio.cpp
    LiveEngine.cpp
    LiveCore.cpp
    VoiceMixer.cpp
)

target_compile_features(arc_live PRIVATE cxx_std_17)
target_compile_options(arc_live PRIVATE -Wall -Wextra -Werror -O2 -ffp-contract=off -fno-fast-math -ffunction-sections -fdata-sections)

# Only the JNI functions are exported (exports.map); the rest, Oboe's and the
# C++ runtime's code included, stays inside, so unused parts are dropped.
target_link_options(arc_live PRIVATE
    -Wl,--gc-sections
    -Wl,--exclude-libs,ALL
    -Wl,--version-script=${CMAKE_CURRENT_SOURCE_DIR}/exports.map
)
set_property(TARGET arc_live APPEND PROPERTY LINK_DEPENDS ${CMAKE_CURRENT_SOURCE_DIR}/exports.map)

target_link_libraries(arc_live PRIVATE oboe)

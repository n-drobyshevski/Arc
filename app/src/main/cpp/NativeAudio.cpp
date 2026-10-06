// The JNI side of dev.arc.ep133.audio.NativeAudio (an addition): thin calls
// into LiveEngine and its LiveCore. A handle is a heap shared_ptr to the
// engine. Nothing here runs on the audio thread, and the audio thread never
// calls into Java: the app polls.
//
// Threads, as the Kotlin side keeps them: one producer at a time (load,
// unload, start, release, cut, stopAll), one poll thread (poll, readMix,
// timestamp, info, and finally shutdown and destroy), REC's flag from either.
#include <jni.h>

#include <memory>
#include <new>

#include "LiveEngine.h"

using arc::LiveCore;
using arc::LiveEngine;

namespace {

LiveEngine *engine(jlong handle) {
    return handle == 0 ? nullptr : reinterpret_cast<std::shared_ptr<LiveEngine> *>(handle)->get();
}

LiveCore *core(jlong handle) {
    LiveEngine *e = engine(handle);
    return e == nullptr ? nullptr : e->core();
}

// poll()'s header, before the reports.
constexpr int HEADER = 4;
constexpr int POLL_MAX = 1024;

}  // namespace

extern "C" {

JNIEXPORT jlong JNICALL Java_dev_arc_ep133_audio_NativeAudio_create(JNIEnv *, jclass) {
    auto *holder = new (std::nothrow) std::shared_ptr<LiveEngine>(std::make_shared<LiveEngine>());
    return reinterpret_cast<jlong>(holder);
}

JNIEXPORT jboolean JNICALL Java_dev_arc_ep133_audio_NativeAudio_open(JNIEnv *, jclass, jlong handle) {
    LiveEngine *e = engine(handle);
    return e != nullptr && e->open() ? JNI_TRUE : JNI_FALSE;
}

JNIEXPORT void JNICALL Java_dev_arc_ep133_audio_NativeAudio_destroy(JNIEnv *, jclass, jlong handle) {
    if (handle == 0) return;
    auto *holder = reinterpret_cast<std::shared_ptr<LiveEngine> *>(handle);
    (*holder)->shutdown();
    // The engine goes once Oboe's error thread, if one runs, lets go of it too.
    delete holder;
}

JNIEXPORT jboolean JNICALL Java_dev_arc_ep133_audio_NativeAudio_info(JNIEnv *env, jclass, jlong handle, jintArray out) {
    LiveEngine *e = engine(handle);
    int32_t info[LiveEngine::INFO_SIZE] = {};
    if (e == nullptr || env->GetArrayLength(out) < LiveEngine::INFO_SIZE || !e->info(info)) return JNI_FALSE;
    env->SetIntArrayRegion(out, 0, LiveEngine::INFO_SIZE, info);
    return JNI_TRUE;
}

JNIEXPORT jboolean JNICALL Java_dev_arc_ep133_audio_NativeAudio_load(
    JNIEnv *env, jclass, jlong handle, jint slot, jshortArray pcm, jint channels) {
    LiveCore *c = core(handle);
    if (c == nullptr || channels < 1 || channels > 2) return JNI_FALSE;
    const jsize size = env->GetArrayLength(pcm);
    const int32_t frames = size / channels;
    if (frames < 1) return JNI_FALSE;
    auto *data = new (std::nothrow) int16_t[static_cast<size_t>(frames) * channels];
    if (data == nullptr) return JNI_FALSE;
    env->GetShortArrayRegion(pcm, 0, frames * channels, data);
    auto *sample = new (std::nothrow) arc::Sample(data, frames, channels);
    if (sample == nullptr) {
        delete[] data;
        return JNI_FALSE;
    }
    if (!c->load(slot, sample)) {
        delete sample;
        return JNI_FALSE;
    }
    return JNI_TRUE;
}

JNIEXPORT jboolean JNICALL Java_dev_arc_ep133_audio_NativeAudio_unload(JNIEnv *, jclass, jlong handle, jint slot) {
    LiveCore *c = core(handle);
    return c != nullptr && c->unload(slot) ? JNI_TRUE : JNI_FALSE;
}

JNIEXPORT jboolean JNICALL Java_dev_arc_ep133_audio_NativeAudio_start(
    JNIEnv *, jclass, jlong handle, jint key, jint slot, jint sampleRate, jdouble pitch, jlong tag) {
    LiveCore *c = core(handle);
    return c != nullptr && c->start(key, slot, sampleRate, pitch, tag) ? JNI_TRUE : JNI_FALSE;
}

JNIEXPORT jboolean JNICALL Java_dev_arc_ep133_audio_NativeAudio_release(JNIEnv *, jclass, jlong handle, jint key) {
    LiveCore *c = core(handle);
    return c != nullptr && c->release(key) ? JNI_TRUE : JNI_FALSE;
}

JNIEXPORT jboolean JNICALL Java_dev_arc_ep133_audio_NativeAudio_cut(JNIEnv *, jclass, jlong handle, jint key) {
    LiveCore *c = core(handle);
    return c != nullptr && c->cut(key) ? JNI_TRUE : JNI_FALSE;
}

JNIEXPORT jboolean JNICALL Java_dev_arc_ep133_audio_NativeAudio_stopAll(JNIEnv *, jclass, jlong handle) {
    LiveCore *c = core(handle);
    return c != nullptr && c->stopAll() ? JNI_TRUE : JNI_FALSE;
}

JNIEXPORT void JNICALL Java_dev_arc_ep133_audio_NativeAudio_setRecording(JNIEnv *, jclass, jlong handle, jboolean on) {
    LiveCore *c = core(handle);
    if (c != nullptr) c->setRecording(on == JNI_TRUE);
}

JNIEXPORT jint JNICALL Java_dev_arc_ep133_audio_NativeAudio_poll(JNIEnv *env, jclass, jlong handle, jlongArray out) {
    LiveEngine *e = engine(handle);
    if (e == nullptr) return 0;
    int64_t buffer[POLL_MAX];
    const jsize length = env->GetArrayLength(out);
    const int capacity = length < POLL_MAX ? length : POLL_MAX;
    if (capacity < HEADER) return 0;
    buffer[0] = e->callbacks();
    buffer[1] = static_cast<int64_t>(e->state());
    buffer[2] = e->generation();
    LiveCore *c = e->core();
    const int n = c == nullptr ? 0 : c->poll(buffer + HEADER, capacity - HEADER);
    buffer[3] = n;
    env->SetLongArrayRegion(out, 0, HEADER + n, reinterpret_cast<const jlong *>(buffer));
    return HEADER + n;
}

JNIEXPORT jint JNICALL Java_dev_arc_ep133_audio_NativeAudio_readMix(
    JNIEnv *env, jclass, jlong handle, jshortArray out, jlongArray header) {
    LiveCore *c = core(handle);
    if (c == nullptr) return 0;
    int16_t buffer[2 * LiveCore::CHUNK];
    int64_t head[3] = {};
    const int capacity = env->GetArrayLength(out) / 2;
    const int n = c->readMix(buffer, capacity < LiveCore::CHUNK ? capacity : LiveCore::CHUNK, head);
    if (n <= 0) return n;
    env->SetShortArrayRegion(out, 0, 2 * n, buffer);
    env->SetLongArrayRegion(header, 0, 3, reinterpret_cast<const jlong *>(head));
    return n;
}

JNIEXPORT jint JNICALL Java_dev_arc_ep133_audio_NativeAudio_timestamp(JNIEnv *env, jclass, jlong handle, jlongArray out) {
    LiveEngine *e = engine(handle);
    int64_t stamp[2] = {};
    const int kind = e == nullptr ? 0 : e->timestamp(stamp);
    if (kind != 0) env->SetLongArrayRegion(out, 0, 2, reinterpret_cast<const jlong *>(stamp));
    return kind;
}

}  // extern "C"

package dev.arc.ep133.screens

import androidx.compose.runtime.Composable
import androidx.compose.ui.tooling.preview.Preview
import com.android.tools.screenshot.PreviewTest
import dev.arc.ep133.audio.LiveEngineInfo
import dev.arc.ep133.audio.LiveLatency
import dev.arc.ep133.features.LatencyStats
import dev.arc.ep133.protocol.TrafficLog
import dev.arc.ep133.text.LiveEngine
import dev.arc.ep133.ui.screens.DebugScreen
import dev.arc.ep133.ui.screens.LatencyUi
import dev.arc.ep133.ui.theme.ArcTheme

private val Native = LiveEngineInfo("AAudio exclusive (MMAP), 96-frame bursts", 48000, 96, 192)
private val Track = LiveEngineInfo("AudioTrack low-latency path, 192-frame bursts", 48000, 192, 384)
private val Old = LiveEngineInfo("AudioTrack, old, low-latency path, 192-frame bursts", 48000, 192, 576)

/** A test run: the native engine and the new AudioTrack path tapped 20 times, the old one just opened. */
private val Tried = LiveLatency.State(
    stats = LatencyStats()
        .let { s -> (0 until 20).fold(s) { acc, i -> acc.add(Native.label, 18.0 + i % 7) } }
        .let { s -> (0 until 20).fold(s) { acc, i -> acc.add(Track.label, 29.0 + i % 9 * 1.5) } },
    outputs = linkedMapOf(Native.label to Native, Track.label to Track, Old.label to Old),
    inUse = Old.label,
)

@PreviewTest
@Preview(name = "Debug", widthDp = 393, heightDp = 852, showBackground = true)
@Composable
fun DebugPreview() {
    ArcTheme(dark = false) {
        // The latency test folded away above the log.
        DebugScreen(TrafficLog(), {}, {}, {}, LatencyUi()) {}
    }
}

@PreviewTest
@Preview(name = "Debug latency", widthDp = 393, heightDp = 852, showBackground = true)
@Composable
fun DebugLatencyPreview() {
    ArcTheme(dark = false) {
        DebugScreen(TrafficLog(), {}, {}, {}, LatencyUi(Tried, LiveEngine.TRACK_OLD, open = true)) {}
    }
}

@PreviewTest
@Preview(name = "Debug latency dark", widthDp = 393, heightDp = 852, showBackground = true)
@Composable
fun DebugLatencyDarkPreview() {
    ArcTheme(dark = true) {
        DebugScreen(TrafficLog(), {}, {}, {}, LatencyUi(Tried, LiveEngine.TRACK_OLD, open = true)) {}
    }
}

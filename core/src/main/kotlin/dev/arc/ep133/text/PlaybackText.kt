package dev.arc.ep133.text

/**
 * Background play (an addition): the media notification and lock screen while Live's transport plays with arc off
 * the screen, and its controls.
 */
object PlaybackText {
    /** The notification channel, as the system's settings list it. */
    const val CHANNEL = "Playback"
    const val PLAYING = "arc is playing"
    const val STOPPED = "arc stopped"
    const val PLAY = "Play"
    const val STOP = "Stop"

    /** What plays: "S02 · 122 BPM" for the scene at index [scene], with " · chain" while the chain runs. */
    fun now(scene: Int, bpm: Int, chain: Boolean) = "${MirrorText.sceneLabel(scene)} · $bpm BPM" + if (chain) " · chain" else ""
}

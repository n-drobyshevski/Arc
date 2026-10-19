package dev.arc.ep133.features

/**
 * Where text shared to Arc (or pasted under PASTE CARD) goes: a beat card is imported, a song from a music app opens a
 * REMAKE of it, an album or a playlist is said to be no song, and anything else has no card in it.
 */
sealed interface ShareRoute {
    /** An ARC BEAT card: Claude's reply comes back, links in it or not. */
    data object Card : ShareRoute

    /** A music app's share of a song: the REMAKE's [song] ([TrackLinks.song]). */
    data class Song(val song: String) : ShareRoute

    /** An album, a playlist, an artist or a podcast shared ([TrackLinks.notSong]). */
    data object NotSong : ShareRoute

    data object None : ShareRoute

    companion object {
        /** The most lines a share may say besides its link: a pasted question to Claude that holds one is no share. */
        const val MAX_LINES = 3

        /**
         * The route of shared [text] and its [subject]. A card comes first, so a reply quoting a link is still a card;
         * a link counts only in what reads like a share, a few short lines at most ([ClaudePrompt.MAX_SONG], [MAX_LINES]),
         * so a long text holding one doesn't wipe the prompt.
         */
        fun of(text: String?, subject: String? = null): ShareRoute {
            if (text.isNullOrBlank()) return None
            if (BeatCards.hasCard(text)) return Card
            val rest = TrackLinks.rest(text)
            if (rest.length > ClaudePrompt.MAX_SONG || rest.lines().count { it.isNotBlank() } > MAX_LINES) return None
            TrackLinks.song(text, subject)?.let { return Song(it) }
            return if (TrackLinks.notSong(text)) NotSong else None
        }
    }
}

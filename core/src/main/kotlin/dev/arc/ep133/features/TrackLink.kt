package dev.arc.ep133.features

/** The music apps a song can be shared to Arc from, for a REMAKE. */
enum class TrackSource { SPOTIFY, APPLE_MUSIC, YOUTUBE_MUSIC, SOUNDCLOUD, SHAZAM }

/**
 * A song's link in a music app, [url] cleaned of its tracking (Spotify's "?si=" and the like). [short] is a short link
 * not yet followed (spotify.link, spoti.fi, link.tospotify.com, on.soundcloud.com): it doesn't say which song it is.
 */
data class TrackLink(val source: TrackSource, val url: String, val short: Boolean = false)

/**
 * Song links in shared text (a REMAKE's intake): what Spotify, Apple Music, YouTube Music, SoundCloud and Shazam put
 * in a share. Plain YouTube is no music app, and an album, a playlist or an artist is no song ([notSong]).
 */
object TrackLinks {
    /** The first song link in [text], cleaned; null when it has none. */
    fun find(text: String?): TrackLink? = text?.let(::match)?.link

    /**
     * What a REMAKE's song is from a share: "<words> <clean url>", the words being what the share says besides the link
     * (a share's own wording, "I used Shazam to discover …", taken off), else its [subject]; just the url with no words.
     * Null when [text] has no song link, or one too long for a song ([ClaudePrompt.MAX_SONG]) that couldn't go whole.
     */
    fun song(text: String?, subject: String? = null): String? {
        val m = text?.let(::match) ?: return null
        val url = m.link.url
        if (url.length >= ClaudePrompt.MAX_SONG) return null
        val words = shareWords(text.removeRange(m.range)).ifEmpty { subject?.let { shareWords(withoutLink(it)) }.orEmpty() }
        if (words.isEmpty()) return url
        return words.take(ClaudePrompt.MAX_SONG - url.length - 1).trimEnd() + " " + url
    }

    /** A song's words without its link (a REMAKE's title and artist); null when there are none. */
    fun words(song: String?): String? {
        if (song == null) return null
        return tidy(withoutLink(song)).takeIf { it.isNotEmpty() }
    }

    /** Whether [text] shares an album, a playlist, an artist or a podcast instead of a song: it has one of those links and no song's. */
    fun notSong(text: String?): Boolean = text != null && match(text) == null && NOT_SONG.any { it.containsMatchIn(text) }

    /** A source's name, as its app spells it. */
    fun label(source: TrackSource) = when (source) {
        TrackSource.SPOTIFY -> "Spotify"
        TrackSource.APPLE_MUSIC -> "Apple Music"
        TrackSource.YOUTUBE_MUSIC -> "YouTube Music"
        TrackSource.SOUNDCLOUD -> "SoundCloud"
        TrackSource.SHAZAM -> "Shazam"
    }

    /** [text] without its music link (a song's, else an album's or a playlist's), as [ShareRoute] weighs what else it says. */
    internal fun rest(text: String): String {
        val range = match(text)?.range ?: NOT_SONG.firstNotNullOfOrNull { it.find(text) }?.let { token(text, it.range.first) }
        return (range?.let { text.removeRange(it) } ?: text).trim()
    }

    /** The open.spotify.com track link in [text] (a short link's page), cleaned. */
    internal fun spotifyTrack(text: String): TrackLink? = SPOTIFY.find(text)?.let { spotify(it.groupValues[1]) }

    // A link found, and where its whole token is in the text (the tracking after it too).
    private class Match(val link: TrackLink, val range: IntRange)

    private fun withoutLink(text: String) = match(text)?.let { text.removeRange(it.range) } ?: text

    private fun match(text: String): Match? = FORMS.mapNotNull { (re, read) ->
        re.findAll(text).firstNotNullOfOrNull { m -> read(m)?.let { Match(it, token(text, m.range.first)) } }
    }.minByOrNull { it.range.first }

    // From a link's start to the next space: "?si=…" and a closing bracket go with it.
    private fun token(text: String, start: Int): IntRange {
        var end = start
        while (end < text.length && !text[end].isWhitespace()) end++
        return start until end
    }

    private fun spotify(id: String) = TrackLink(TrackSource.SPOTIFY, "https://open.spotify.com/track/$id")

    private val IC = setOf(RegexOption.IGNORE_CASE)
    private val SPOTIFY = Regex("""https?://open\.spotify\.com/(?:intl-[a-z]{2}(?:-[a-z]{2})?/)?(?:embed/)?track/([A-Za-z0-9]{22})(?![A-Za-z0-9])""", IC)

    // Each form a song link takes, and the clean link it reads as (null: the form, but not a song).
    private val FORMS: List<Pair<Regex, (MatchResult) -> TrackLink?>> = listOf(
        SPOTIFY to { m -> spotify(m.groupValues[1]) },
        Regex("""spotify:track:([A-Za-z0-9]{22})(?![A-Za-z0-9])""") to { m -> spotify(m.groupValues[1]) },
        Regex("""https?://(spotify\.link|spoti\.fi|link\.tospotify\.com)/([A-Za-z0-9_-]+)""", IC) to { m ->
            TrackLink(TrackSource.SPOTIFY, "https://${m.groupValues[1].lowercase()}/${m.groupValues[2]}", short = true)
        },
        // An album's link is a song's when its "?i=" names the track.
        Regex("""https?://(?:geo\.)?music\.apple\.com/([a-z]{2})/(album|song)/(?:([^/?#\s]+)/)?(\d+)(\?[^\s#]*)?""", IC) to { m ->
            val (cc, kind, slug, id, query) = m.destructured
            val path = "https://music.apple.com/${cc.lowercase()}/${kind.lowercase()}/" + (if (slug.isEmpty()) "" else "$slug/") + id
            if (kind.equals("song", true)) {
                TrackLink(TrackSource.APPLE_MUSIC, path)
            } else {
                Regex("""[?&]i=(\d+)""").find(query)?.let { TrackLink(TrackSource.APPLE_MUSIC, "$path?i=${it.groupValues[1]}") }
            }
        },
        Regex("""https?://music\.youtube\.com/watch\?(\S*)""", IC) to { m ->
            Regex("""(?:^|&)v=([A-Za-z0-9_-]{11})(?![A-Za-z0-9_-])""").find(m.groupValues[1])?.let { TrackLink(TrackSource.YOUTUBE_MUSIC, "https://music.youtube.com/watch?v=${it.groupValues[1]}") }
        },
        Regex("""https?://on\.soundcloud\.com/([A-Za-z0-9]+)""", IC) to { m -> TrackLink(TrackSource.SOUNDCLOUD, "https://on.soundcloud.com/${m.groupValues[1]}", short = true) },
        // A track is "artist/track", and "/s-…" after it a private one's; an artist's own pages, and SoundCloud's, are no song.
        Regex("""https?://(?:www\.|m\.)?soundcloud\.com/([A-Za-z0-9_-]+)/([A-Za-z0-9_-]+)(/s-[A-Za-z0-9]+)?(?![A-Za-z0-9_-])""", IC) to { m ->
            val (artist, track, secret) = m.destructured
            if (artist.lowercase() in SOUNDCLOUD_SITE || track.lowercase() in SOUNDCLOUD_PAGES) null else TrackLink(TrackSource.SOUNDCLOUD, "https://soundcloud.com/$artist/$track$secret")
        },
        Regex("""https?://(?:www\.)?shazam\.com/((?:[a-z]{2}(?:-[a-z]{2})?/)?(?:track|song)/[^\s?#]+)""", IC) to { m ->
            TrackLink(TrackSource.SHAZAM, "https://www.shazam.com/" + m.groupValues[1].trimEnd(*LINK_END))
        },
    )

    // SoundCloud's own pages ("search/sounds"), which read as an artist's track.
    private val SOUNDCLOUD_SITE = setOf("search", "discover", "charts", "stations", "upload", "feed", "you", "pages", "terms-of-use", "messages", "notifications", "settings")

    private val SOUNDCLOUD_PAGES = setOf("sets", "tracks", "albums", "likes", "reposts", "popular-tracks", "followers", "following", "comments", "spotlight", "you")

    // Punctuation a link in a sentence ends with, not its own.
    private val LINK_END = charArrayOf('.', ',', ';', ':', '!', ')', ']', '}', '>', '"', '\'')

    private val NOT_SONG = listOf(
        Regex("""https?://open\.spotify\.com/(?:intl-[a-z]{2}(?:-[a-z]{2})?/)?(?:album|playlist|artist|show|episode)/""", IC),
        Regex("""spotify:(?:album|playlist|artist|show|episode):"""),
        Regex("""https?://(?:geo\.)?music\.apple\.com/[a-z]{2}/(?:album|playlist|artist)/""", IC),
        Regex("""https?://music\.youtube\.com/(?:playlist|browse|channel)\b""", IC),
        Regex("""https?://(?:www\.|m\.)?soundcloud\.com/[A-Za-z0-9_-]+/(?:sets|albums)/""", IC),
    )

    // A share's own wording around the song's words: Shazam's, SoundCloud's, an older Spotify's.
    private val WRAPPERS = listOf(
        Regex("""^I used @?Shazam to discover (.+?)\.?$""", IC),
        Regex("""^Listen to (.+?) on #?SoundCloud\.?$""", IC),
        Regex("""^Check out (.+?) on Spotify\.?$""", IC),
        Regex("""^(.+?) on (?:Spotify|Apple Music|YouTube Music|SoundCloud|Shazam)\.?$""", IC),
    )

    private fun shareWords(s: String): String {
        val one = tidy(s)
        return WRAPPERS.firstNotNullOfOrNull { it.matchEntire(one)?.groupValues?.get(1) }?.let(::tidy) ?: one
    }

    // One line, without the separators a link leaves at either end.
    private fun tidy(s: String) = s.replace(Regex("\\s+"), " ").trim { it.isWhitespace() || it in " .,:;|·–—-(" }
}

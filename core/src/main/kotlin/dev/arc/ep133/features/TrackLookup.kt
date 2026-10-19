package dev.arc.ep133.features

import java.net.URLEncoder
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

/**
 * A REMAKE's LOOK UP, only on a tap: the page to ask for a song link's title ([requestUrl]), and the title read from
 * what comes back ([parse]). The app does the fetching; this is the reading, so it is tested on saved pages.
 */
object TrackLookup {
    /**
     * What to fetch for [link]: Spotify's track page (a short link's own page, then [trackPageIn]), YouTube's and
     * SoundCloud's oEmbed, the iTunes lookup of an Apple Music track. Null for Shazam, which has no open one.
     */
    fun requestUrl(link: TrackLink): String? = when (link.source) {
        TrackSource.SPOTIFY -> link.url
        TrackSource.YOUTUBE_MUSIC -> "https://www.youtube.com/oembed?url=${encode(link.url)}&format=json"
        TrackSource.SOUNDCLOUD -> "https://soundcloud.com/oembed?url=${encode(link.url)}&format=json"
        TrackSource.APPLE_MUSIC -> APPLE_ID.find(link.url)?.let { m ->
            val (cc, id, track) = m.destructured
            "https://itunes.apple.com/lookup?id=${track.ifEmpty { id }}&country=$cc"
        }
        TrackSource.SHAZAM -> null
    }

    /**
     * A short spotify.link's song: the open.spotify.com track link in where it leads (the address it ends at, then its
     * page), cleaned. The short link names no title itself.
     */
    fun trackPageIn(body: String): String? = TrackLinks.spotifyTrack(body.replace("\\/", "/"))?.url

    /** The song's "Title · Artist" (or just "Title") in [body], as [source]'s [requestUrl] answers; null when it has none. */
    fun parse(source: TrackSource, body: String): String? = when (source) {
        TrackSource.SPOTIFY -> spotify(body)
        TrackSource.YOUTUBE_MUSIC -> json(body)?.let { o ->
            // A song's channel on YouTube Music is "Artist - Topic".
            named(o.text("title"), o.text("author_name")?.removeSuffix(" - Topic"))
        }
        // SoundCloud's title is often "Title by Artist" already.
        TrackSource.SOUNDCLOUD -> json(body)?.let { o ->
            val title = o.text("title")
            if (title != null && " by " in title) title else named(title, o.text("author_name"))
        }
        TrackSource.APPLE_MUSIC -> json(body)?.let { o ->
            val track = runCatching { o["results"]?.jsonArray?.firstOrNull { (it as? JsonObject)?.text("trackName") != null }?.jsonObject }.getOrNull()
            track?.let { named(it.text("trackName"), it.text("artistName")) }
        }
        TrackSource.SHAZAM -> null
    }

    // A track page's og:title is the song; its og:description starts with the artist ("Daft Punk · Discovery · Song · 2001",
    // once "Listen to … on Spotify. Daft Punk · Song · 2000.").
    private fun spotify(body: String): String? {
        val title = meta(body, "og:title") ?: return null
        val about = meta(body, "og:description")?.let { if (it.startsWith("Listen to ") && ". " in it) it.substringAfter(". ") else it }
        return named(title, about?.substringBefore(" · ")?.takeIf { it != title })
    }

    private fun named(title: String?, artist: String?): String? {
        val t = title?.trim()?.takeIf { it.isNotEmpty() } ?: return null
        val a = artist?.trim()?.takeIf { it.isNotEmpty() } ?: return t
        return "$t · $a"
    }

    private fun meta(body: String, property: String): String? = META.findAll(body).firstNotNullOfOrNull { m ->
        val tag = m.value
        if ((attr(tag, "property") ?: attr(tag, "name")).equals(property, ignoreCase = true)) attr(tag, "content")?.let(::unescapeHtml) else null
    }

    private fun attr(tag: String, name: String): String? =
        Regex("""\s$name\s*=\s*(?:"([^"]*)"|'([^']*)')""", RegexOption.IGNORE_CASE).find(tag)?.let { it.groupValues[1].ifEmpty { it.groupValues[2] } }

    // The entities a page's attributes use: &amp; &quot; &#39; &#x27; and the rest of the numbered ones.
    private fun unescapeHtml(s: String): String = ENTITY.replace(s) { m ->
        when (val e = m.groupValues[1]) {
            "amp" -> "&"
            "quot" -> "\""
            "apos" -> "'"
            "lt" -> "<"
            "gt" -> ">"
            "nbsp" -> " "
            else -> {
                val code = if (e.startsWith("#x", ignoreCase = true)) e.substring(2).toIntOrNull(16) else e.substring(1).toIntOrNull()
                code?.takeIf { Character.isValidCodePoint(it) }?.let { String(Character.toChars(it)) } ?: m.value
            }
        }
    }

    private fun json(body: String): JsonObject? = runCatching { Json.parseToJsonElement(body).jsonObject }.getOrNull()

    private fun JsonObject.text(key: String): String? = runCatching { this[key]?.jsonPrimitive?.contentOrNull }.getOrNull()

    // The String charset form: the Charset one is newer than the app's Android.
    private fun encode(url: String) = URLEncoder.encode(url, "UTF-8")

    // An Apple Music link's store, its album or song id, and the track's "?i=".
    private val APPLE_ID = Regex("""music\.apple\.com/([a-z]{2})/(?:album|song)/(?:[^/?#\s]+/)?(\d+)(?:\?i=(\d+))?""")
    private val META = Regex("""<meta\b[^>]*>""", RegexOption.IGNORE_CASE)
    private val ENTITY = Regex("""&(amp|quot|apos|lt|gt|nbsp|#[0-9]+|#[xX][0-9a-fA-F]+);""")
}

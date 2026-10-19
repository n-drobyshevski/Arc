package dev.arc.ep133.features

import org.junit.jupiter.api.Test
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull

class TrackLookupTest {
    @Test
    fun `each app's link asks its own page`() {
        fun url(link: String) = TrackLookup.requestUrl(TrackLinks.find(link)!!)
        assertEquals("https://open.spotify.com/track/0DiWol3AO6WpXZgp0goxAV", url("https://open.spotify.com/track/0DiWol3AO6WpXZgp0goxAV?si=1"))
        assertEquals("https://spotify.link/AbC123", url("https://spotify.link/AbC123?si=1"))
        assertEquals(
            "https://www.youtube.com/oembed?url=https%3A%2F%2Fmusic.youtube.com%2Fwatch%3Fv%3DFGBhQbmPwH8&format=json",
            url("https://music.youtube.com/watch?v=FGBhQbmPwH8&si=1"),
        )
        assertEquals("https://soundcloud.com/oembed?url=https%3A%2F%2Fsoundcloud.com%2Fdaftpunk%2Fone-more-time&format=json", url("https://soundcloud.com/daftpunk/one-more-time"))
        assertEquals("https://itunes.apple.com/lookup?id=697195462&country=us", url("https://music.apple.com/us/album/one-more-time/697194953?i=697195462"))
        assertEquals("https://itunes.apple.com/lookup?id=697195462&country=gb", url("https://music.apple.com/gb/song/one-more-time/697195462"))
        assertNull(url("https://www.shazam.com/track/20066955/one-more-time"))
    }

    @Test
    fun `a spotify track page names the song and its artist`() {
        // Trimmed from open.spotify.com/track/… as fetched.
        val page = """<!DOCTYPE html><html><head><meta charset="utf-8"/><title>One More Time - song and lyrics by Daft Punk | Spotify</title>""" +
            """<meta property="og:site_name" content="Spotify"/><meta property="og:title" content="One More Time"/>""" +
            """<meta property="og:description" content="Daft Punk · Discovery · Song · 2001"/><meta property="og:url" content="https://open.spotify.com/track/0DiWol3AO6WpXZgp0goxAV"/></head></html>"""
        assertEquals("One More Time · Daft Punk", TrackLookup.parse(TrackSource.SPOTIFY, page))
        val older = """<meta content="Don&#x27;t Stop &amp; &quot;Go&quot;" property="og:title"><meta name="og:description" content="Listen to Don&#39;t Stop on Spotify. Ty &amp; Co · Song · 2019.">"""
        assertEquals("Don't Stop & \"Go\" · Ty & Co", TrackLookup.parse(TrackSource.SPOTIFY, older))
        assertEquals("Solo", TrackLookup.parse(TrackSource.SPOTIFY, """<meta property="og:title" content="Solo">"""))
        assertNull(TrackLookup.parse(TrackSource.SPOTIFY, "<html>Page not found</html>"))
    }

    @Test
    fun `a short spotify link's page leads to its track page`() {
        // Trimmed from a spotify.link page: an app-link page that sends the browser on.
        val page = """<html><head><meta property="al:android:url" content="spotify://track/0DiWol3AO6WpXZgp0goxAV"/>""" +
            """<script>var data = {"desktop_url":"https:\/\/open.spotify.com\/track\/0DiWol3AO6WpXZgp0goxAV?si=abc&_branch_match_id=1"};</script></head></html>"""
        assertEquals("https://open.spotify.com/track/0DiWol3AO6WpXZgp0goxAV", TrackLookup.trackPageIn(page))
        assertEquals("https://open.spotify.com/track/0DiWol3AO6WpXZgp0goxAV", TrackLookup.trackPageIn("""<a href="https://open.spotify.com/intl-de/track/0DiWol3AO6WpXZgp0goxAV?si=1">Open</a>"""))
        assertNull(TrackLookup.trackPageIn("<html>nothing</html>"))
        // Where the short link ended, then a page that only hands the track to the app.
        val landed = "https://open.spotify.com/track/0DiWol3AO6WpXZgp0goxAV?si=1&nd=1\n<html><script id=\"urlSchemeConfig\">eyJ1cmxTY2hlbWUiOiJzcG90aWZ5</script></html>"
        assertEquals("https://open.spotify.com/track/0DiWol3AO6WpXZgp0goxAV", TrackLookup.trackPageIn(landed))
    }

    @Test
    fun `oembed and the itunes lookup name the song`() {
        val youtube = """{"title":"One More Time","author_name":"Daft Punk - Topic","author_url":"https://www.youtube.com/channel/UC","type":"video","height":113,"width":200,"version":"1.0","provider_name":"YouTube"}"""
        assertEquals("One More Time · Daft Punk", TrackLookup.parse(TrackSource.YOUTUBE_MUSIC, youtube))
        val soundcloud = """{"version":1.0,"type":"rich","provider_name":"SoundCloud","height":400,"width":"100%","title":"One More Time by Daft Punk","description":null,"author_name":"Daft Punk","author_url":"https://soundcloud.com/daftpunk"}"""
        assertEquals("One More Time by Daft Punk", TrackLookup.parse(TrackSource.SOUNDCLOUD, soundcloud))
        assertEquals("Demo · Someone", TrackLookup.parse(TrackSource.SOUNDCLOUD, """{"title":"Demo","author_name":"Someone"}"""))
        val itunes = """{"resultCount":1,"results":[{"wrapperType":"track","kind":"song","artistId":5468295,"collectionId":697194953,"trackId":697195462,"artistName":"Daft Punk","collectionName":"Discovery","trackName":"One More Time","trackTimeMillis":320357}]}"""
        assertEquals("One More Time · Daft Punk", TrackLookup.parse(TrackSource.APPLE_MUSIC, itunes))
        assertNull(TrackLookup.parse(TrackSource.APPLE_MUSIC, """{"resultCount":0,"results":[]}"""))
        assertNull(TrackLookup.parse(TrackSource.YOUTUBE_MUSIC, "<html>Bad request</html>"))
        assertNull(TrackLookup.parse(TrackSource.SHAZAM, youtube))
    }
}

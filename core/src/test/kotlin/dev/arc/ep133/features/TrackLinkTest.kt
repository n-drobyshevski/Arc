package dev.arc.ep133.features

import org.junit.jupiter.api.Test
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue

class TrackLinkTest {
    private val track = "https://open.spotify.com/track/0DiWol3AO6WpXZgp0goxAV"

    @Test
    fun `every music app's song link is found, cleaned of its tracking`() {
        val spotify = TrackLink(TrackSource.SPOTIFY, track)
        assertEquals(spotify, TrackLinks.find("$track?si=a1b2c3d4e5f6&utm_source=copy-link"))
        assertEquals(spotify, TrackLinks.find("https://open.spotify.com/intl-de/track/0DiWol3AO6WpXZgp0goxAV?si=x"))
        assertEquals(spotify, TrackLinks.find("http://open.spotify.com/embed/track/0DiWol3AO6WpXZgp0goxAV"))
        assertEquals(spotify, TrackLinks.find("spotify:track:0DiWol3AO6WpXZgp0goxAV"))
        assertEquals(TrackLink(TrackSource.SPOTIFY, "https://spotify.link/AbC123xyz", short = true), TrackLinks.find("https://spotify.link/AbC123xyz?si=q"))
        assertEquals(TrackLink(TrackSource.SPOTIFY, "https://spoti.fi/3xYz", short = true), TrackLinks.find("listen: https://spoti.fi/3xYz"))
        assertEquals(TrackLink(TrackSource.SPOTIFY, "https://link.tospotify.com/Q9w", short = true), TrackLinks.find("https://link.tospotify.com/Q9w"))
        assertEquals(
            TrackLink(TrackSource.APPLE_MUSIC, "https://music.apple.com/us/album/one-more-time/697194953?i=697195462"),
            TrackLinks.find("https://music.apple.com/us/album/one-more-time/697194953?ls=1&i=697195462&uo=4"),
        )
        assertEquals(TrackLink(TrackSource.APPLE_MUSIC, "https://music.apple.com/gb/song/one-more-time/697195462"), TrackLinks.find("https://music.apple.com/gb/song/one-more-time/697195462?ls"))
        assertEquals(TrackLink(TrackSource.YOUTUBE_MUSIC, "https://music.youtube.com/watch?v=FGBhQbmPwH8"), TrackLinks.find("https://music.youtube.com/watch?v=FGBhQbmPwH8&si=abc&feature=share"))
        assertEquals(TrackLink(TrackSource.YOUTUBE_MUSIC, "https://music.youtube.com/watch?v=FGBhQbmPwH8"), TrackLinks.find("https://music.youtube.com/watch?list=RD1&v=FGBhQbmPwH8"))
        assertEquals(TrackLink(TrackSource.SOUNDCLOUD, "https://soundcloud.com/daftpunk/one-more-time"), TrackLinks.find("https://m.soundcloud.com/daftpunk/one-more-time?utm_source=clipboard&si=1"))
        assertEquals(TrackLink(TrackSource.SOUNDCLOUD, "https://soundcloud.com/artist/demo/s-AbCd1"), TrackLinks.find("https://soundcloud.com/artist/demo/s-AbCd1?si=2"))
        assertEquals(TrackLink(TrackSource.SOUNDCLOUD, "https://on.soundcloud.com/x7Yz9", short = true), TrackLinks.find("https://on.soundcloud.com/x7Yz9"))
        assertEquals(TrackLink(TrackSource.SHAZAM, "https://www.shazam.com/track/20066955/one-more-time"), TrackLinks.find("(https://www.shazam.com/track/20066955/one-more-time?referrer=share)."))
        assertEquals(TrackLink(TrackSource.SHAZAM, "https://www.shazam.com/en-us/song/1440833110/one-more-time"), TrackLinks.find("https://shazam.com/en-us/song/1440833110/one-more-time"))
        // The first song in the text.
        assertEquals(TrackSource.SHAZAM, TrackLinks.find("https://www.shazam.com/track/1/a then $track")?.source)
    }

    @Test
    fun `plain YouTube, albums, playlists and artists are no song`() {
        for (text in listOf(
            "https://www.youtube.com/watch?v=FGBhQbmPwH8", "https://youtu.be/FGBhQbmPwH8", "https://open.spotify.com/album/2noRn2Aes5aoNVsU6iWThc",
            "https://music.apple.com/us/album/discovery/697194953", "https://soundcloud.com/daftpunk", "https://soundcloud.com/daftpunk/sets/discovery",
            "https://music.youtube.com/playlist?list=PL1", "https://open.spotify.com/track/short", "https://soundcloud.com/search/sounds?q=x",
            "https://soundcloud.com/discover/sets/new-for-you", "just words", "",
        )) {
            assertNull(TrackLinks.find(text), text)
            assertNull(TrackLinks.song(text), text)
        }
        assertNull(TrackLinks.find(null))
        for (text in listOf(
            "https://open.spotify.com/album/2noRn2Aes5aoNVsU6iWThc?si=1", "https://open.spotify.com/intl-fr/playlist/37i9dQZF1DXcBWIGoYBM5M",
            "https://open.spotify.com/artist/4tZwfgrHOc3mvqYlEYSvVi", "spotify:show:abc", "https://music.apple.com/us/album/discovery/697194953",
            "https://music.apple.com/us/playlist/x/pl.123", "https://music.youtube.com/playlist?list=OLAK5uy",
            "https://music.youtube.com/browse/MPREb_abc", "https://soundcloud.com/daftpunk/sets/discovery?si=1", "https://soundcloud.com/daftpunk/albums/x",
        )) assertTrue(TrackLinks.notSong(text), text)
        assertFalse(TrackLinks.notSong("https://music.apple.com/us/album/discovery/697194953?i=697195462"))
        assertFalse(TrackLinks.notSong("an album https://open.spotify.com/album/2noRn2Aes5aoNVsU6iWThc and its song $track"))
        assertFalse(TrackLinks.notSong(null))
    }

    @Test
    fun `a share's song is its words and its clean link, a share's own wording taken off`() {
        assertEquals(track, TrackLinks.song("$track?si=a1b2"))
        assertEquals("One More Time · Daft Punk $track", TrackLinks.song("$track?si=a1b2", "One More Time · Daft Punk"))
        assertEquals("Daft Punk – One More Time $track", TrackLinks.song("Daft Punk – One More Time\n$track?si=a1b2", "ignored"))
        assertEquals(
            "One More Time by Daft Punk https://www.shazam.com/track/20066955/one-more-time",
            TrackLinks.song("I used Shazam to discover One More Time by Daft Punk. https://www.shazam.com/track/20066955/one-more-time?referrer=share"),
        )
        assertEquals("One More Time by Daft Punk https://on.soundcloud.com/x7Yz9", TrackLinks.song("Listen to One More Time by Daft Punk on #SoundCloud\nhttps://on.soundcloud.com/x7Yz9"))
        assertEquals("Listen to the Music https://music.youtube.com/watch?v=FGBhQbmPwH8", TrackLinks.song("Listen to the Music https://music.youtube.com/watch?v=FGBhQbmPwH8"))
        assertEquals("One More Time $track", TrackLinks.song("Check out One More Time on Spotify: $track"))
        // A subject that is only the link again is no words.
        assertEquals(track, TrackLinks.song(track, "$track?si=1"))
        assertEquals(ClaudePrompt.MAX_SONG, TrackLinks.song("x".repeat(500) + " " + track)!!.length)
        // A link too long to go whole is no song.
        assertNull(TrackLinks.song("Song by X https://soundcloud.com/x/" + "a".repeat(320)))
        assertNull(TrackLinks.song("https://www.shazam.com/track/1/" + "a".repeat(320), "One More Time"))
    }

    @Test
    fun `a song's words are what it says without its link`() {
        assertEquals("One More Time · Daft Punk", TrackLinks.words("One More Time · Daft Punk $track"))
        assertEquals("Windowlicker", TrackLinks.words("Windowlicker"))
        assertNull(TrackLinks.words(track))
        assertNull(TrackLinks.words("  "))
        assertNull(TrackLinks.words(null))
        assertEquals(listOf("Spotify", "Apple Music", "YouTube Music", "SoundCloud", "Shazam"), TrackSource.entries.map(TrackLinks::label))
    }
}

package dev.arc.ep133.features

import org.junit.jupiter.api.Test
import org.junit.jupiter.api.Assertions.assertEquals

class ShareRouteTest {
    private val track = "https://open.spotify.com/track/0DiWol3AO6WpXZgp0goxAV"

    @Test
    fun `a card comes first, a link in it or not`() {
        assertEquals(ShareRoute.Card, ShareRoute.of("Here's your remake of $track\n\n```\nARC BEAT 1\ntempo 122\n```\n"))
        assertEquals(ShareRoute.Card, ShareRoute.of("ARC BEAT 1\n"))
    }

    @Test
    fun `a song shared opens a remake of it, an album says it is none`() {
        assertEquals(ShareRoute.Song(track), ShareRoute.of("$track?si=a1b2"))
        assertEquals(ShareRoute.Song("One More Time $track"), ShareRoute.of("$track?si=a1b2", "One More Time"))
        assertEquals(
            ShareRoute.Song("One More Time by Daft Punk https://on.soundcloud.com/x7Yz9"),
            ShareRoute.of("Listen to One More Time by Daft Punk on #SoundCloud\nhttps://on.soundcloud.com/x7Yz9"),
        )
        assertEquals(ShareRoute.NotSong, ShareRoute.of("https://open.spotify.com/album/2noRn2Aes5aoNVsU6iWThc?si=1"))
        assertEquals(ShareRoute.NotSong, ShareRoute.of("https://music.apple.com/us/album/discovery/697194953"))
        assertEquals(ShareRoute.NotSong, ShareRoute.of("https://music.youtube.com/playlist?list=OLAK5uy"))
        assertEquals(ShareRoute.NotSong, ShareRoute.of("https://soundcloud.com/user/sets/foo"))
        assertEquals(ShareRoute.None, ShareRoute.of("https://www.shazam.com/track/1/" + "a".repeat(320), "One More Time"))
    }

    @Test
    fun `a long text holding a link is no share, and no song`() {
        val question = (1..6).joinToString("\n") { "Line $it of my question about this song." } + "\n$track"
        assertEquals(ShareRoute.None, ShareRoute.of(question))
        assertEquals(ShareRoute.None, ShareRoute.of("x".repeat(ClaudePrompt.MAX_SONG + 1) + " $track"))
        assertEquals(ShareRoute.None, ShareRoute.of((1..6).joinToString("\n") { "Line $it" } + "\nhttps://open.spotify.com/album/2noRn2Aes5aoNVsU6iWThc"))
        assertEquals(ShareRoute.None, ShareRoute.of("No card here"))
        assertEquals(ShareRoute.None, ShareRoute.of("https://www.youtube.com/watch?v=FGBhQbmPwH8"))
        assertEquals(ShareRoute.None, ShareRoute.of(""))
        assertEquals(ShareRoute.None, ShareRoute.of(null))
    }
}

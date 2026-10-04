package dev.arc.ep133

import dev.arc.ep133.testing.Fixtures
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test
import java.security.MessageDigest

class FixturesTest {
    @Test
    fun `reference sample pak is present and unchanged`() {
        val bytes = Fixtures.samplePak()
        assertEquals(290148, bytes.size)
        val sha = MessageDigest.getInstance("SHA-256").digest(bytes).joinToString("") { "%02x".format(it) }
        assertEquals("f69ba21fed89d495be92f52ff60cec0ba62d1a34be93323167b26183767f7e37", sha)
    }
}

package dev.arc.ep133

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test
import java.io.File
import java.util.Properties

class VersionTest {
    @Test
    fun `the pak author version is the one in version properties`() {
        val file = File(System.getProperty("arc.versionFile"))
        val version = Properties().apply { file.inputStream().use { load(it) } }.getProperty("version").trim()
        assertEquals(version, Arc.APP_VERSION)
        assertEquals("arc $version", dev.arc.ep133.backup.Backup.APP_NAME + " " + dev.arc.ep133.backup.Backup.APP_VERSION)
    }
}

package dev.arc.ep133.testing

import java.io.File

/** Files from the read-only web reference in reference/. */
object Fixtures {
    val referenceDir: File by lazy {
        val path = System.getProperty("arc.referenceDir")
            ?: error("arc.referenceDir is not set; run the tests through Gradle")
        File(path)
    }

    fun samplePakFile(): File {
        val f = File(referenceDir, "test/fixtures/sample.pak")
        check(f.isFile) { "reference/test/fixtures/sample.pak not found (read-only spec expected at ${f.absolutePath})" }
        return f
    }

    fun samplePak(): ByteArray = samplePakFile().readBytes()
}

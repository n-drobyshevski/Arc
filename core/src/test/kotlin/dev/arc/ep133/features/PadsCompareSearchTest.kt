package dev.arc.ep133.features

import dev.arc.ep133.backup.Pak
import dev.arc.ep133.backup.PakSound
import dev.arc.ep133.backup.Paks
import dev.arc.ep133.formats.JsJson
import dev.arc.ep133.formats.Tar
import dev.arc.ep133.formats.Wav
import dev.arc.ep133.testing.Fixtures
import dev.arc.ep133.testing.noise
import dev.arc.ep133.testing.pad
import dev.arc.ep133.testing.s16
import dev.arc.ep133.testing.tarFile
import dev.arc.ep133.text.BackupDevice
import dev.arc.ep133.text.BackupRecord
import dev.arc.ep133.text.FeatureText
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class PadsCompareSearchTest {
    // ---------- pads ----------

    @Test
    fun `pads agree with the slots a project uses`() {
        val pak = Paks.open(Fixtures.samplePak())
        for ((n, tar) in pak.projects) {
            val groups = ProjectPads.read(tar)
            assertTrue(groups.isNotEmpty(), "project $n")
            assertEquals(Tar.slotsUsedByProject(tar), groups.flatMap { it.pads.values }.filterNotNull().distinct().sorted(), "project $n")
        }
        // P01 of the fixture: a1, b2, c3, d4 and a5 hold slots 1..5.
        val p1 = ProjectPads.read(pak.projects.getValue(1))
        assertEquals(listOf("a", "b", "c", "d"), p1.map { it.name })
        assertEquals(mapOf(1 to 1, 5 to 5), p1[0].pads)
        assertEquals(mapOf(4 to 4), p1[3].pads)
    }

    @Test
    fun `pads follow the same matching rules as the slot list`() {
        val t = tarFile(
            listOf(
                "./pads/a/p01" to pad(5), "pads/b/p12" to pad(1000), "x/pads/c/p3" to pad(300), "pads/p04" to pad(7),
                "pads/a/p05x" to pad(8), "PADS/a/p06" to pad(9), "pads/a/p07" to byteArrayOf(0, 1), "pads/d/p02" to pad(0),
                "pads/zz/p01" to pad(44), "pads/a/p99999999999" to pad(6),
            ),
        )
        val groups = ProjectPads.read(t)
        // a-d first, others after; slot 1000 and 0 are empty pads; short records and odd names are skipped.
        assertEquals(listOf("a", "b", "c", "d", "zz"), groups.map { it.name })
        assertEquals(mapOf(1 to 5), groups[0].pads)
        assertEquals(mapOf(12 to null), groups[1].pads)
        assertEquals(mapOf(3 to 300), groups[2].pads)
        assertEquals(mapOf(2 to null), groups[3].pads)
        assertEquals(mapOf(1 to 44), groups[4].pads)
        assertEquals(emptyList<PadGroup>(), ProjectPads.read(ByteArray(0)))
    }

    // ---------- compare ----------

    private fun wav(vararg samples: Int, rate: Int = 46875) = Wav.encode(s16(*samples), 1, rate)

    private fun settings(json: String) = JsJson.parse(json) as JsonObject

    private fun pak(sounds: List<PakSound>, projects: Map<Int, ByteArray> = emptyMap()) =
        Pak(JsonObject(emptyMap()), JsonObject(emptyMap()), LinkedHashMap(sounds.associateBy { it.slot }), LinkedHashMap(projects))

    private fun snd(slot: Int, name: String, wav: ByteArray, settings: JsonElement? = null) = PakSound(slot, name, wav, settings)

    @Test
    fun `sounds added, removed and changed`() {
        val old = pak(
            listOf(
                snd(1, "kick", wav(1, 2, 3), settings("""{"sound.pitch":0}""")),
                snd(2, "snare", wav(4, 5)),
                snd(3, "hat", wav(6)),
                snd(4, "tom", wav(7), settings("""{"sound.pitch":0,"sound.amplitude":100}""")),
            ),
        )
        val new = pak(
            listOf(
                snd(1, "kick", wav(1, 2, 3), settings("""{"sound.pitch":0}""")),
                snd(2, "snare 2", wav(4, 9)),
                snd(4, "tom", wav(7), settings("""{"sound.pitch":2,"sound.amplitude":100.0}""")),
                snd(5, "clap", wav(8)),
            ),
        )
        val r = PakCompare.compare(old, new)
        assertEquals(1, r.sameSounds)
        assertEquals(
            listOf(
                SoundChange(2, ChangeKind.CHANGED, "snare", "snare 2", audioChanged = true, renamed = true),
                SoundChange(3, ChangeKind.REMOVED, "hat", null),
                // 100 and 100.0 are the same number; only the pitch differs.
                SoundChange(4, ChangeKind.CHANGED, "tom", "tom", settingsChanged = listOf("sound.pitch")),
                SoundChange(5, ChangeKind.ADDED, null, "clap"),
            ),
            r.sounds,
        )
        assertEquals("Renamed from snare; audio changed", FeatureText.soundChange(r.sounds[0]))
        assertEquals("Settings changed: Pitch", FeatureText.soundChange(r.sounds[2]))
    }

    @Test
    fun `the same audio in another header is the same, and missing settings are not a change`() {
        val plain = wav(1, -1, 2)
        // The same PCM with an extra LIST chunk before the data, as other tools write it.
        val list = "LIST".toByteArray() + byteArrayOf(4, 0, 0, 0) + "INFO".toByteArray()
        val withList = plain.copyOfRange(0, 36) + list + plain.copyOfRange(36, plain.size)
        val riffSize = withList.size - 8
        for (i in 0..3) withList[4 + i] = (riffSize shr (8 * i)).toByte()
        assertTrue(!withList.contentEquals(plain))
        val old = pak(listOf(snd(1, "a", plain, settings("""{"sound.pitch":3}"""))))
        val new = pak(listOf(snd(1, "a", withList, null)))
        val r = PakCompare.compare(old, new)
        assertTrue(r.nothingChanged, r.toString())
        assertEquals(1, r.sameSounds)
        // An unreadable WAV falls back to its bytes.
        val broken = pak(listOf(snd(1, "a", noise(40))))
        assertEquals(ChangeKind.CHANGED, PakCompare.compare(old, broken).sounds.single().kind)
        assertTrue(PakCompare.compare(broken, broken).nothingChanged)
    }

    @Test
    fun `projects with pad changes`() {
        val p1 = tarFile(listOf("pads/a/p01" to pad(1), "pads/a/p02" to pad(2), "settings" to noise(10)))
        val p1b = tarFile(listOf("pads/a/p01" to pad(5), "pads/b/p03" to pad(2), "settings" to noise(10)))
        val p2 = tarFile(listOf("pads/a/p01" to pad(1), "settings" to noise(10)))
        val p2b = tarFile(listOf("pads/a/p01" to pad(1), "settings" to noise(12)))
        val old = pak(
            listOf(snd(1, "kick", wav(1)), snd(2, "snare", wav(2))),
            mapOf(1 to p1, 2 to p2, 3 to p2, 4 to p2),
        )
        val new = pak(
            listOf(snd(1, "kick", wav(1)), snd(2, "snare", wav(2)), snd(5, "clap", wav(3))),
            mapOf(1 to p1b, 2 to p2b, 3 to p2, 9 to p2),
        )
        val r = PakCompare.compare(old, new)
        assertEquals(1, r.sameProjects)
        assertEquals(
            listOf(
                ProjectChange(
                    1, ChangeKind.CHANGED,
                    listOf(PadChange("a", 1, 1, 5), PadChange("a", 2, 2, null), PadChange("b", 3, null, 2)),
                ),
                ProjectChange(2, ChangeKind.CHANGED),
                ProjectChange(4, ChangeKind.REMOVED),
                ProjectChange(9, ChangeKind.ADDED),
            ),
            r.projects,
        )
        assertEquals("Pad A1: 001 kick, now 005 clap", FeatureText.padChange(r.projects[0].padChanges[0], "kick", "clap"))
        assertEquals("Pad A2: 002 snare, now empty", FeatureText.padChange(r.projects[0].padChanges[1], "snare", null))
        assertEquals("Pad B3: empty, now 002", FeatureText.padChange(r.projects[0].padChanges[2], null, null))
    }

    @Test
    fun `comparing the fixture with itself changes nothing`() {
        val pak = Paks.open(Fixtures.samplePak())
        val r = PakCompare.compare(pak, Paks.open(Fixtures.samplePak()))
        assertTrue(r.nothingChanged)
        assertEquals(pak.sounds.size, r.sameSounds)
        assertEquals(pak.projects.size, r.sameProjects)
    }

    // ---------- search ----------

    private fun record(id: String) = BackupRecord(
        id, "Backup $id", "", 0L, "device", null, BackupDevice("EP-133", "", "", ""),
        0, 0, emptyList(), emptyList(), emptyMap(), 0L,
    )

    @Test
    fun `search matches every word, ignoring case, grouped by backup`() {
        val backups = listOf(record("b"), record("a"), record("c"))
        val entries = listOf(
            NameEntry("a", 5, "Kick Hard"),
            NameEntry("a", 2, "kick soft"),
            NameEntry("b", 9, "big KICK"),
            NameEntry("c", 1, "snare"),
            NameEntry("gone", 1, "kick"),
        )
        val r = LibrarySearch.search(entries, backups, "  KICK ")
        // Library order (b before a), slots sorted, rows of deleted backups ignored.
        assertEquals(listOf("b", "a"), r.map { it.backup.id })
        assertEquals(listOf(SearchHit(2, "kick soft"), SearchHit(5, "Kick Hard")), r[1].hits)
        assertEquals(listOf(SearchHit(5, "Kick Hard")), LibrarySearch.search(entries, backups, "hard kick").single().hits)
        assertEquals(emptyList<SearchGroup>(), LibrarySearch.search(entries, backups, " "))
        assertEquals(emptyList<SearchGroup>(), LibrarySearch.search(entries, backups, "clap"))
    }

    @Test
    fun `pad, search and compare text`() {
        assertEquals("Group A", FeatureText.group("a"))
        assertEquals("Group zz", FeatureText.group("zz"))
        assertEquals("Project 3 pads", FeatureText.padsTitle(3))
        assertEquals("1 match", FeatureText.matches(1))
        assertEquals("3 matches", FeatureText.matches(3))
        assertEquals("Unchanged: 1 sound and 2 projects.", FeatureText.unchanged(1, 2))
        assertEquals("Unchanged: 4 sounds.", FeatureText.unchanged(4, 0))
        assertEquals("", FeatureText.unchanged(0, 0))
        assertEquals("From A (1 Oct) to B (3 Oct)", FeatureText.compareHeader("A", "1 Oct", "B", "3 Oct"))
        assertEquals(
            "Audio changed; settings changed: Pitch, Volume",
            FeatureText.soundChange(SoundChange(1, ChangeKind.CHANGED, "a", "a", audioChanged = true, settingsChanged = listOf("sound.pitch", "sound.amplitude"))),
        )
    }
}

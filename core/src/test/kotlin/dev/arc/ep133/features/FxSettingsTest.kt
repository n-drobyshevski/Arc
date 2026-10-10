package dev.arc.ep133.features

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Test

class FxSettingsTest {
    private val busy = FxSettings(
        type = FxType.DELAY,
        x = 0.25f,
        y = 0.75f,
        sends = listOf(0.5f, 0f, 1f, 0.25f),
        comp = Comp(true, 0.5f, 1f),
        sidechain = Sidechain(true, group = 2, pad = 5, dests = 0b0011, x = 0.5f, y = 0.25f),
    )

    @Test
    fun `the defaults are no effect, no sends, nothing on`() {
        val d = FxSettings.DEFAULT
        assertEquals(FxType.NONE, d.type)
        assertEquals(0.5f, d.x)
        assertEquals(0.5f, d.y)
        assertEquals(listOf(0f, 0f, 0f, 0f), d.sends)
        assertEquals(Comp(false, 0.5f, 0.5f), d.comp)
        assertEquals(Sidechain(false, 0, 0, 0, 0.3f, 0.5f), d.sidechain)
        // The ordinal is the mixer's control index.
        assertEquals(
            listOf("NONE", "DELAY", "REVERB", "DISTORTION", "CHORUS", "FILTER", "COMPRESSOR"),
            FxType.entries.map { it.name },
        )
        assertEquals(6, FxType.COMPRESSOR.ordinal)
    }

    @Test
    fun `clamped holds every knob, send and index in range`() {
        val wild = FxSettings(
            x = Float.NaN,
            y = 1.5f,
            sends = listOf(-1f, 2f),
            comp = Comp(true, -0.5f, 3f),
            sidechain = Sidechain(true, group = 9, pad = -1, dests = 0xff, x = 2f, y = -2f),
        )
        assertEquals(
            FxSettings(
                x = 0f,
                y = 1f,
                sends = listOf(0f, 1f, 0f, 0f),
                comp = Comp(true, 0f, 1f),
                sidechain = Sidechain(true, group = 3, pad = 0, dests = 0xf, x = 1f, y = 0f),
            ),
            wild.clamped(),
        )
        assertEquals(FxSettings.DEFAULT, FxSettings.DEFAULT.clamped())
        // -0 reads as 0.
        assertEquals(0f.toRawBits(), FxSettings(x = -0f).clamped().x.toRawBits())
    }

    @Test
    fun `the with functions change one thing`() {
        val s = FxSettings.DEFAULT.withType(FxType.REVERB).withXY(0.2f, 1.4f).withSend(2, 0.6f).withSend(0, -1f)
        assertEquals(FxType.REVERB, s.type)
        assertEquals(0.2f, s.x)
        assertEquals(1f, s.y)
        assertEquals(listOf(0f, 0f, 0.6f, 0f), s.sends)
        assertEquals(Comp(true), s.withComp(Comp(true)).comp)
        assertEquals(Sidechain(true, dests = 1), s.withSidechain(Sidechain(true, dests = 1)).sidechain)
    }

    @Test
    fun `each effect's knobs have their names`() {
        assertEquals(
            listOf("", "LENGTH", "SIZE", "DRIVE", "RATE", "CUTOFF", "DRIVE"),
            FxType.entries.map { FxSettings.xLabel(it) },
        )
        assertEquals(
            listOf("", "FEEDBACK", "COLOR", "COLOR", "FEEDBACK", "RESO", "SPEED"),
            FxType.entries.map { FxSettings.yLabel(it) },
        )
    }

    @Test
    fun `readouts say what the knobs do`() {
        fun x(type: FxType, vararg pairs: Pair<Float, String>) {
            for ((k, want) in pairs) assertEquals(want, FxSettings.xReadout(type, k, 120f), "$type x $k")
        }
        fun y(type: FxType, vararg pairs: Pair<Float, String>) {
            for ((k, want) in pairs) assertEquals(want, FxSettings.yReadout(type, k), "$type y $k")
        }
        x(FxType.NONE, 0.5f to "")
        y(FxType.NONE, 0.5f to "")
        x(FxType.DELAY, 0f to "1/32", 0.1f to "1/16T", 0.5f to "1/4T", 0.65f to "1/8D", 0.999f to "1/2", 1f to "1/2", 2f to "1/2")
        y(FxType.DELAY, 0f to "0%", 0.2f to "19%", 1f to "95%")
        x(FxType.REVERB, 0f to "0%", 0.64f to "64%", 1f to "100%")
        y(FxType.REVERB, 0f to "DARK 100", 0.3f to "DARK 40", 0.5f to "FLAT", 0.6f to "BRIGHT 20", 1f to "BRIGHT 100")
        x(FxType.DISTORTION, 0f to "1.0x", 0.25f to "3.4x", 0.5f to "11x", 1f to "40x")
        y(FxType.DISTORTION, 0f to "LP 100", 0.5f to "OPEN", 0.75f to "HP 50")
        x(FxType.CHORUS, 0f to "0.05 Hz", 0.5f to "0.67 Hz", 1f to "5.00 Hz")
        y(FxType.CHORUS, 0f to "0%", 1f to "70%")
        x(
            FxType.FILTER,
            0f to "LPF 60", 0.1f to "LPF 252", 0.2f to "LPF 1.6k", 0.4f to "LPF 12k",
            0.47f to "OPEN", 0.5f to "OPEN", 0.53f to "OPEN",
            0.6f to "HPF 46", 0.8f to "HPF 1.5k", 1f to "HPF 8.0k",
        )
        y(FxType.FILTER, 0f to "Q 0.5", 0.5f to "Q 4.3", 1f to "Q 8.0")
        x(FxType.COMPRESSOR, 0f to "1.0x", 0.5f to "2.8x", 1f to "8.0x")
        y(FxType.COMPRESSOR, 0f to "0.5/40", 0.5f to "10/200", 0.99f to "30/600", 1f to "30/600")
    }

    @Test
    fun `the knobs' mappings`() {
        assertEquals(12, FxKnobs.DELAY_DIVISIONS.size)
        assertEquals(FxKnobs.Division("1/8D", 3, 4), FxKnobs.DELAY_DIVISIONS[7])
        assertEquals(listOf(0, 1, 6, 11, 11), listOf(0f, 0.09f, 0.5f, 0.95f, 1f).map(FxKnobs::delayDivision))
        assertEquals(FxKnobs.LPF, FxKnobs.filterZone(0.46f))
        assertEquals(FxKnobs.OPEN, FxKnobs.filterZone(0.47f))
        assertEquals(FxKnobs.OPEN, FxKnobs.filterZone(0.53f))
        assertEquals(FxKnobs.HPF, FxKnobs.filterZone(0.54f))
        assertEquals(60f, FxKnobs.filterLpfHz(0f))
        assertEquals(20000f, FxKnobs.filterLpfHz(FxKnobs.LPF_TOP))
        assertEquals(20f, FxKnobs.filterHpfHz(FxKnobs.HPF_BOTTOM))
        assertEquals(8000f, FxKnobs.filterHpfHz(1f))
        assertEquals(0.7f, FxKnobs.reverbFeedback(0f))
        assertEquals(0.98f, FxKnobs.reverbFeedback(1f))
        assertEquals(40f, FxKnobs.distortionDrive(1f))
        assertEquals(8f, FxKnobs.compDrive(1f))
        assertEquals(FxKnobs.Speed("0.5/40", 0.5f, 40f), FxKnobs.COMP_SPEEDS[0])
        assertEquals(FxKnobs.Speed("30/600", 30f, 600f), FxKnobs.COMP_SPEEDS[7])
    }

    @Test
    fun `a book round-trips, its floats written exactly`() {
        val book = mapOf(7 to FxSettings.DEFAULT, 1 to busy)
        val json = FxBook.toJson(book)
        assertEquals(
            """{"v":1,"projects":[""" +
                """{"project":1,"type":"DELAY","x":0.25,"y":0.75,"sends":[0.5,0,1,0.25],"comp":{"on":true,"x":0.5,"y":1},""" +
                """"sidechain":{"on":true,"group":2,"pad":5,"dests":3,"x":0.5,"y":0.25}},""" +
                """{"project":7,"type":"NONE","x":0.5,"y":0.5,"sends":[0,0,0,0],"comp":{"on":false,"x":0.5,"y":0.5},""" +
                """"sidechain":{"on":false,"group":0,"pad":0,"dests":0,"x":0.30000001192092896,"y":0.5}}]}""",
            json,
        )
        assertEquals(book, FxBook.fromJson(json))
        assertEquals(listOf(1, 7), FxBook.fromJson(json)!!.keys.toList())
        assertEquals("""{"v":1,"projects":[]}""", FxBook.toJson(emptyMap()))
        assertEquals(emptyMap<Int, FxSettings>(), FxBook.fromJson(FxBook.toJson(emptyMap())))
        // Written clamped.
        assertEquals(mapOf(2 to FxSettings(x = 1f)), FxBook.fromJson(FxBook.toJson(mapOf(2 to FxSettings(x = 5f)))))
        // Any knob value comes back as the same float.
        val odd = FxSettings(x = 0.1f, y = 0.437f, sends = listOf(0.3f, 0.7f, 0.01f, 0.99f))
        assertEquals(mapOf(3 to odd), FxBook.fromJson(FxBook.toJson(mapOf(3 to odd))))
    }

    @Test
    fun `junk reads as nothing, and entries it can't read are skipped`() {
        assertNull(FxBook.fromJson("not json"))
        assertNull(FxBook.fromJson("[]"))
        assertNull(FxBook.fromJson("""{"v":2,"projects":[]}"""))
        assertNull(FxBook.fromJson("""{"v":"1","projects":[]}"""))
        assertNull(FxBook.fromJson("""{"projects":[]}"""))
        assertEquals(emptyMap<Int, FxSettings>(), FxBook.fromJson("""{"v":1}"""))
        val text = """{"v":1,"projects":[
            {"project":100},
            {"project":"1"},
            {"project":1,"type":"FLANGER"},
            {"project":1,"x":"0.5"},
            {"project":1,"sends":0.5},
            {"project":1,"sends":[0.5,"0"]},
            {"project":1,"comp":true},
            {"project":1,"comp":{"on":1}},
            {"project":1,"sidechain":{"group":1.5}},
            {"project":2,"type":"DELAY","x":0.25},
            {"project":3,"type":"FILTER","x":2,"y":-1,"sends":[2],"comp":{"on":true},
                "sidechain":{"on":true,"group":9,"pad":-1,"dests":255,"x":0.75}},
            {"project":2,"type":"CHORUS"},
            "junk"
        ]}"""
        val want = mapOf(
            2 to FxSettings(type = FxType.CHORUS),
            3 to FxSettings(
                type = FxType.FILTER,
                x = 1f,
                y = 0f,
                sends = listOf(1f, 0f, 0f, 0f),
                comp = Comp(on = true),
                sidechain = Sidechain(true, group = 3, pad = 0, dests = 15, x = 0.75f),
            ),
        )
        assertEquals(want, FxBook.fromJson(text))
    }
}

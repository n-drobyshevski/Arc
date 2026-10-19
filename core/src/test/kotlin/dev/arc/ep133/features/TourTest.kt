package dev.arc.ep133.features

import dev.arc.ep133.features.TourStep.BACKUP
import dev.arc.ep133.features.TourStep.CONNECT
import dev.arc.ep133.features.TourStep.DONE
import dev.arc.ep133.features.TourStep.GUIDE
import dev.arc.ep133.features.TourStep.HEAR
import dev.arc.ep133.features.TourStep.MIDI
import dev.arc.ep133.features.TourStep.PAD
import dev.arc.ep133.features.TourStep.RESTORE
import dev.arc.ep133.features.TourStep.SECTIONS
import dev.arc.ep133.features.TourStep.TOOLS
import dev.arc.ep133.features.TourStep.WELCOME
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class TourTest {
    private val fresh = TourSnapshot(backups = 0, canRestore = false, midi = true, connected = false)

    /** A run driven through [Tour.advance], as Root's effect does. */
    private class Run(var p: TourProgress = TourProgress(), var snap: TourSnapshot) {
        var s = Tour.open(p, seen = false, tourDone = false, backups = snap.backups)
        var now = 1000L
        fun step(): TourStep = Tour.current(p, s, snap)
        fun update(change: (TourSnapshot) -> TourSnapshot = { it }): TourStep {
            snap = change(snap)
            now += 100
            val (np, ns) = Tour.advance(p, s, snap, now)
            p = np; s = ns
            return step()
        }
        fun start() { s = Tour.welcome(s); update() }
        fun skip() { p = Tour.skip(p, step()); update() }
    }

    @Test
    fun `progress is kept as canonical text`() {
        val p = TourProgress(setOf(PAD, CONNECT), setOf(BACKUP))
        assertEquals("connect,pad,~backup", Tour.encode(p))
        assertEquals(p, Tour.decode("connect,pad,~backup"))
        assertEquals(p, Tour.decode(" ~backup ,pad,welcome,nonsense,,connect,done"))
        assertEquals("connect,~tools,sections", Tour.encode(Tour.decode("sections,~tools,connect")))
        assertEquals("", Tour.encode(TourProgress()))
        assertEquals(TourProgress(), Tour.decode(""))
        // Done wins over skipped.
        assertEquals(TourProgress(setOf(HEAR)), Tour.decode("~hear,hear"))
    }

    @Test
    fun `merging joins both, done winning over skipped`() {
        assertEquals("connect,pad,~hear,backup", Tour.merge("connect,pad,~backup", "backup,~hear"))
        assertEquals("connect", Tour.merge("", "connect"))
    }

    @Test
    fun `the whole tour, step by step`() {
        val r = Run(snap = fresh)
        assertEquals(WELCOME, r.step())
        r.start()
        assertEquals(CONNECT, r.step())
        // Connected: the card stays, ticked, until Next.
        assertEquals(CONNECT, r.update { it.copy(connected = true) })
        assertTrue(CONNECT in r.p.done)
        r.s = Tour.ackConnect(r.s)
        assertEquals(PAD, r.update())
        // An old hit (before the step came up) doesn't count; a new one does.
        assertEquals(PAD, r.update { it.copy(hitAt = 500, hitNamed = true) })
        assertEquals(HEAR, r.update { it.copy(hitAt = r.now + 1) })
        // HEAR ticks when the pad is let go after sounding.
        assertEquals(HEAR, r.update { it.copy(heard = true) })
        assertEquals(BACKUP, r.update { it.copy(heard = false) })
        assertEquals(BACKUP, r.update { it.copy(busy = true) })
        assertEquals(DONE, r.update { it.copy(busy = false, backups = 1) })
        assertEquals("connect,pad,hear,backup", Tour.encode(r.p))
        assertFalse(Tour.laterNote(r.p, midi = true))
    }

    @Test
    fun `done stays for the rest of the run`() {
        val r = Run(snap = fresh)
        r.start()
        r.skip()
        assertEquals(DONE, r.step())
        // The EP-133 showing up later doesn't bring the steps back in this run.
        assertEquals(DONE, r.update { it.copy(connected = true) })
    }

    @Test
    fun `without MIDI the Needs MIDI card leads to the offline steps`() {
        val r = Run(snap = fresh.copy(midi = false))
        r.start()
        assertEquals(MIDI, r.step())
        r.skip()
        assertEquals(TOOLS, r.step())
        r.skip(); r.skip(); r.skip()
        assertEquals(DONE, r.step())
        assertEquals("~midi,~tools,~guide,~sections", Tour.encode(r.p))
        assertFalse(Tour.laterNote(r.p, midi = false))
    }

    @Test
    fun `without the EP-133, each offline step waits until it was opened`() {
        val r = Run(snap = fresh)
        r.s = Tour.goOffline(r.s)
        assertEquals(TOOLS, r.update())
        assertEquals(3, Tour.stepsFor(r.s))
        // Live tools open: ticked; the next card waits until it is closed (the UI hides the tour meanwhile).
        assertEquals(GUIDE, r.update { it.copy(toolsOpen = true) })
        assertEquals(GUIDE, r.update { it.copy(toolsOpen = false) })
        assertEquals(SECTIONS, r.update { it.copy(guideOpen = true) })
        assertEquals(SECTIONS, r.update { it.copy(guideOpen = false) })
        assertEquals(DONE, r.update { it.copy(onBackups = true) })
        assertEquals("tools,guide,sections", Tour.encode(r.p))
        // Nothing of the device's was ticked or skipped.
        assertFalse(r.p.handled(CONNECT) || r.p.handled(PAD) || r.p.handled(BACKUP))
    }

    @Test
    fun `try the pads moves from the offline path to the device's steps`() {
        val r = Run(snap = fresh)
        r.s = Tour.goOffline(r.s)
        r.update()
        // The EP-133 connects on the way: ticked, and the Connect card shows it once.
        r.update { it.copy(connected = true) }
        assertEquals(TOOLS, r.step())
        r.s = Tour.goDevice(r.s)
        assertEquals(4, Tour.stepsFor(r.s))
        assertEquals(CONNECT, r.update())
        assertTrue(CONNECT in r.p.done)
        r.s = Tour.ackConnect(r.s)
        assertEquals(PAD, r.update())
        // From the offline Done without a device: plain Connect.
        val d = Run(snap = fresh)
        d.s = Tour.goOffline(d.s)
        d.update(); d.skip(); d.skip(); d.skip()
        assertEquals(DONE, d.step())
        d.s = Tour.goDevice(d.s)
        assertEquals(CONNECT, d.update())
        assertFalse(CONNECT in d.p.done)
    }

    @Test
    fun `skipping Connect skips everything that needs the device`() {
        val r = Run(snap = fresh)
        r.start()
        r.skip()
        assertEquals(DONE, r.step())
        assertTrue(Tour.laterNote(r.p, midi = true))
    }

    @Test
    fun `restore shows first for an empty library that can be restored`() {
        val r = Run(snap = fresh.copy(canRestore = true))
        r.start()
        assertEquals(RESTORE, r.step())
        assertEquals(CONNECT, r.update { it.copy(backups = 3) })
        assertTrue(RESTORE in r.p.done)
        // First time here skips it.
        val r2 = Run(snap = fresh.copy(canRestore = true))
        r2.start()
        r2.skip()
        assertEquals(CONNECT, r2.step())
        assertEquals("~restore", Tour.encode(r2.p))
        // Picking a folder (nothing to restore any more) moves on without keeping anything.
        val r3 = Run(snap = fresh.copy(canRestore = true))
        r3.start()
        assertEquals(CONNECT, r3.update { it.copy(canRestore = false) })
        assertEquals("", Tour.encode(r3.p))
        // Never with backups, never in the demo.
        assertEquals(CONNECT, Run(snap = fresh.copy(canRestore = true, backups = 2)).apply { start() }.step())
        assertEquals(CONNECT, Run(snap = fresh.copy(canRestore = true, demo = true)).apply { start() }.step())
    }

    @Test
    fun `a connection made before Start shows the ticked card once`() {
        val r = Run(snap = fresh.copy(connected = true))
        assertEquals(WELCOME, r.update())
        assertFalse(CONNECT in r.p.done)
        r.start()
        assertEquals(CONNECT, r.step())
        assertTrue(CONNECT in r.p.done)
        r.s = Tour.ackConnect(r.s)
        assertEquals(PAD, r.update())
    }

    @Test
    fun `a resumed tour skips what was done and counts from there`() {
        val p = Tour.decode("connect,pad")
        val r = Run(p, fresh.copy(connected = true, hitNamed = true))
        assertTrue(r.s.resumed)
        assertEquals(3, Tour.resumeAt(r.p))
        r.start()
        // CONNECT was done earlier: no ticked card this time.
        assertEquals(HEAR, r.step())
        assertFalse(Run(snap = fresh).s.resumed)
    }

    @Test
    fun `hear is passed by silently without a named sample`() {
        val r = Run(Tour.decode("connect"), fresh.copy(connected = true))
        r.start()
        assertEquals(PAD, r.step())
        assertEquals(BACKUP, r.update { it.copy(hitAt = r.now + 1, hitNamed = false) })
        assertFalse(r.p.handled(HEAR))
        // laterNote doesn't count a HEAR that couldn't show.
        assertTrue(Tour.laterNote(r.p, midi = true))
        r.update { it.copy(backups = 1) }
        assertFalse(Tour.laterNote(r.p, midi = true))
    }

    @Test
    fun `steps need fresh actions after Try arc again`() {
        // An existing user: a library, a connected device, an old hit.
        val snap = fresh.copy(backups = 4, connected = true, hitAt = 10, hitNamed = true)
        val r = Run(snap = snap)
        r.start()
        r.s = Tour.ackConnect(r.s)
        assertEquals(PAD, r.update())
        assertEquals(PAD, r.update())
        assertEquals(HEAR, r.update { it.copy(hitAt = r.now + 1) })
        r.skip()
        // The library already has backups: only a new one ticks BACKUP.
        assertEquals(BACKUP, r.update())
        assertEquals(DONE, r.update { it.copy(backups = 5) })
    }

    @Test
    fun `progress never un-ticks`() {
        val r = Run(snap = fresh)
        r.start()
        r.update { it.copy(connected = true) }
        r.update { it.copy(connected = false) }
        assertTrue(CONNECT in r.p.done)
        assertEquals(TourProgress(setOf(CONNECT)), Tour.skip(TourProgress(setOf(CONNECT)), CONNECT))
        assertEquals(TourProgress(), Tour.skip(TourProgress(), WELCOME))
    }

    @Test
    fun `first run decision`() {
        assertEquals(FirstRun.TOUR, Tour.firstRun(seen = false, tourDone = false, tourSteps = "", backups = 0, demo = false))
        assertEquals(FirstRun.COACH, Tour.firstRun(seen = false, tourDone = false, tourSteps = "", backups = 3, demo = false))
        assertEquals(FirstRun.TOUR, Tour.firstRun(seen = false, tourDone = false, tourSteps = "connect", backups = 3, demo = false))
        assertEquals(FirstRun.TOUR, Tour.firstRun(seen = false, tourDone = false, tourSteps = "", backups = 3, demo = true))
        assertEquals(FirstRun.NONE, Tour.firstRun(seen = true, tourDone = false, tourSteps = "", backups = 0, demo = false))
        assertEquals(FirstRun.NONE, Tour.firstRun(seen = true, tourDone = true, tourSteps = "", backups = 0, demo = true))
        assertEquals(FirstRun.COACH, Tour.firstRun(seen = false, tourDone = true, tourSteps = "", backups = 0, demo = false))
    }

    @Test
    fun `the tour closes when it was finished elsewhere`() {
        val s = Tour.open(TourProgress(), seen = false, tourDone = false, backups = 0)
        assertFalse(Tour.closes(s, seen = false, tourDone = false))
        assertTrue(Tour.closes(s, seen = true, tourDone = false))
        assertTrue(Tour.closes(s, seen = false, tourDone = true))
        // Try arc again: the old flags don't close it.
        val again = Tour.open(TourProgress(), seen = true, tourDone = true, backups = 3)
        assertFalse(Tour.closes(again, seen = true, tourDone = true))
    }

    @Test
    fun `settings reach library json only with a library`() {
        assertFalse(Tour.syncsIndex(folderPicked = false, backups = 0))
        assertTrue(Tour.syncsIndex(folderPicked = true, backups = 0))
        assertTrue(Tour.syncsIndex(folderPicked = false, backups = 1))
    }

    @Test
    fun `numbers, targets and what passes touches through`() {
        assertEquals(listOf(null, null, 1, null, 2, 3, 4, 1, 2, 3, null), TourStep.entries.map { Tour.number(it) })
        assertEquals(listOf(HEAR, TOOLS, GUIDE, SECTIONS), TourStep.entries.filter { Tour.passThrough(it) })
        assertEquals(listOf(PAD, BACKUP), TourStep.entries.filter { Tour.needsDevice(it) })
        assertEquals("top.connection", Tour.target(CONNECT))
        assertEquals("live.pads", Tour.target(PAD))
        assertEquals("live.pads", Tour.target(HEAR))
        assertEquals("top.backup", Tour.target(BACKUP))
        assertNull(Tour.target(WELCOME))
        assertNull(Tour.target(DONE))
        // Every id is a coach mark the app has (Coach.kt's call sites).
        val marks = setOf("top.connection", "live.pads", "top.backup", "top.help", "edge.guide", "side.more", "top.sections")
        assertEquals("side.more", Tour.target(TOOLS))
        assertEquals("edge.guide", Tour.target(GUIDE))
        assertEquals("top.sections", Tour.target(SECTIONS))
        assertTrue(marks.containsAll(TourStep.entries.mapNotNull { Tour.target(it) } + Tour.DONE_TAGS))
        assertEquals(4, Tour.resumeAt(Tour.decode("connect,pad,~hear")))
        assertEquals(1, Tour.resumeAt(TourProgress()))
    }
}

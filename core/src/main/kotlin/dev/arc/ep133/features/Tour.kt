package dev.arc.ep133.features

/**
 * "Try arc": the short tour on the real Live screen that a new install gets in
 * place of the first-run guide overlay (an addition to the web version).
 *
 * Every step waits until the thing was done: the EP-133 connected, a pad
 * pressed on it lit here, a pad held here sounded, a backup saved. Without
 * the EP-133 (chosen on the welcome card, or where MIDI is missing) it shows
 * what works offline instead: Live tools, the shortcut guide, Backups. This is the
 * tour's logic only, pure so both ports share it: which step shows, when one
 * counts as done, and what is kept. The overlay and the cards are the UI's.
 *
 * Progress is kept as text ([encode]) in the settings, so a tour left half way
 * resumes, and a reinstall that restores library.json brings it back. A step
 * ticks once and never un-ticks.
 */
enum class TourStep(val id: String) {
    WELCOME("welcome"),
    /** Bring back the library after a reinstall: only while it is empty. */
    RESTORE("restore"),
    CONNECT("connect"),
    /** In place of the steps that need the EP-133 where MIDI is missing. */
    MIDI("midi"),
    PAD("pad"),
    HEAR("hear"),
    BACKUP("backup"),
    /** The offline path: Live tools, the EP-133 shortcut guide, Backups. */
    TOOLS("tools"),
    GUIDE("guide"),
    SECTIONS("sections"),
    DONE("done"),
}

/** What the tour has done and skipped, kept across starts. */
data class TourProgress(val done: Set<TourStep> = emptySet(), val skipped: Set<TourStep> = emptySet()) {
    fun handled(step: TourStep) = step in done || step in skipped
    val isEmpty get() = done.isEmpty() && skipped.isEmpty()
}

/** What the app shows now, as the tour reads it. */
data class TourSnapshot(
    /** Backups in the library. */
    val backups: Int,
    /** A folder can be picked to bring an earlier library back (none picked yet). */
    val canRestore: Boolean,
    /** This phone or browser can talk MIDI at all. */
    val midi: Boolean,
    /** Connected, and the device has been read. */
    val connected: Boolean,
    /** A task (backup, restore, connect) is running. */
    val busy: Boolean = false,
    /** When the last pad hit from the EP-133 lit its pad (PadLight.onAt); null without one. */
    val hitAt: Long? = null,
    /** That pad's sample has a name, so it can play here. */
    val hitNamed: Boolean = false,
    /** A pad or key is sounding on the phone. */
    val heard: Boolean = false,
    /** The web demo's simulated EP-133. */
    val demo: Boolean = false,
    /** Live tools, the shortcut guide, Backups: open on screen now. */
    val toolsOpen: Boolean = false,
    val guideOpen: Boolean = false,
    val onBackups: Boolean = false,
)

/** One run of the tour on screen: never stored. */
data class TourSession(
    /** What the settings said when the tour opened (see [Tour.closes]). */
    val seenAtOpen: Boolean,
    val tourDoneAtOpen: Boolean,
    /** Backups when the tour opened: RESTORE shows only for an empty library. */
    val openBackups: Int,
    /** Progress was kept from an earlier start: the welcome says so. */
    val resumed: Boolean = false,
    val welcomed: Boolean = false,
    /** The step on screen, and when it came up (with the backup count then). */
    val step: TourStep? = null,
    val stepAt: Long = 0,
    val stepBackups: Int = 0,
    /** In HEAR, a pad sounded since the step came up. */
    val heardSince: Boolean = false,
    /** CONNECT ticked during this run; its card then waits for Next. */
    val connectTickedNow: Boolean = false,
    val connectAcked: Boolean = false,
    /** Done was reached: it stays for the rest of the run. */
    val reachedDone: Boolean = false,
    /** The run without the EP-133: the offline steps instead of the device's. */
    val offline: Boolean = false,
)

enum class FirstRun { TOUR, COACH, NONE }

object Tour {
    /** The numbered steps, "Step n of 4" (of 3 without the EP-133). */
    const val STEPS = 4
    const val OFFLINE_STEPS = 3

    /** The coach marks Done tags: "?", the GUIDE tab and the more-tools strip. */
    val DONE_TAGS: Set<String> = setOf("top.help", "edge.guide", "side.more")

    /** The steps that are kept (WELCOME and DONE never are). */
    private val KEPT = listOf(
        TourStep.RESTORE, TourStep.CONNECT, TourStep.MIDI, TourStep.PAD, TourStep.HEAR, TourStep.BACKUP,
        TourStep.TOOLS, TourStep.GUIDE, TourStep.SECTIONS,
    )
    private val OFFLINE = listOf(TourStep.TOOLS, TourStep.GUIDE, TourStep.SECTIONS)

    fun encode(p: TourProgress): String = KEPT.mapNotNull { s ->
        when (s) {
            in p.done -> s.id
            in p.skipped -> "~" + s.id
            else -> null
        }
    }.joinToString(",")

    /** Unknown ids are ignored; a step both done and skipped counts as done. */
    fun decode(text: String): TourProgress {
        val done = mutableSetOf<TourStep>()
        val skipped = mutableSetOf<TourStep>()
        for (raw in text.split(',')) {
            val t = raw.trim()
            val skip = t.startsWith("~")
            val step = KEPT.firstOrNull { it.id == t.removePrefix("~") } ?: continue
            if (skip) skipped += step else done += step
        }
        return TourProgress(done, skipped - done)
    }

    /** Two kept progresses (library.json and a newer copy) joined. */
    fun merge(a: TourProgress, b: TourProgress): TourProgress {
        val done = a.done + b.done
        return TourProgress(done, (a.skipped + b.skipped) - done)
    }

    fun merge(a: String, b: String): String = encode(merge(decode(a), decode(b)))

    /** What a start shows by itself. A demo always gets the tour; it keeps no settings. */
    fun firstRun(seen: Boolean, tourDone: Boolean, tourSteps: String, backups: Int, demo: Boolean): FirstRun = when {
        !tourDone && !seen && (demo || backups == 0 || tourSteps.isNotEmpty()) -> FirstRun.TOUR
        !seen -> FirstRun.COACH
        else -> FirstRun.NONE
    }

    /** A fresh run of the tour, with the settings as they are now. */
    fun open(p: TourProgress, seen: Boolean, tourDone: Boolean, backups: Int) =
        TourSession(seenAtOpen = seen, tourDoneAtOpen = tourDone, openBackups = backups, resumed = !p.isEmpty)

    /**
     * The tour closes by itself when the settings say it was finished since it
     * opened: a restore that brought back a finished tour, or another tab.
     */
    fun closes(s: TourSession, seen: Boolean, tourDone: Boolean) =
        (tourDone && !s.tourDoneAtOpen) || (seen && !s.seenAtOpen)

    /** Settings reach library.json only once there is a library to keep them with. */
    fun syncsIndex(folderPicked: Boolean, backups: Int) = folderPicked || backups > 0

    /** The step to show. */
    fun current(p: TourProgress, s: TourSession, snap: TourSnapshot): TourStep {
        if (!s.welcomed) return TourStep.WELCOME
        if (s.reachedDone) return TourStep.DONE
        if (!p.handled(TourStep.RESTORE) && s.openBackups == 0 && snap.canRestore && !snap.demo) return TourStep.RESTORE
        if (s.offline) return offlineStep(p)
        if (!snap.midi) return if (p.handled(TourStep.MIDI)) offlineStep(p) else TourStep.MIDI
        val connectDone = TourStep.CONNECT in p.done
        if (!p.handled(TourStep.CONNECT) || (s.connectTickedNow && !s.connectAcked)) return TourStep.CONNECT
        if (!connectDone) return TourStep.DONE
        if (!p.handled(TourStep.PAD)) return TourStep.PAD
        if (!p.handled(TourStep.HEAR) && TourStep.PAD in p.done && snap.hitNamed) return TourStep.HEAR
        if (!p.handled(TourStep.BACKUP)) return TourStep.BACKUP
        return TourStep.DONE
    }

    private fun offlineStep(p: TourProgress) = OFFLINE.firstOrNull { !p.handled(it) } ?: TourStep.DONE

    /**
     * Brings the run and the progress up to date with what the app shows now:
     * the step's baseline when a new one comes up, then ticks. CONNECT ticks
     * whenever the EP-133 is connected; other steps only while on screen.
     */
    fun advance(p: TourProgress, s: TourSession, snap: TourSnapshot, now: Long): Pair<TourProgress, TourSession> {
        var prog = p
        var sess = s
        if (snap.connected && TourStep.CONNECT !in prog.done && sess.welcomed) {
            prog = prog.tick(TourStep.CONNECT)
            sess = sess.copy(connectTickedNow = true)
        }
        // Each pass moves at most one step on, so a new step gets its own baseline first.
        repeat(KEPT.size + 2) {
            val step = current(prog, sess, snap)
            if (step != sess.step) {
                sess = sess.copy(step = step, stepAt = now, stepBackups = snap.backups, heardSince = false)
                if (step == TourStep.DONE) sess = sess.copy(reachedDone = true)
                return@repeat
            }
            if (step == TourStep.HEAR && snap.heard && !sess.heardSince) sess = sess.copy(heardSince = true)
            val ticks = when (step) {
                TourStep.RESTORE -> snap.backups > sess.openBackups
                TourStep.PAD -> snap.hitAt != null && snap.hitAt > sess.stepAt
                TourStep.HEAR -> sess.heardSince && !snap.heard
                TourStep.BACKUP -> snap.backups > sess.stepBackups
                TourStep.TOOLS -> snap.toolsOpen
                TourStep.GUIDE -> snap.guideOpen
                TourStep.SECTIONS -> snap.onBackups
                else -> false
            }
            if (!ticks) return prog to sess
            prog = prog.tick(step)
        }
        return prog to sess
    }

    private fun TourProgress.tick(step: TourStep) = TourProgress(done + step, skipped - step)

    /** "Skip", "Later", "First time here" and the Needs MIDI card's Next. */
    fun skip(p: TourProgress, step: TourStep): TourProgress =
        if (step !in KEPT || step in p.done) p else TourProgress(p.done, p.skipped + step)

    /** Start or Continue on the welcome card. */
    fun welcome(s: TourSession) = s.copy(welcomed = true)

    /** Next on the Connect card once every row is ticked. */
    fun ackConnect(s: TourSession) = s.copy(connectAcked = true)

    /** "Without the EP-133" on the welcome card. */
    fun goOffline(s: TourSession) = welcome(s).copy(offline = true)

    /** "Try the pads": from the offline path to the device's steps. */
    fun goDevice(s: TourSession) = s.copy(welcomed = true, offline = false, reachedDone = false, step = null)

    /** How many steps this run counts: the offline three without the EP-133 or without MIDI. */
    fun stepsFor(s: TourSession, midi: Boolean = true) = if (s.offline || !midi) OFFLINE_STEPS else STEPS

    /** "Step n of 4" (or of 3, offline), or null for the cards that aren't counted. */
    fun number(step: TourStep): Int? = when (step) {
        TourStep.CONNECT, TourStep.TOOLS -> 1
        TourStep.PAD, TourStep.GUIDE -> 2
        TourStep.HEAR, TourStep.SECTIONS -> 3
        TourStep.BACKUP -> 4
        else -> null
    }

    /** The first numbered step not done yet, for "stopped at step n". */
    fun resumeAt(p: TourProgress): Int =
        listOf(TourStep.CONNECT, TourStep.PAD, TourStep.HEAR, TourStep.BACKUP).firstOrNull { !p.handled(it) }?.let { number(it) } ?: STEPS

    /** The steps that need the EP-133 connected: without it their card asks to connect. */
    fun needsDevice(step: TourStep) = step == TourStep.PAD || step == TourStep.BACKUP

    /** The coach mark a step points at; null for a card on the veil alone. */
    fun target(step: TourStep): String? = when (step) {
        TourStep.CONNECT -> "top.connection"
        TourStep.PAD, TourStep.HEAR -> "live.pads"
        // Back up is the first key of the Backups caption row: the step shows on Backups.
        TourStep.BACKUP -> "backups.backup"
        TourStep.TOOLS -> "side.more"
        TourStep.GUIDE -> "edge.guide"
        TourStep.SECTIONS -> "top.sections"
        else -> null
    }

    /** The steps done on the page itself: touches go through to it (the pads, the strip, the tab, the tag). */
    fun passThrough(step: TourStep) = step == TourStep.HEAR || step in OFFLINE

    /** Done mentions Try arc again when a step that could be done was left. */
    fun laterNote(p: TourProgress, midi: Boolean): Boolean = midi && (
        listOf(TourStep.CONNECT, TourStep.PAD, TourStep.BACKUP).any { it !in p.done } || TourStep.HEAR in p.skipped
    )
}

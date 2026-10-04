package dev.arc.ep133.text

import dev.arc.ep133.text.Format.plural

/** A device as stored with a backup (the web version's record.device). */
data class BackupDevice(val product: String = "", val sku: String = "", val serial: String = "", val osVersion: String = "")

/** One library entry (library.js record). */
data class BackupRecord(
    val id: String,
    val title: String,
    val notes: String,
    val createdAt: Long,
    /** "device" or "import". */
    val source: String,
    val fileName: String?,
    val device: BackupDevice,
    val soundCount: Int,
    val projectCount: Int,
    val projects: List<Int>,
    val slots: List<Int>,
    val projectSlots: Map<Int, List<Int>>,
    val size: Long,
)

/** What a restore will write. */
data class RestoreSelection(val slots: List<Int>, val projects: List<Int>)

/** The small rules app.js applies around the library and restore sheet. */
object LibraryRules {
    /** `fileNameFor(b)`: "my-backup.pak". JS \w is ASCII only, spelled out here. */
    fun fileNameFor(title: String): String {
        val base = title.replace(Regex("[^A-Za-z0-9_\\- ]+"), "")
            .trim(' ')
            .replace(Regex(" +"), "-")
            .lowercase(java.util.Locale.ROOT)
            .ifEmpty { "ep133-backup" }
        return "$base.pak"
    }

    /** `file.name.replace(/\.(pak|zip)$/i, '') || 'Imported backup'`. */
    fun importTitle(fileName: String): String {
        val n = fileName
        val stripped = if (n.length >= 4 && n[n.length - 4] == '.' &&
            n.substring(n.length - 3).let { it.all { c -> c.code < 128 } && it.lowercase() in setOf("pak", "zip") }
        ) n.substring(0, n.length - 4) else n
        return stripped.ifEmpty { "Imported backup" }
    }

    /** `restoreSelection()` from app.js. */
    fun restoreSelection(b: BackupRecord, everything: Boolean, picked: List<Int>, alsoOther: Boolean): RestoreSelection {
        if (everything) return RestoreSelection(b.slots, b.projects)
        val slots = LinkedHashSet<Int>()
        for (p in picked) slots.addAll(b.projectSlots[p].orEmpty())
        if (alsoOther) {
            // "no picked project uses" in the label, but the web code excludes
            // sounds used by any project in the backup. Kept as written.
            val usedByAny = b.projectSlots.values.flatten().toSet()
            for (s in b.slots) if (s !in usedByAny) slots.add(s)
        }
        return RestoreSelection(slots.sorted(), picked)
    }

    /** The restore key: "Restore 3 sounds and 1 project" or "Pick something to restore". */
    fun restoreButton(sel: RestoreSelection): String {
        val parts = parts(sel)
        return if (parts.isNotEmpty()) "Restore ${parts.joinToString(" and ")}" else Strings.PICK_SOMETHING
    }

    fun canRestore(sel: RestoreSelection) = parts(sel).isNotEmpty()

    private fun parts(sel: RestoreSelection) = buildList {
        if (sel.slots.isNotEmpty()) add(plural(sel.slots.size, "sound"))
        if (sel.projects.isNotEmpty()) add(plural(sel.projects.size, "project"))
    }

    fun restoreWarning(sel: RestoreSelection): String {
        if (parts(sel).isEmpty()) return ""
        val what = buildList {
            if (sel.projects.isNotEmpty()) add("${if (sel.projects.size == 1) "project" else "projects"} ${Format.list(sel.projects.map(Int::toString))}")
            if (sel.slots.isNotEmpty()) add(plural(sel.slots.size, "sample slot"))
        }
        return "This overwrites ${what.joinToString(" and ")} on your EP-133. Everything else on the device stays as it is."
    }

    /** Rows of the detail sheet's facts list; empty values are left out. */
    fun facts(b: BackupRecord, madeText: String): List<Pair<String, String>> = buildList {
        fun fact(k: String, v: String) {
            if (v.isNotEmpty()) add(k to v)
        }
        fact("Made", madeText)
        fact(
            "From",
            if (b.source == "import") "Imported file" + (if (!b.fileName.isNullOrEmpty()) ", ${b.fileName}" else "")
            else listOf(b.device.product, b.device.serial).filter { it.isNotEmpty() }.joinToString(", "),
        )
        fact("OS", b.device.osVersion)
        fact("Contents", "${plural(b.soundCount, "sound")}, ${plural(b.projectCount, "project")}")
        fact("Size", Format.bytes(b.size))
    }

    /** Muted text after "Project N" in the detail sheet ("" when no sounds are known). */
    fun projectSoundsDetail(b: BackupRecord, n: Int): String {
        val used = b.projectSlots[n]?.size ?: 0
        return if (used != 0) plural(used, "sound") else ""
    }

    /** Small text after a project checkbox in the restore sheet (shows "0 sounds"). */
    fun projectSoundsRestore(b: BackupRecord, n: Int): String = plural(b.projectSlots[n]?.size ?: 0, "sound")

    /** Library order: newest first (ties keep id order, as IndexedDB did). */
    fun sorted(list: List<BackupRecord>): List<BackupRecord> =
        list.sortedWith(compareByDescending<BackupRecord> { it.createdAt }.thenBy { it.id })
}

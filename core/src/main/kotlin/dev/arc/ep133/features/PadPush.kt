package dev.arc.ep133.features

import dev.arc.ep133.formats.JsJson
import dev.arc.ep133.formats.isJsNumber
import dev.arc.ep133.formats.numberOrNull
import dev.arc.ep133.protocol.Cmd
import dev.arc.ep133.protocol.Frame
import dev.arc.ep133.util.decodeUtf8
import kotlinx.serialization.json.JsonObject

/**
 * The pad push the live mirror listens for (an addition to the web version).
 * None of this is in the official guide; it follows community notes:
 *
 * - kmorrill/ep-series-sysex (docs/sysex-protocol.md): after a FILE init the
 *   device sends FILE events, METADATA_UPDATED = 0x03 among them, and a pad
 *   press sends one carrying the "active" pad file id.
 * - Zatumanen/Ko-tool (js/ep133/device.js): the unpacked FILE payload of an
 *   event is [event code, node be16, JSON text, 0x00].
 * - The pad file id is 3200 + (project-1)*1000 + group*100 + pad, group
 *   A=0..D=3, pad 1..12 (kmorrill file-protocol.md, ep133-krate captures).
 *
 * Anything that does not match gives null, so an unexpected frame is ignored.
 */
object PadPush {
    const val METADATA_UPDATED = 0x03

    fun parse(f: Frame): PadFid? {
        if (f.command != Cmd.FILE) return null
        val p = f.payload
        if (p.size < 4 || (p[0].toInt() and 0xFF) != METADATA_UPDATED) return null
        var end = 3
        while (end < p.size && p[end] != 0.toByte()) end++
        val json = JsJson.parseOrNull(decodeUtf8(p.copyOfRange(3, end))) as? JsonObject ?: return null
        val active = json["active"]?.takeIf { it.isJsNumber }?.numberOrNull ?: return null
        if (active != Math.floor(active)) return null
        return fid(active.toInt())
    }

    /** A pad file id split into project, group and pad, or null if it is not one. */
    fun fid(id: Int): PadFid? {
        val x = id - 3200
        if (x < 0) return null
        val project = x / 1000 + 1
        val rest = x % 1000
        val group = rest / 100
        val pad = rest % 100
        return if (group in 0..3 && pad in 1..12 && project in 1..99) PadFid(project, group, pad) else null
    }

    /**
     * A key's pad number counted from the top row, as kmorrill's notes number
     * the pad files: 7 8 9 are 1 2 3, 4 5 6 are 4 5 6, 1 2 3 are 7 8 9, and
     * '.', '0', ENTER are 10, 11, 12. [offset] is the official note order (PadNotes).
     */
    fun topNumber(offset: Int): Int {
        require(offset in 0..11) { "no pad at offset $offset" }
        return (3 - offset / 3) * 3 + offset % 3 + 1
    }

    /** The pad file id of [fid] (the inverse of [fid]): 3200 + (project-1)*1000 + group*100 + pad. */
    fun node(fid: PadFid): Int {
        require(fid.project in 1..99 && fid.group in 0..3 && fid.pad in 1..12) { "no pad file for $fid" }
        return 3200 + (fid.project - 1) * 1000 + fid.group * 100 + fid.pad
    }
}

/**
 * How pad numbers in the project file (pads/<group>/pNN) relate to the keys.
 * Community sources disagree: kmorrill's midi-reference (calibrated on a
 * device with these pushes) says pNN is the pad file id's last term, counted
 * from the top row (p01 = '7'); ep133-ppak says pNN counts from the bottom
 * row (p01 = '.'), which is the official note order plus one.
 */
enum class PadOrder { FROM_TOP, FROM_BOTTOM }

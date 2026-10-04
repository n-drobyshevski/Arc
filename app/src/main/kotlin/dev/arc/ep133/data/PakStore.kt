package dev.arc.ep133.data

import dev.arc.ep133.text.Strings
import java.io.File
import java.io.FileOutputStream
import java.io.IOException

/** .pak files in app-private storage, one per library entry: files/paks/{id}.pak */
class PakStore(root: File) {
    private val dir = File(root, "paks").apply { mkdirs() }

    fun file(id: String) = File(dir, "$id.pak")

    /** Writes atomically: temp file, fsync, rename. */
    fun write(id: String, bytes: ByteArray) {
        val tmp = File(dir, "$id.pak.tmp")
        FileOutputStream(tmp).use { out ->
            out.write(bytes)
            out.fd.sync()
        }
        if (!tmp.renameTo(file(id))) {
            tmp.delete()
            throw IOException("Could not store the backup")
        }
    }

    fun read(id: String): ByteArray {
        val f = file(id)
        if (!f.isFile) throw IOException(Strings.FILE_MISSING)
        return f.readBytes()
    }

    fun delete(id: String) {
        file(id).delete()
    }

    /** Removes files with no library row (left behind if the app died between the two writes). */
    fun sweep(keep: Set<String>) {
        dir.listFiles()?.forEach { f ->
            val id = f.name.removeSuffix(".tmp").removeSuffix(".pak")
            if (f.name.endsWith(".tmp") || id !in keep) f.delete()
        }
    }

    fun freeSpace(): Long = dir.usableSpace
}

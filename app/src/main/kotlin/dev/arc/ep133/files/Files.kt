package dev.arc.ep133.files

import android.content.ActivityNotFoundException
import android.content.ClipData
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.provider.DocumentsContract
import android.provider.OpenableColumns
import androidx.core.content.FileProvider
import java.io.File
import java.io.IOException

/** .pak files are zips; FileProvider would otherwise report application/octet-stream (and it may not know .wav). */
class PakFileProvider : FileProvider() {
    override fun getType(uri: Uri): String? {
        val path = uri.path.orEmpty()
        return when {
            path.endsWith(".pak", ignoreCase = true) -> "application/zip"
            path.endsWith(".txt", ignoreCase = true) -> "text/plain"
            path.endsWith(".wav", ignoreCase = true) -> "audio/wav"
            else -> super.getType(uri)
        }
    }
}

object Files {
    const val AUTHORITY = "dev.arc.ep133.files"
    /** Larger than any EP-133 backup (64 MB of samples), small enough to read into memory. */
    private const val MAX_IMPORT = 128L * 1024 * 1024
    const val TOO_LARGE = "This file is too large to be a backup"

    /** A copy of [bytes] under cache/share/, named [name], as a content URI. */
    fun shareableUri(context: Context, name: String, bytes: ByteArray): Uri {
        val dir = File(context.cacheDir, "share").apply {
            deleteRecursively()
            mkdirs()
        }
        val f = File(dir, name)
        f.writeBytes(bytes)
        return FileProvider.getUriForFile(context, AUTHORITY, f)
    }

    /** ACTION_SEND through the system chooser. Throws if nothing can receive it. */
    fun share(context: Context, uri: Uri, mime: String, subject: String, text: String) {
        val send = Intent(Intent.ACTION_SEND)
            .setType(mime)
            .putExtra(Intent.EXTRA_STREAM, uri)
            .putExtra(Intent.EXTRA_SUBJECT, subject)
            .putExtra(Intent.EXTRA_TEXT, text)
            .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        send.clipData = ClipData.newRawUri(subject, uri)
        val chooser = Intent.createChooser(send, null).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        if (context !is android.app.Activity) chooser.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        try {
            context.startActivity(chooser)
        } catch (e: ActivityNotFoundException) {
            throw IOException("no app to share with", e)
        }
    }

    /** Writes [bytes] to a document the user picked with the Storage Access Framework. */
    fun writeTo(context: Context, uri: Uri, bytes: ByteArray) {
        val out = context.contentResolver.openOutputStream(uri, "wt") ?: throw IOException("Could not open the file for writing")
        out.use { it.write(bytes) }
    }

    /** Copies [file] to a document the user picked with the Storage Access Framework. */
    fun copyTo(context: Context, uri: Uri, file: File) {
        val out = context.contentResolver.openOutputStream(uri, "wt") ?: throw IOException("Could not open the file for writing")
        out.use { o -> file.inputStream().use { it.copyTo(o, 64 * 1024) } }
    }

    /** Display name and last-modified time of a picked or opened document, if the provider knows them. */
    fun describe(context: Context, uri: Uri): Pair<String, Long?> {
        var name: String? = null
        var modified: Long? = null
        runCatching {
            context.contentResolver.query(uri, null, null, null, null)?.use { c ->
                if (c.moveToFirst()) {
                    val n = c.getColumnIndex(OpenableColumns.DISPLAY_NAME)
                    if (n >= 0 && !c.isNull(n)) name = c.getString(n)
                    val m = c.getColumnIndex(DocumentsContract.Document.COLUMN_LAST_MODIFIED)
                    if (m >= 0 && !c.isNull(m)) modified = c.getLong(m)
                }
            }
        }
        return (name ?: uri.lastPathSegment?.substringAfterLast('/') ?: "backup.pak") to modified
    }

    fun read(context: Context, uri: Uri): ByteArray {
        // Check the size first when the provider knows it, so a huge file fails with a clear message.
        val known = runCatching {
            context.contentResolver.openFileDescriptor(uri, "r")?.use { it.statSize }
        }.getOrNull() ?: -1L
        if (known > MAX_IMPORT) throw IOException(TOO_LARGE)
        val input = context.contentResolver.openInputStream(uri) ?: throw IOException("Could not open the file")
        return input.use { s ->
            val out = java.io.ByteArrayOutputStream(if (known > 0) known.toInt() else 64 * 1024)
            val buf = ByteArray(64 * 1024)
            var total = 0L
            while (true) {
                val n = s.read(buf)
                if (n < 0) break
                total += n
                if (total > MAX_IMPORT) throw IOException(TOO_LARGE)
                out.write(buf, 0, n)
            }
            out.toByteArray()
        }
    }
}

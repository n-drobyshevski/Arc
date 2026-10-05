package dev.arc.ep133.data

import android.content.ContentUris
import android.content.ContentValues
import android.content.Context
import android.net.Uri
import android.os.Environment
import android.provider.DocumentsContract
import android.provider.MediaStore
import androidx.core.content.edit
import dev.arc.ep133.backup.LibraryIndex
import java.io.IOException

/** A file in the picked folder. */
data class FolderFile(val uri: Uri, val lastModified: Long)

/**
 * The library's copy in Documents/arc, which survives uninstalling the app
 * (an addition to the web version). Android deletes an app's own storage on
 * uninstall, and its cloud backup is capped far below one .pak, so the
 * backups live here as well.
 *
 * Two ways in:
 * - Normally through MediaStore, which needs no permission. An app can only
 *   see the files it created itself this way; a file left by an earlier
 *   install with the same name makes MediaStore pick "name (1)", so the
 *   files this install created are remembered by their MediaStore address.
 * - After a reinstall the old files belong to the old install, so the user
 *   picks the folder once (Storage Access Framework); from then on every
 *   read and write goes through that folder.
 */
class ExternalLibrary(private val context: Context) {
    private val prefs = context.getSharedPreferences("external", Context.MODE_PRIVATE)
    private val resolver get() = context.contentResolver

    /** The folder the user picked, if any. */
    val tree: Uri? get() = prefs.getString("tree", null)?.let(Uri::parse)

    fun setTree(uri: Uri) = prefs.edit { putString("tree", uri.toString()) }

    /**
     * Files whose name is not the usual one for their backup (found in the
     * folder without an index entry), by backup id.
     */
    fun fileOverride(id: String): String? = prefs.getString("file:$id", null)

    fun setFileOverride(id: String, name: String?) = prefs.edit { if (name == null) remove("file:$id") else putString("file:$id", name) }

    fun write(name: String, bytes: ByteArray, mime: String) {
        val t = tree
        if (t != null) treeWrite(t, name, bytes, mime) else storeWrite(name, bytes, mime)
    }

    fun delete(name: String) {
        val t = tree
        if (t != null) {
            list(t)[name]?.let { DocumentsContract.deleteDocument(resolver, it.uri) }
        } else {
            storeFind(name)?.let { resolver.delete(it, null, null) }
            prefs.edit { remove("store:$name") }
        }
    }

    /** The names present: the picked folder's files, or (without one) null, meaning ask per name. */
    fun names(): Set<String>? = tree?.let { list(it).keys }

    fun exists(name: String): Boolean = tree?.let { name in list(it) } ?: (storeFind(name) != null)

    /** Every file in a folder, by name. */
    fun list(t: Uri? = tree): Map<String, FolderFile> {
        t ?: return emptyMap()
        val root = DocumentsContract.getTreeDocumentId(t)
        val out = LinkedHashMap<String, FolderFile>()
        resolver.query(
            DocumentsContract.buildChildDocumentsUriUsingTree(t, root),
            arrayOf(
                DocumentsContract.Document.COLUMN_DOCUMENT_ID,
                DocumentsContract.Document.COLUMN_DISPLAY_NAME,
                DocumentsContract.Document.COLUMN_LAST_MODIFIED,
            ),
            null, null, null,
        )?.use { c ->
            while (c.moveToNext()) {
                val id = c.getString(0) ?: continue
                val name = c.getString(1) ?: continue
                val modified = if (c.isNull(2)) 0L else c.getLong(2)
                out[name] = FolderFile(DocumentsContract.buildDocumentUriUsingTree(t, id), modified)
            }
        }
        return out
    }

    fun read(uri: Uri): ByteArray = resolver.openInputStream(uri)?.use { it.readBytes() } ?: throw IOException("Could not open the file")

    // ---------- MediaStore: Documents/arc ----------

    private val collection: Uri get() = MediaStore.Files.getContentUri("external")
    private val relativePath = Environment.DIRECTORY_DOCUMENTS + "/" + LibraryIndex.FOLDER + "/"

    /**
     * A file this install created in Documents/arc: first the address kept when
     * it was created (its name may have become "name (1)" next to an earlier
     * install's file), then by name.
     */
    private fun storeFind(name: String): Uri? {
        prefs.getString("store:$name", null)?.let(Uri::parse)?.let { u ->
            val alive = runCatching {
                resolver.query(u, arrayOf(MediaStore.MediaColumns._ID), null, null, null)?.use { it.moveToFirst() } == true
            }.getOrDefault(false)
            if (alive) return u
            prefs.edit { remove("store:$name") }
        }
        return resolver.query(
            collection,
            arrayOf(MediaStore.MediaColumns._ID),
            "${MediaStore.MediaColumns.RELATIVE_PATH}=? AND ${MediaStore.MediaColumns.DISPLAY_NAME}=?",
            arrayOf(relativePath, name),
            null,
        )?.use { c -> if (c.moveToFirst()) ContentUris.withAppendedId(collection, c.getLong(0)) else null }
    }

    private fun storeWrite(name: String, bytes: ByteArray, mime: String) {
        storeFind(name)?.let { uri ->
            resolver.openOutputStream(uri, "wt")?.use { it.write(bytes) } ?: throw IOException("Could not write $name")
            return
        }
        val values = ContentValues().apply {
            put(MediaStore.MediaColumns.DISPLAY_NAME, name)
            put(MediaStore.MediaColumns.MIME_TYPE, mime)
            put(MediaStore.MediaColumns.RELATIVE_PATH, relativePath)
            put(MediaStore.MediaColumns.IS_PENDING, 1)
        }
        val uri = resolver.insert(collection, values) ?: throw IOException("Could not create $name in Documents/arc")
        try {
            resolver.openOutputStream(uri, "w")?.use { it.write(bytes) } ?: throw IOException("Could not write $name")
            resolver.update(uri, ContentValues().apply { put(MediaStore.MediaColumns.IS_PENDING, 0) }, null, null)
        } catch (e: Exception) {
            runCatching { resolver.delete(uri, null, null) }
            throw e
        }
        prefs.edit { putString("store:$name", uri.toString()) }
    }

    // ---------- the picked folder ----------

    private fun treeWrite(tree: Uri, name: String, bytes: ByteArray, mime: String) {
        val uri = list(tree)[name]?.uri ?: DocumentsContract.createDocument(
            resolver,
            DocumentsContract.buildDocumentUriUsingTree(tree, DocumentsContract.getTreeDocumentId(tree)),
            mime,
            name,
        ) ?: throw IOException("Could not create $name in the folder")
        resolver.openOutputStream(uri, "wt")?.use { it.write(bytes) } ?: throw IOException("Could not write $name")
    }

    companion object {
        const val PAK_MIME = "application/octet-stream"
        const val JSON_MIME = "application/json"

        /** Where the folder picker opens: Documents/arc on the phone's own storage. */
        val INITIAL_FOLDER: Uri = DocumentsContract.buildDocumentUri(
            "com.android.externalstorage.documents",
            "primary:" + Environment.DIRECTORY_DOCUMENTS + "/" + LibraryIndex.FOLDER,
        )

        /**
         * Whether a picked folder is the library's: Documents/arc itself, or a
         * folder that already holds an index or backups. Any other folder is
         * only read from, never adopted, so a mistaken pick can't redirect copies.
         */
        fun isLibraryFolder(tree: Uri, names: Set<String>): Boolean {
            val path = DocumentsContract.getTreeDocumentId(tree).substringAfter(':').trimEnd('/')
            return path.equals(Environment.DIRECTORY_DOCUMENTS + "/" + LibraryIndex.FOLDER, ignoreCase = true) ||
                names.any { isIndex(it) } || names.any { it.endsWith(".pak", ignoreCase = true) }
        }

        /** library.json, and the "library (1).json" an install may have written next to an earlier one. */
        fun isIndex(name: String) = name.startsWith("library") && name.endsWith(".json")
    }
}

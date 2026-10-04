package dev.arc.ep133.data

import android.content.ContentValues
import android.content.Context
import android.net.Uri
import android.os.Environment
import android.provider.DocumentsContract
import android.provider.MediaStore
import androidx.core.content.edit
import dev.arc.ep133.backup.LibraryIndex
import java.io.IOException

/**
 * The library's copy in Documents/arc, which survives uninstalling the app
 * (an addition to the web version). Android deletes an app's own storage on
 * uninstall, and its cloud backup is capped far below one .pak, so the
 * backups live here as well.
 *
 * Two ways in:
 * - Normally through MediaStore, which needs no permission. An app can only
 *   see the files it created itself this way.
 * - After a reinstall those files belong to the old install, so the user
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

    /** Whether the one-time copy of a library that predates this folder is done. */
    var exported: Boolean
        get() = prefs.getBoolean("exported", false)
        set(v) = prefs.edit { putBoolean("exported", v) }

    fun write(name: String, bytes: ByteArray, mime: String) {
        val t = tree
        if (t != null) treeWrite(t, name, bytes, mime) else storeWrite(name, bytes, mime)
    }

    fun delete(name: String) {
        val t = tree
        if (t != null) treeFind(t, name)?.let { DocumentsContract.deleteDocument(resolver, it) } else storeFind(name)?.let { resolver.delete(it, null, null) }
    }

    fun exists(name: String): Boolean = tree?.let { treeFind(it, name) != null } ?: (storeFind(name) != null)

    /** Every file in the picked folder, by name (only with a picked folder). */
    fun list(): Map<String, Uri> {
        val t = tree ?: return emptyMap()
        val root = DocumentsContract.getTreeDocumentId(t)
        val out = LinkedHashMap<String, Uri>()
        resolver.query(
            DocumentsContract.buildChildDocumentsUriUsingTree(t, root),
            arrayOf(DocumentsContract.Document.COLUMN_DOCUMENT_ID, DocumentsContract.Document.COLUMN_DISPLAY_NAME),
            null, null, null,
        )?.use { c ->
            while (c.moveToNext()) {
                val id = c.getString(0) ?: continue
                val name = c.getString(1) ?: continue
                out[name] = DocumentsContract.buildDocumentUriUsingTree(t, id)
            }
        }
        return out
    }

    fun read(uri: Uri): ByteArray = resolver.openInputStream(uri)?.use { it.readBytes() } ?: throw IOException("Could not open the file")

    // ---------- MediaStore: Documents/arc ----------

    private val collection: Uri get() = MediaStore.Files.getContentUri("external")
    private val relativePath = Environment.DIRECTORY_DOCUMENTS + "/" + LibraryIndex.FOLDER + "/"

    /** A file this install created in Documents/arc (others are not visible). */
    private fun storeFind(name: String): Uri? =
        resolver.query(
            collection,
            arrayOf(MediaStore.MediaColumns._ID),
            "${MediaStore.MediaColumns.RELATIVE_PATH}=? AND ${MediaStore.MediaColumns.DISPLAY_NAME}=?",
            arrayOf(relativePath, name),
            null,
        )?.use { c -> if (c.moveToFirst()) android.content.ContentUris.withAppendedId(collection, c.getLong(0)) else null }

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
    }

    // ---------- the picked folder ----------

    @Suppress("UNUSED_PARAMETER")
    private fun treeFind(tree: Uri, name: String): Uri? = list()[name]

    private fun treeWrite(tree: Uri, name: String, bytes: ByteArray, mime: String) {
        val uri = treeFind(tree, name) ?: DocumentsContract.createDocument(
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
    }
}

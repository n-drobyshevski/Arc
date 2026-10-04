package dev.arc.ep133.protocol

/** Anything the device refused or failed to do (session.js DeviceError). */
open class DeviceError(message: String, val status: Int? = null) : Exception(message)

/** The device did not answer a request in time (session.js TimeoutError). */
class TimeoutError(label: String) :
    DeviceError("The device did not answer ($label). Check the cable and try again.")

/**
 * The user cancelled a backup or restore (fs.js CancelledError). Deliberately
 * not a CancellationException: cancelling stops between items, it does not
 * tear down coroutines in the middle of a transfer.
 */
class CancelledError : Exception("Cancelled")

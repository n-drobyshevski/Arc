plugins {
    alias(libs.plugins.android.application) apply false
    alias(libs.plugins.android.lint) apply false
    alias(libs.plugins.kotlin.jvm) apply false
    alias(libs.plugins.kotlin.compose) apply false
    alias(libs.plugins.kotlin.serialization) apply false
    alias(libs.plugins.ksp) apply false
    alias(libs.plugins.room) apply false
}

// ---------- version (version.properties is the only place it is set) ----------
val versionFile = file("version.properties")
val arcVersion: String = java.util.Properties()
    .apply { versionFile.inputStream().use { load(it) } }
    .getProperty("version")
    ?.trim()
    .orEmpty()
val versionParts = Regex("""(\d+)\.(\d{1,2})\.(\d{1,2})""").matchEntire(arcVersion)?.groupValues?.drop(1)?.map(String::toInt)
    ?: throw GradleException("version.properties: version must be MAJOR.MINOR.PATCH with minor and patch below 100, not \"$arcVersion\"")

// Every bump gives a larger versionCode, so a new version installs over the old one.
val arcVersionCode = versionParts[0] * 10000 + versionParts[1] * 100 + versionParts[2]

// Release builds (the tag workflow sets ARC_RELEASE=true) are named exactly the
// version. Other builds are "-dev"; CI adds its run number and commit, so a
// debug log or the settings page says exactly which build it is.
val arcVersionName: String = if (System.getenv("ARC_RELEASE") == "true") {
    arcVersion
} else {
    val run = System.getenv("GITHUB_RUN_NUMBER")?.takeIf { it.isNotBlank() }
    val sha = System.getenv("GITHUB_SHA")?.takeIf { it.length >= 7 }?.take(7)
    "$arcVersion-dev" + (run?.let { ".$it" } ?: "") + (sha?.let { "+$it" } ?: "")
}

extra["arcVersion"] = arcVersion
extra["arcVersionCode"] = arcVersionCode
extra["arcVersionName"] = arcVersionName

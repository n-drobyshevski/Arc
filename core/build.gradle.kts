import org.jetbrains.kotlin.gradle.dsl.JvmTarget

// Pure Kotlin/JVM module: protocol, formats and backup logic. No Android imports,
// so everything here runs in plain JUnit tests.
plugins {
    alias(libs.plugins.kotlin.jvm)
    // Lets the app's lint run NewApi checks over this module against minSdk 29.
    alias(libs.plugins.android.lint)
}

java {
    sourceCompatibility = JavaVersion.VERSION_17
    targetCompatibility = JavaVersion.VERSION_17
}

kotlin {
    compilerOptions {
        jvmTarget.set(JvmTarget.JVM_17)
        freeCompilerArgs.add("-Xjdk-release=17")
    }
}

tasks.withType<JavaCompile>().configureEach { options.release.set(17) }

// The version written into every .pak ("arc 0.4.0"), from version.properties.
val arcVersion = rootProject.extra["arcVersion"] as String
val generateVersion by tasks.registering {
    val out = layout.buildDirectory.dir("generated/version")
    inputs.property("version", arcVersion)
    outputs.dir(out)
    doLast {
        val file = out.get().file("dev/arc/ep133/ArcVersion.kt").asFile
        file.parentFile.mkdirs()
        file.writeText(
            """
            |package dev.arc.ep133
            |
            |/** Generated from version.properties; do not edit. */
            |object ArcVersion {
            |    const val VERSION = "$arcVersion"
            |}
            |""".trimMargin(),
        )
    }
}
kotlin.sourceSets.named("main") { kotlin.srcDir(generateVersion) }

dependencies {
    api(libs.kotlinx.coroutines.core)
    api(libs.kotlinx.serialization.json)

    testImplementation(platform(libs.junit.bom))
    testImplementation(libs.junit.jupiter)
    testImplementation(libs.kotlinx.coroutines.test)
    testRuntimeOnly(libs.junit.platform.launcher)
}

tasks.test {
    useJUnitPlatform()
    // The web version in reference/ is the spec; compatibility tests read its
    // fixture in place instead of keeping a copy.
    val ref = rootProject.file("reference")
    inputs.file(ref.resolve("test/fixtures/sample.pak"))
    inputs.file(ref.resolve("src/backup.js"))
    inputs.file(rootProject.file("version.properties"))
    // The beat card spec: its example card is read in place by the card tests.
    val beatCardSpec = rootProject.file("skill/arc-beats/references/beat-card.md")
    inputs.file(beatCardSpec)
    systemProperty("arc.beatCardSpec", beatCardSpec.absolutePath)
    // Synth lines: the reader cases and the golden renders the skill's script shares, and the recipe cards.
    // -Parc.updateGolden=true writes the golden file afresh instead of comparing.
    val scripts = rootProject.file("skill/arc-beats/scripts")
    inputs.files(rootProject.fileTree("skill/arc-beats") { include("references/*.md", "scripts/test_synth_*.txt") })
    systemProperty("arc.synthCases", scripts.resolve("test_synth_cases.txt").absolutePath)
    systemProperty("arc.synthGolden", scripts.resolve("test_synth_golden.txt").absolutePath)
    systemProperty("arc.synthRecipes", rootProject.file("skill/arc-beats/references/synth-sounds.md").absolutePath)
    systemProperty("arc.updateGolden", providers.gradleProperty("arc.updateGolden").getOrElse("false"))
    systemProperty("arc.referenceDir", ref.absolutePath)
    systemProperty("arc.versionFile", rootProject.file("version.properties").absolutePath)
    systemProperty("junit.jupiter.execution.timeout.default", "60 s")
    testLogging {
        events("failed")
        exceptionFormat = org.gradle.api.tasks.testing.logging.TestExceptionFormat.FULL
    }
}

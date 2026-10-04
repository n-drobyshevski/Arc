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
    systemProperty("arc.referenceDir", ref.absolutePath)
    systemProperty("junit.jupiter.execution.timeout.default", "60 s")
    testLogging {
        events("failed")
        exceptionFormat = org.gradle.api.tasks.testing.logging.TestExceptionFormat.FULL
    }
}

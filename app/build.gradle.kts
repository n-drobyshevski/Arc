import java.io.ByteArrayOutputStream
import javax.inject.Inject

plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.compose)
    alias(libs.plugins.kotlin.serialization)
    alias(libs.plugins.ksp)
    alias(libs.plugins.room)
    alias(libs.plugins.compose.screenshot)
}

// Written by VoiceMixerGoldenTest (the Kotlin mixer), read by the C++ mixer's host test.
val mixerGolden = file("src/test/cpp/voice-mixer.golden")
// Written by FxMathGoldenTest (the Kotlin FX arithmetic), read by the host test and the web test.
val fxMathGolden = file("src/test/cpp/fx-math.golden")

android {
    namespace = "dev.arc.ep133"
    compileSdk = 37
    // Live's native audio engine (src/main/cpp); AGP fetches this NDK where it isn't installed.
    ndkVersion = "29.0.14206865"

    defaultConfig {
        applicationId = "dev.arc.ep133"
        minSdk = 29
        targetSdk = 37
        // From version.properties (see the root build file).
        versionCode = rootProject.extra["arcVersionCode"] as Int
        versionName = rootProject.extra["arcVersionName"] as String

        // Phones and the 64-bit emulator. 32-bit x86 (old emulators) would add 1.6 MB; it plays Live through AudioTrack.
        ndk { abiFilters += listOf("arm64-v8a", "armeabi-v7a", "x86_64") }
        externalNativeBuild {
            // Oboe is built from source and linked into libarc_live.so with the static C++ runtime
            // (src/main/cpp/CMakeLists.txt): no libc++_shared.so or liboboe.so in the app.
            cmake { arguments += "-DANDROID_STL=c++_static" }
        }
    }

    externalNativeBuild {
        cmake {
            path = file("src/main/cpp/CMakeLists.txt")
            version = "4.1.2"
        }
    }

    signingConfigs {
        // A fixed debug key, committed on purpose: every debug build (CI or local)
        // is signed the same way, so a new test build installs over the old one
        // and keeps the backups stored in the app. It only signs debug builds and
        // must never sign a release.
        getByName("debug") {
            storeFile = file("debug.keystore")
            storePassword = "android"
            keyAlias = "androiddebugkey"
            keyPassword = "android"
        }
        // The upload key for Google Play and GitHub releases, only where the environment gives all of it
        // (release.yml, from the repository's secrets). It is never committed.
        val upload = listOf("ARC_UPLOAD_KEYSTORE", "ARC_UPLOAD_KEYSTORE_PASSWORD", "ARC_UPLOAD_KEY_ALIAS", "ARC_UPLOAD_KEY_PASSWORD")
            .map { providers.environmentVariable(it).orNull }
        if (upload.all { !it.isNullOrEmpty() }) {
            create("release") {
                storeFile = file(upload[0]!!)
                storePassword = upload[1]
                keyAlias = upload[2]
                keyPassword = upload[3]
            }
        }
    }

    buildTypes {
        debug {
            signingConfig = signingConfigs.getByName("debug")
        }
        release {
            // The release key, where the build is given it (release.yml); else the release build is unsigned.
            signingConfig = signingConfigs.findByName("release")
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
            // The native engine's symbol table goes in the bundle, so Play Console can read its crashes.
            ndk { debugSymbolLevel = "SYMBOL_TABLE" }
        }
    }

    // arc is in English only: the libraries' translations of their own strings stay out.
    androidResources { localeFilters += "en" }

    packaging {
        resources {
            // Kotlin metadata only reflection reads (arc uses none) and the coroutines debug agent's file.
            // The libraries' META-INF LICENSE files stay: their licences ask for a copy with the app.
            excludes += setOf("META-INF/*.version", "META-INF/*.kotlin_module", "kotlin/**", "DebugProbesKt.bin")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    buildFeatures {
        compose = true
    }

    // Screenshots of @Preview screens (src/screenshotTest), rendered on the JVM; nothing ships in the app.
    experimentalProperties["android.experimental.enableScreenshotTest"] = true

    testOptions {
        unitTests.all {
            it.useJUnitPlatform()
            // The vectors the native mixer's host test checks against (see hostMixerTest below).
            it.systemProperty("arc.mixerGolden", mixerGolden.absolutePath)
            it.systemProperty("arc.fxMathGolden", fxMathGolden.absolutePath)
            it.systemProperty("arc.updateGolden", providers.gradleProperty("arc.updateGolden").getOrElse("false"))
            it.inputs.files(mixerGolden, fxMathGolden)
        }
    }

    lint {
        checkDependencies = true
    }
}

room {
    schemaDirectory("$projectDir/schemas")
}

dependencies {
    implementation(project(":core"))
    implementation(libs.kotlinx.coroutines.android)
    implementation(libs.kotlinx.serialization.json)
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.activity.compose)
    implementation(libs.androidx.lifecycle.runtime.compose)
    implementation(libs.androidx.lifecycle.process)
    implementation(platform(libs.compose.bom))
    implementation(libs.compose.ui)
    implementation(libs.compose.foundation)
    implementation(libs.compose.material3)
    implementation(libs.compose.ui.tooling.preview)
    debugImplementation(libs.compose.ui.tooling)
    implementation(libs.room.runtime)
    implementation(libs.room.ktx)
    ksp(libs.room.compiler)

    screenshotTestImplementation(libs.screenshot.validation.api)
    screenshotTestImplementation(platform(libs.compose.bom))
    screenshotTestImplementation(libs.compose.ui.tooling)

    testImplementation(platform(libs.junit.bom))
    testImplementation(libs.junit.jupiter)
    testRuntimeOnly(libs.junit.platform.launcher)
}

/**
 * Builds and runs the native engine's host test (src/test/cpp) with this
 * machine's own C++ compiler: the C++ VoiceMixer must render exactly what the
 * Kotlin one does (the vectors in [mixerGolden]), the FX bus's arithmetic must
 * give the Kotlin one's bits (the vectors in [fxMathGolden]), and LiveCore must hand sounds,
 * commands and reports over as it says. The Oboe stream and the JNI aren't in
 * it (they need a device). Skipped, saying so, where no compiler is found.
 */
abstract class HostCppTest : DefaultTask() {
    @get:InputFiles
    @get:PathSensitive(PathSensitivity.RELATIVE)
    abstract val sources: ConfigurableFileCollection

    @get:InputFile
    @get:PathSensitive(PathSensitivity.RELATIVE)
    abstract val golden: RegularFileProperty

    @get:InputFile
    @get:PathSensitive(PathSensitivity.RELATIVE)
    abstract val fxGolden: RegularFileProperty

    @get:Internal
    abstract val includeDir: DirectoryProperty

    @get:OutputDirectory
    abstract val outDir: DirectoryProperty

    @get:Inject
    abstract val exec: ExecOperations

    @TaskAction
    fun run() {
        val out = outDir.get().asFile
        val passed = out.resolve("passed")
        passed.delete()
        val path = System.getenv("PATH").orEmpty().split(File.pathSeparator).filter { it.isNotEmpty() }
        fun found(name: String) = File(name).let { it.isAbsolute && it.canExecute() } ||
            path.any { File(it, name).canExecute() }
        val compilers = listOfNotNull(System.getenv("CXX"), "clang++", "g++", "c++").distinct().filter(::found)
        if (compilers.isEmpty()) {
            logger.warn("hostMixerTest: SKIPPED, no host C++ compiler (clang++, g++ or c++) found; the native mixer was not checked")
            return
        }
        val binary = out.resolve("arc-host-test")
        fun compile(compiler: String, sanitize: Boolean): Boolean {
            val flags = listOf("-std=c++17", "-O2", "-ffp-contract=off", "-fno-fast-math", "-Wall", "-Wextra", "-pthread") +
                (if (sanitize) listOf("-fsanitize=address,undefined", "-fno-sanitize-recover=all", "-fno-omit-frame-pointer") else emptyList())
            val result = exec.exec {
                commandLine(
                    listOf(compiler) + flags + listOf("-I", includeDir.get().asFile.absolutePath, "-o", binary.absolutePath) +
                        sources.files.filter { it.extension == "cpp" }.map { it.absolutePath }.sorted(),
                )
                isIgnoreExitValue = sanitize
                // A compiler without the sanitizer runtime fails to link: not worth showing.
                if (sanitize) errorOutput = ByteArrayOutputStream()
            }
            return result.exitValue == 0
        }
        // With AddressSanitizer where a compiler has its runtime (it catches a sound freed under a voice), else plain.
        val sanitized = compilers.firstOrNull { compile(it, sanitize = true) }
        if (sanitized == null) {
            logger.warn("hostMixerTest: no sanitizer runtime found; running without AddressSanitizer")
            compile(compilers.first(), sanitize = false)
        }
        exec.exec { commandLine(binary.absolutePath, golden.get().asFile.absolutePath, fxGolden.get().asFile.absolutePath) }
        passed.writeText("ok\n")
    }
}

val hostMixerTest = tasks.register<HostCppTest>("hostMixerTest") {
    description = "Builds and runs the native Live engine's host test (src/test/cpp) with the host C++ compiler."
    group = "verification"
    val cpp = layout.projectDirectory.dir("src/main/cpp")
    // The parts without Oboe or JNI, and the tests.
    sources.from(fileTree(cpp) { include("VoiceMixer.*", "LiveCore.*", "SpscRing.h", "BufferTuner.h", "fx/*.h") })
    sources.from(fileTree("src/test/cpp") { include("*.cpp", "*.h") })
    golden.set(mixerGolden)
    fxGolden.set(fxMathGolden)
    includeDir.set(cpp)
    outDir.set(layout.buildDirectory.dir("host-test"))
    outputs.upToDateWhen { outDir.get().asFile.resolve("passed").exists() }
}

// `./gradlew test` runs it with the JVM tests.
tasks.matching { it.name == "test" }.configureEach { dependsOn(hostMixerTest) }

// The screenshot previews render one after another in one test JVM: past a hundred and twenty of
// them (Live's SAMPLE card among them), Gradle's default 512 MB heap runs out before the last.
tasks.withType<Test>().matching { it.name.endsWith("ScreenshotTest") }.configureEach { maxHeapSize = "2g" }

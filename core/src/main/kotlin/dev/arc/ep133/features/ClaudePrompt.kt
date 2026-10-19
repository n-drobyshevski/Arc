package dev.arc.ep133.features

/** The families the prompt builder's genres are grouped in, in the order its keys show them. */
enum class GenreFamily { HOUSE, TECHNO, HIP_HOP, BREAKS, BASS, CLUB, CHILL, RIDDIM }

/**
 * A recipe of the arc-beats skill's genres.md the prompt builder offers: its heading there ([name]; the EP-40's
 * without " (EP-40)"), the word on its key ([short]), how a prompt says it ([words]), its `BPM:` range and its
 * card's tempo ([bpm]). The skill's test of genres.md and this list's own keep them the same.
 */
class Genre(
    val id: String,
    val name: String,
    val family: GenreFamily,
    val tempo: IntRange,
    val bpm: Int,
    val short: String = name,
    val words: String = name.lowercase(),
) {
    /** One of the EP-40 Riddim kit's recipes (genres.md's "(EP-40)" ones). */
    val ep40: Boolean get() = family == GenreFamily.RIDDIM
}

object Genres {
    val ALL: List<Genre> = listOf(
        Genre("house", "House", GenreFamily.HOUSE, 120..128, 124),
        Genre("deep-house", "Deep house", GenreFamily.HOUSE, 118..124, 122, "Deep"),
        Genre("tech-house", "Tech house", GenreFamily.HOUSE, 124..128, 126, "Tech"),
        Genre("hip-house", "Hip-house", GenreFamily.HOUSE, 112..124, 118),
        Genre("disco", "Disco and nu-disco", GenreFamily.HOUSE, 112..122, 118, "Disco", "disco"),
        Genre("afro-house", "Afro house", GenreFamily.HOUSE, 118..124, 122, "Afro", "Afro house"),
        Genre("amapiano", "Amapiano", GenreFamily.HOUSE, 108..115, 112),
        Genre("techno", "Techno", GenreFamily.TECHNO, 126..138, 132),
        Genre("detroit", "Detroit techno", GenreFamily.TECHNO, 125..132, 128, "Detroit", "Detroit techno"),
        Genre("minimal", "Minimal techno", GenreFamily.TECHNO, 124..130, 127, "Minimal"),
        Genre("dub-techno", "Dub techno", GenreFamily.TECHNO, 118..126, 122, "Dub"),
        Genre("acid", "Acid techno", GenreFamily.TECHNO, 135..150, 142, "Acid"),
        Genre("hypnotic", "Hypnotic techno", GenreFamily.TECHNO, 128..136, 132, "Hypnotic"),
        Genre("peak-time", "Peak-time techno", GenreFamily.TECHNO, 130..138, 134, "Peak-time"),
        Genre("melodic", "Melodic techno", GenreFamily.TECHNO, 120..126, 122, "Melodic"),
        Genre("industrial", "Industrial techno", GenreFamily.TECHNO, 130..140, 136, "Industrial"),
        Genre("hard-techno", "Hard techno", GenreFamily.TECHNO, 145..160, 152, "Hard"),
        Genre("schranz", "Schranz", GenreFamily.TECHNO, 150..165, 155),
        Genre("hard-groove", "Hard groove", GenreFamily.TECHNO, 135..145, 140),
        Genre("boom-bap", "Boom bap", GenreFamily.HIP_HOP, 84..96, 90),
        Genre("lo-fi", "Lo-fi", GenreFamily.HIP_HOP, 70..86, 76),
        Genre("trap", "Trap", GenreFamily.HIP_HOP, 130..150, 140),
        Genre("drill", "Drill", GenreFamily.HIP_HOP, 138..146, 142),
        Genre("phonk", "Phonk", GenreFamily.HIP_HOP, 130..150, 140),
        Genre("g-funk", "G-funk", GenreFamily.HIP_HOP, 88..100, 94, words = "G-funk"),
        Genre("dnb", "Drum and bass", GenreFamily.BREAKS, 170..176, 174, "DnB"),
        Genre("liquid", "Liquid drum and bass", GenreFamily.BREAKS, 170..176, 174, "Liquid"),
        Genre("jungle", "Jungle", GenreFamily.BREAKS, 160..170, 166),
        Genre("breakcore", "Breakcore", GenreFamily.BREAKS, 160..200, 180),
        Genre("breakbeat", "Breakbeat", GenreFamily.BREAKS, 120..135, 126),
        Genre("electro", "Electro", GenreFamily.BREAKS, 125..135, 128),
        Genre("uk-garage", "UK garage", GenreFamily.BASS, 130..136, 132, "Garage", "UK garage"),
        Genre("bassline", "Bassline", GenreFamily.BASS, 135..140, 137),
        Genre("uk-funky", "UK funky", GenreFamily.BASS, 128..132, 130, words = "UK funky"),
        Genre("grime", "Grime", GenreFamily.BASS, 138..142, 140),
        Genre("dubstep", "Dubstep", GenreFamily.BASS, 138..142, 140),
        Genre("halftime", "Halftime", GenreFamily.BASS, 80..88, 85),
        Genre("jersey-club", "Jersey club", GenreFamily.CLUB, 130..140, 135, "Jersey", "Jersey club"),
        Genre("footwork", "Footwork", GenreFamily.CLUB, 155..165, 160),
        Genre("dembow", "Reggaeton and dembow", GenreFamily.CLUB, 88..98, 94, "Dembow", "reggaeton or dembow"),
        Genre("moombahton", "Moombahton", GenreFamily.CLUB, 108..112, 110, "Moombah"),
        Genre("baile-funk", "Baile funk", GenreFamily.CLUB, 125..135, 130, "Baile"),
        Genre("afrobeats", "Afrobeats", GenreFamily.CLUB, 98..112, 104, words = "Afrobeats"),
        Genre("pop-rock", "Pop and rock backbeat", GenreFamily.CLUB, 90..130, 100, "Pop/rock", "pop or rock backbeat"),
        Genre("trip-hop", "Trip-hop", GenreFamily.CHILL, 84..96, 90),
        Genre("downtempo", "Downtempo", GenreFamily.CHILL, 95..110, 100),
        Genre("neo-soul", "Neo-soul", GenreFamily.CHILL, 80..95, 88),
        Genre("synthwave", "Synthwave", GenreFamily.CHILL, 100..118, 110),
        Genre("one-drop", "One drop", GenreFamily.RIDDIM, 70..80, 76),
        Genre("rockers", "Rockers", GenreFamily.RIDDIM, 75..85, 80),
        Genre("steppers", "Steppers", GenreFamily.RIDDIM, 72..84, 78),
        Genre("dub", "Dub", GenreFamily.RIDDIM, 65..78, 72),
        Genre("digital", "Digital riddim", GenreFamily.RIDDIM, 90..100, 96, "Digital"),
        Genre("dancehall", "Dancehall", GenreFamily.RIDDIM, 96..110, 104),
        Genre("uk-dub", "UK dub", GenreFamily.RIDDIM, 135..145, 140, words = "UK dub"),
    )

    fun of(id: String?): Genre? = ALL.firstOrNull { it.id == id }

    fun inFamily(family: GenreFamily): List<Genre> = ALL.filter { it.family == family }
}

/** What the prompt asks Claude for: the Claude page's tabs. */
enum class PromptTask { BEAT, IMPROVE, TRACK, PLAY, LEARN }

/** A word of the prompt's sentence that can be changed (tapped on the glass). */
enum class PromptSlot { BARS, FEEL, GENRE, TEMPO, KIT, PARTS, GOAL, EDITS, LENGTH, START, LESSON, WAY, LEVEL, SPEED }

/**
 * A feel word before the genre ("dreamy lo-fi"): the skill's genres.md turns each into changes to the recipe (tempo
 * within its range, swing, density, harmony, FX); a prompt takes up to [ClaudePrompt.MAX_FEELS].
 */
enum class Feel { DREAMY, DARK, UPLIFTING, LAID_BACK, DRIVING, AGGRESSIVE, DUSTY, GRITTY, SPACIOUS, MINIMAL, BOUNCY, HYPNOTIC }

/** How a PLAY prompt wants the card taught: finger drumming, step entry, performing it, or its KEYS parts. */
enum class PlayWay { FINGERS, STEPS, PERFORM, KEYS }

/** Who a PLAY prompt teaches: a beginner, someone with some practice, someone sure on the pads. */
enum class PlayLevel { NEW, SOME, SURE }

/** What an IMPROVE prompt asks for besides the edits ([BETTER]: nothing more, as the plain share asks). */
enum class PromptGoal { BETTER, DRIVE, LAID_BACK, BUSIER, SPARSER, SWING, FILL, BASS, MELODY }

/** The parts a new beat gets besides its drums. */
enum class PromptPart { BASS, CHORDS, LEAD, FILL, FX }

/** What a prompt's card is: the scene playing, the shown group's pattern, or the chain. */
enum class SharePick { SCENE, PATTERN, CHAIN }

/**
 * The Claude page's prompt (an addition): its [task] and the choices its sentence shows. [kit] null is the kit Live
 * plays; [genre] null is any style (an IMPROVE keeps its own); [tempo] null leaves it to Claude; [fromPick] has a
 * TRACK continue the card SHARE picks; [text] is the prompt as edited by hand, null while it is built from the rest.
 */
data class ClaudePrompt(
    val task: PromptTask = PromptTask.IMPROVE,
    val bars: Int = 4,
    /** The feel words before the genre, in the order picked (the first leads). */
    val feels: List<Feel> = emptyList(),
    val genre: String? = null,
    val tempo: Int? = null,
    val kit: FactoryKit? = null,
    val parts: Set<PromptPart> = setOf(PromptPart.BASS),
    val goal: PromptGoal = PromptGoal.BETTER,
    val edits: Int = 3,
    val length: Int = 32,
    val fromPick: Boolean = false,
    val lesson: Int = 1,
    val way: PlayWay = PlayWay.FINGERS,
    val level: PlayLevel = PlayLevel.NEW,
    /** A PLAY's starting tempo, in percent of the card's ([SPEEDS]). */
    val speed: Int = 50,
    val text: String? = null,
) {
    /** The prompt goes with a card ([SharePick]): an IMPROVE, a PLAY, or a TRACK that continues one. */
    val withCard: Boolean get() = task == PromptTask.IMPROVE || task == PromptTask.PLAY || task == PromptTask.TRACK && fromPick

    /** The words its sentence shows, in order (the glass's). */
    val slots: List<PromptSlot>
        get() = when (task) {
            PromptTask.BEAT -> listOf(PromptSlot.BARS, PromptSlot.FEEL, PromptSlot.GENRE, PromptSlot.TEMPO, PromptSlot.KIT, PromptSlot.PARTS)
            PromptTask.IMPROVE -> listOf(PromptSlot.GOAL, PromptSlot.GENRE, PromptSlot.EDITS, PromptSlot.KIT)
            PromptTask.TRACK -> listOf(PromptSlot.LENGTH, PromptSlot.FEEL, PromptSlot.GENRE, PromptSlot.TEMPO, PromptSlot.KIT, PromptSlot.START)
            PromptTask.PLAY -> listOf(PromptSlot.WAY, PromptSlot.LEVEL, PromptSlot.SPEED)
            PromptTask.LEARN -> listOf(PromptSlot.LESSON)
        }

    /** Another task, its own words again (a hand-edited text is for the task it was written for). */
    fun withTask(t: PromptTask): ClaudePrompt = if (t == task) this else copy(task = t, text = null)

    /** [f] in or out of the feel words; a third one in lets the first go. */
    fun withFeel(f: Feel): ClaudePrompt = copy(feels = if (f in feels) feels - f else (feels + f).takeLast(MAX_FEELS))

    /** A genre picked: the tempo follows its recipe's; none (any style) leaves the tempo as it is. */
    fun withGenre(g: Genre?): ClaudePrompt = copy(genre = g?.id, tempo = g?.bpm ?: tempo)

    /** As kept in the settings: "key=value" pairs separated by ";", the hand-edited text escaped. */
    fun encode(): String = listOfNotNull(
        "task=${task.name}",
        "bars=$bars",
        feels.takeIf { it.isNotEmpty() }?.let { f -> "feels=${f.joinToString(",") { it.name }}" },
        genre?.let { "genre=$it" },
        tempo?.let { "tempo=$it" },
        kit?.let { "kit=${it.id}" },
        "parts=${PromptPart.entries.filter { it in parts }.joinToString(",") { it.name }}",
        "goal=${goal.name}",
        "edits=$edits",
        "length=$length",
        "pick=$fromPick",
        "lesson=$lesson",
        "way=${way.name}",
        "level=${level.name}",
        "speed=$speed",
        text?.let { "text=${escape(it)}" },
    ).joinToString(";")

    companion object {
        val BARS = listOf(1, 2, 4, 8)
        val EDITS = listOf(1, 3, 5)
        val LENGTHS = listOf(16, 32, 64)
        val SPEEDS = listOf(50, 75, 100)
        const val MAX_FEELS = 2

        /** The lessons of the skill's lessons.md, in order: lesson n is [LESSONS] [n - 1]. */
        val LESSONS = listOf(
            "Meet the pads", "Tempo, bars and counting", "Record your first loop live", "Step by step", "Swing and timing",
            "Loud and quiet", "Rolls and note repeat", "Longer patterns, fills and variation", "Bass and melody in KEYS",
            "Scenes and song", "Effects and performance", "Sampling and chopping",
        )

        /** A tempo a prompt asks for: the beat card's range. */
        val TEMPOS = Tempo.MIN..Tempo.MAX

        /** What [encode] wrote; anything missing or unreadable is the default's. */
        fun decode(s: String): ClaudePrompt {
            val d = ClaudePrompt()
            val map = s.split(";").mapNotNull { p -> p.indexOf('=').takeIf { it > 0 }?.let { p.substring(0, it) to p.substring(it + 1) } }.toMap()
            return ClaudePrompt(
                task = PromptTask.entries.firstOrNull { it.name == map["task"] } ?: d.task,
                bars = map["bars"]?.toIntOrNull()?.takeIf { it in BARS } ?: d.bars,
                feels = map["feels"]?.split(",")?.mapNotNull { n -> Feel.entries.firstOrNull { it.name == n } }?.distinct()?.take(MAX_FEELS) ?: d.feels,
                genre = map["genre"]?.takeIf { Genres.of(it) != null },
                tempo = map["tempo"]?.toIntOrNull()?.takeIf { it in TEMPOS },
                kit = FactoryKit.ofId(map["kit"]),
                parts = map["parts"]?.let { v -> v.split(",").mapNotNull { n -> PromptPart.entries.firstOrNull { it.name == n } }.toSet() } ?: d.parts,
                goal = PromptGoal.entries.firstOrNull { it.name == map["goal"] } ?: d.goal,
                edits = map["edits"]?.toIntOrNull()?.takeIf { it in EDITS } ?: d.edits,
                length = map["length"]?.toIntOrNull()?.takeIf { it in LENGTHS } ?: d.length,
                fromPick = map["pick"]?.toBooleanStrictOrNull() ?: d.fromPick,
                lesson = map["lesson"]?.toIntOrNull()?.takeIf { it in 1..LESSONS.size } ?: d.lesson,
                way = PlayWay.entries.firstOrNull { it.name == map["way"] } ?: d.way,
                level = PlayLevel.entries.firstOrNull { it.name == map["level"] } ?: d.level,
                speed = map["speed"]?.toIntOrNull()?.takeIf { it in SPEEDS } ?: d.speed,
                text = map["text"]?.let(::unescape)?.takeIf { it.isNotBlank() },
            )
        }

        // The text's backslashes, line breaks and the separators (";" between pairs, a new line between saved prompts).
        internal fun escape(s: String) = s.replace("\\", "\\\\").replace("\n", "\\n").replace(";", "\\s")

        internal fun unescape(s: String): String {
            val out = StringBuilder()
            var i = 0
            while (i < s.length) {
                val ch = s[i]
                if (ch == '\\' && i + 1 < s.length) {
                    out.append(
                        when (s[i + 1]) {
                            'n' -> '\n'
                            's' -> ';'
                            else -> s[i + 1]
                        },
                    )
                    i += 2
                } else {
                    out.append(ch)
                    i++
                }
            }
            return out.toString()
        }
    }
}

/** A prompt kept under SAVED on the Claude page: its [name] (the chip's) and the [prompt]. */
data class SavedPrompt(val name: String, val prompt: ClaudePrompt) {
    companion object {
        /** The most the page keeps. */
        const val MAX = 12

        /** As kept in the settings: one a line, "name=...;" before the prompt's [ClaudePrompt.encode]. */
        fun encodeAll(list: List<SavedPrompt>): String =
            list.joinToString("\n") { "name=${ClaudePrompt.escape(it.name)};" + it.prompt.encode() }

        fun decodeAll(s: String): List<SavedPrompt> = s.lines().filter { it.startsWith("name=") }.map { line ->
            val end = line.indexOf(';').let { if (it < 0) line.length else it }
            SavedPrompt(ClaudePrompt.unescape(line.substring(5, end)), ClaudePrompt.decode(line.substring(minOf(end + 1, line.length))))
        }.filter { it.name.isNotBlank() }.take(MAX)
    }
}

package dev.arc.ep133.features

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/** A card's lesson: `lesson` lines, read and checked against the first scene's pads, and written back the same. */
class BeatCardLessonTest {
    private val body = """
        [A] bars 1
        A7 kick  | X... .... X... .... |
        A9 snare | .... X... .... X... |
        A4 hat   | x.x. x.x. x.x. x.x. |
    """.trimIndent()

    private fun read(lessons: String) = BeatCards.read("ARC BEAT 1\nname Lesson beat\ntempo 92\n$lessons\n$body\n")

    @Test
    fun `lesson lines are the steps in order, with their pads, speed and tip`() {
        val r = read("lesson Kick alone | A7 | 50 | Count 1 e and a out loud\nlesson Add the snare | A7 A9 | 50%\nlesson The whole groove | A")
        val steps = r.card!!.lesson
        assertEquals(
            listOf(
                LessonStep("Kick alone", 0, setOf(9), 50, "Count 1 e and a out loud"),
                LessonStep("Add the snare", 0, setOf(9, 11), 50),
                LessonStep("The whole groove", 0, null, 100),
            ),
            steps,
        )
        assertTrue(r.problems.isEmpty(), r.problems.toString())
        // Written back after the header, and read back the same.
        val text = BeatCards.write(r.card!!)
        assertTrue(text.contains("\nlesson Kick alone | A7 | 50 | Count 1 e and a out loud\nlesson Add the snare | A7 A9 | 50\nlesson The whole groove | A\n"), text)
        assertEquals(steps, BeatCards.read(text).card!!.lesson)
    }

    @Test
    fun `a lesson line may come after the sections too, and a card without one has none`() {
        assertEquals(1, BeatCards.read("ARC BEAT 1\n$body\nlesson Hats | A4 | 75\n").card!!.lesson.size)
        assertEquals(emptyList<LessonStep>(), BeatCards.read("ARC BEAT 1\n$body\n").card!!.lesson)
    }

    @Test
    fun `a step with no title, pads of two groups, a pad with no hits or a speed out of range is an error`() {
        fun err(line: String) = read(line).let { r -> assertNull(r.card, line); r.problems.first { it.error }.message }
        assertTrue(err("lesson | A7").contains("title"))
        assertTrue(err("lesson Two groups | A7 B7").contains("one group"))
        assertTrue(err("lesson Clap | A6").contains("A6 has no hits"))
        assertTrue(err("lesson Bass | B").contains("no pad hits in group B"))
        assertTrue(err("lesson Slow | A7 | 10").contains("25 to 100"))
        assertTrue(err("lesson Odd | A7 Q9").contains("'Q9'"))
        val many = (1..13).joinToString("\n") { "lesson Step $it | A7" }
        assertTrue(err(many).contains("more than 12"))
    }

    @Test
    fun `a step's pads read in keypad order, or the group's letter for all of them`() {
        assertEquals("A7 A9 A4", BeatCards.lessonPads(LessonStep("x", 0, setOf(6, 11, 9))))
        assertEquals("B", BeatCards.lessonPads(LessonStep("x", 1, null)))
    }

    @Test
    fun `the practice texts of a lesson`() {
        assertEquals("Step 2/4", dev.arc.ep133.text.PracticeText.step(2, 4))
        assertEquals("1 clean pass to go", dev.arc.ep133.text.PracticeText.toGo(1))
        assertEquals("1 94% ✓ · 2 71% · 3 –", dev.arc.ep133.text.PracticeText.steps(listOf(94 to true, 71 to false, null)))
        assertEquals(
            "- Step 2, Add the snare (A7 A9, 50%): 71% on time over 3 passes; snare came late most",
            dev.arc.ep133.text.PracticeText.reportStep(2, "Add the snare", "A7 A9", 50, dev.arc.ep133.text.PracticeText.reportResult(71, 3, false, "snare came late most")),
        )
    }
}

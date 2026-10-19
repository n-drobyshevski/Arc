package dev.arc.ep133.audio

import dev.arc.ep133.features.LatencyStats
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update

/**
 * The debug screen's latency test (an addition): Live's press-to-sound times
 * for each engine tried this session ([LatencyStats], by
 * [LiveEngineInfo.label]), and each engine's output as it last reported
 * itself, for the estimate under its row. Safe from any thread; the screen
 * reads [state].
 */
class LiveLatency {
    /**
     * The test as it stands: the times, the outputs by label (first opened
     * first) and the label of the one opened last, which Live plays through
     * while it is open ([inUse]).
     */
    data class State(
        val stats: LatencyStats = LatencyStats(),
        val outputs: Map<String, LiveEngineInfo> = emptyMap(),
        val inUse: String? = null,
    ) {
        /** The rows: every engine opened or measured, first first. */
        val engines: List<String> get() = (outputs.keys + stats.engines).distinct()
    }

    private val _state = MutableStateFlow(State())
    val state: StateFlow<State> = _state.asStateFlow()

    /** Live's output opened on [info], or its buffer changed: its row shows it, and it is the one in use. */
    fun opened(info: LiveEngineInfo) = _state.update {
        // A row keeps its place when its engine opens again.
        it.copy(outputs = LinkedHashMap(it.outputs).apply { put(info.label, info) }, inUse = info.label)
    }

    /** A press on [engine] was heard [ms] after the finger came down. */
    fun heard(engine: String, ms: Double) = _state.update { it.copy(stats = it.stats.add(engine, ms)) }

    /** Forgets the times; the engines tried keep their rows. */
    fun reset() = _state.update { it.copy(stats = it.stats.reset()) }
}

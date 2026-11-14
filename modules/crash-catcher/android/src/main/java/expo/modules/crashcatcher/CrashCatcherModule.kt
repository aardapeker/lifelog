package expo.modules.crashcatcher

import android.app.ActivityManager
import android.app.ApplicationExitInfo
import android.content.Context
import android.os.Build
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * Lifelog's JavaScript crash log can't see crashes inside Android (Java/Kotlin exceptions in native
 * modules, or the process being killed). This module:
 *  - catches uncaught Java/Kotlin exceptions and writes the stack trace to a file before the app dies
 *  - keeps a "breadcrumb" (what the app was doing, e.g. "radio: writing talks"), written to disk
 *    at once, so even a crash that leaves no stack trace says where it happened
 *  - on the next start, also asks Android why the app last ended (native crash, out of memory, ANR…)
 */
class CrashCatcherModule : Module() {
  private val context: Context?
    get() = appContext.reactContext?.applicationContext

  private fun crashFile(c: Context) = File(c.filesDir, "native-crash.txt")
  private fun prefs(c: Context) = c.getSharedPreferences("crash-catcher", Context.MODE_PRIVATE)
  private fun stamp(t: Long) = SimpleDateFormat("dd.MM HH:mm:ss", Locale.US).format(Date(t))

  override fun definition() = ModuleDefinition {
    Name("CrashCatcher")

    OnCreate { install() }

    Function("install") { install() }

    /** What the app is doing right now (kept on disk, so it survives a crash). */
    Function("breadcrumb") { text: String ->
      val c = context ?: return@Function null
      prefs(c).edit().putString("crumb", text).putLong("crumbAt", System.currentTimeMillis()).commit()
      null
    }

    /** The last native crash (or abnormal exit) since it was last read, as text; null if none. */
    Function("lastCrash") {
      val c = context ?: return@Function null
      val p = prefs(c)
      val parts = mutableListOf<String>()
      val f = crashFile(c)
      if (f.exists()) parts.add(f.readText())
      // why Android ended the app last time (Android 11+): catches native crashes, OOM, ANRs too
      if (Build.VERSION.SDK_INT >= 30) {
        try {
          val am = c.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
          val last = am.getHistoricalProcessExitReasons(c.packageName, 0, 1).firstOrNull()
          val seen = p.getLong("exitSeen", 0)
          if (last != null && last.timestamp > seen && isBad(last.reason)) {
            parts.add("Android: ${reasonName(last.reason)} at ${stamp(last.timestamp)}" + (last.description?.let { "\n$it" } ?: "") +
              (if (last.reason == ApplicationExitInfo.REASON_LOW_MEMORY || last.pss > 0) "\nmemory: ${last.pss / 1024} MB" else ""))
            // a native crash leaves a tombstone (Android 12+): the library and function names in it say what broke
            if (Build.VERSION.SDK_INT >= 31 && last.reason == ApplicationExitInfo.REASON_CRASH_NATIVE) {
              try {
                last.traceInputStream?.use { parts.add("Where (native):\n" + tombstoneClues(it.readBytes())) }
              } catch (_: Throwable) {}
            }
          }
          if (last != null) p.edit().putLong("exitSeen", last.timestamp).commit()
        } catch (_: Throwable) {}
      }
      if (parts.isEmpty()) return@Function null
      val crumb = p.getString("crumb", null)
      if (crumb != null) parts.add(0, "Was doing: $crumb (${stamp(p.getLong("crumbAt", 0))})")
      parts.joinToString("\n\n")
    }

    /** How long ago Android started this app's process, in ms (the zero point of the speed measurements). */
    Function("processAgeMs") {
      android.os.SystemClock.elapsedRealtime() - android.os.Process.getStartElapsedRealtime()
    }

    Function("clear") {
      val c = context ?: return@Function null
      crashFile(c).delete()
      null
    }
  }

  /**
   * The tombstone is a protobuf; instead of a protobuf parser, pull out its readable strings and keep
   * the telling ones: the abort message, the signal, and the libraries and functions of the stack.
   */
  private fun tombstoneClues(bytes: ByteArray): String {
    val strings = mutableListOf<String>()
    val run = StringBuilder()
    for (b in bytes) {
      val ch = b.toInt() and 0xff
      if (ch in 0x20..0x7e) run.append(ch.toChar())
      else {
        if (run.length >= 5) strings.add(run.toString())
        run.setLength(0)
      }
    }
    if (run.length >= 5) strings.add(run.toString())
    val hex = Regex("^[0-9a-f\"']{16,}.?$")
    val word = Regex("^[A-Za-z][A-Za-z0-9_\\-.:]{2,24}$") // thread names ("mqt_v_js", "hermes-gc"), short symbols
    val telling = strings.map { it.trim() }.filter {
      !hex.matches(it) && (
        it.contains(".so") || it.contains("::") || it.startsWith("SIG") || it.startsWith("SEGV") || it.startsWith("BUS_") ||
          it.contains("abort", true) || it.contains("assert", true) || it.contains("hermes", true) || it.contains("Exception") ||
          word.matches(it))
    }.map { it.substringAfterLast('/').take(160) }
    return telling.distinct().take(60).joinToString("\n")
  }

  private fun isBad(reason: Int) = when (reason) {
    ApplicationExitInfo.REASON_CRASH, ApplicationExitInfo.REASON_CRASH_NATIVE, ApplicationExitInfo.REASON_ANR,
    ApplicationExitInfo.REASON_LOW_MEMORY, ApplicationExitInfo.REASON_INITIALIZATION_FAILURE -> true
    else -> false
  }

  private fun reasonName(reason: Int) = when (reason) {
    ApplicationExitInfo.REASON_CRASH -> "Java/Kotlin crash"
    ApplicationExitInfo.REASON_CRASH_NATIVE -> "native (C++) crash"
    ApplicationExitInfo.REASON_ANR -> "froze (not responding)"
    ApplicationExitInfo.REASON_LOW_MEMORY -> "killed: out of memory"
    ApplicationExitInfo.REASON_INITIALIZATION_FAILURE -> "failed to start"
    else -> "reason $reason"
  }

  private fun install() {
    val c = context ?: return
    if (installed) return
    installed = true
    val previous = Thread.getDefaultUncaughtExceptionHandler()
    Thread.setDefaultUncaughtExceptionHandler { thread, error ->
      try {
        val trace = error.stackTraceToString().lines().take(40).joinToString("\n")
        crashFile(c).writeText("Crash on thread \"${thread.name}\" at ${stamp(System.currentTimeMillis())}\n$trace")
      } catch (_: Throwable) {}
      previous?.uncaughtException(thread, error)
    }
  }

  companion object {
    @Volatile private var installed = false
  }
}

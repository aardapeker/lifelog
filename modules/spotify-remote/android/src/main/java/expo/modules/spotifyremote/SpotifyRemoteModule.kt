package expo.modules.spotifyremote

import android.content.Context
import android.os.Handler
import android.os.Looper
import com.spotify.android.appremote.api.ConnectionParams
import com.spotify.android.appremote.api.Connector
import com.spotify.android.appremote.api.SpotifyAppRemote
import com.spotify.protocol.client.CallResult
import com.spotify.protocol.client.Subscription
import com.spotify.protocol.types.Empty
import com.spotify.protocol.types.PlayerState
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Talks to the Spotify app on the same phone (Spotify App Remote SDK), instead of going through
 * Spotify's servers: commands can't be "accepted and ignored", and it works in the background.
 */
class SpotifyRemoteModule : Module() {
  private var remote: SpotifyAppRemote? = null
  private var stateSub: Subscription<PlayerState>? = null
  private val main = Handler(Looper.getMainLooper())

  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  override fun definition() = ModuleDefinition {
    Name("SpotifyRemote")

    // every change in Spotify's player (song, pause, position jumps) arrives here, also in the background
    Events("onPlayerState")

    Function("isSpotifyInstalled") {
      SpotifyAppRemote.isSpotifyInstalled(context)
    }

    Function("isConnected") {
      remote?.isConnected == true
    }

    AsyncFunction("connect") { clientId: String, redirectUri: String, showAuth: Boolean, promise: Promise ->
      val current = remote
      if (current != null && current.isConnected) {
        promise.resolve(true)
        return@AsyncFunction
      }
      val params = ConnectionParams.Builder(clientId)
        .setRedirectUri(redirectUri)
        .showAuthView(showAuth)
        .build()
      main.post {
        SpotifyAppRemote.connect(context, params, object : Connector.ConnectionListener {
          override fun onConnected(appRemote: SpotifyAppRemote) {
            remote = appRemote
            watch(appRemote)
            promise.resolve(true)
          }

          override fun onFailure(error: Throwable) {
            promise.reject("E_SPOTIFY_CONNECT", "${error.javaClass.simpleName}: ${error.message ?: "no details"}", error)
          }
        })
      }
    }

    AsyncFunction("play") { uri: String, promise: Promise -> runCommand(promise) { it.playerApi.play(uri) } }
    AsyncFunction("queue") { uri: String, promise: Promise -> runCommand(promise) { it.playerApi.queue(uri) } }
    AsyncFunction("pause") { promise: Promise -> runCommand(promise) { it.playerApi.pause() } }
    AsyncFunction("resume") { promise: Promise -> runCommand(promise) { it.playerApi.resume() } }
    AsyncFunction("skipNext") { promise: Promise -> runCommand(promise) { it.playerApi.skipNext() } }
    AsyncFunction("switchToPhone") { promise: Promise -> runCommand(promise) { it.connectApi.connectSwitchToLocalDevice() } }

    AsyncFunction("getState") { promise: Promise ->
      val r = connected(promise) ?: return@AsyncFunction
      r.playerApi.playerState
        .setResultCallback { state -> promise.resolve(toMap(state)) }
        .setErrorCallback { error -> promise.reject("E_SPOTIFY", error.message ?: "getState failed", error) }
    }

    Function("disconnect") {
      stateSub?.cancel()
      stateSub = null
      remote?.let { SpotifyAppRemote.disconnect(it) }
      remote = null
    }

    OnDestroy {
      stateSub?.cancel()
      remote?.let { SpotifyAppRemote.disconnect(it) }
      remote = null
    }
  }

  private fun connected(promise: Promise): SpotifyAppRemote? {
    val r = remote
    if (r == null || !r.isConnected) {
      promise.reject("E_SPOTIFY_NOT_CONNECTED", "Not connected to the Spotify app", null)
      return null
    }
    return r
  }

  /** Runs one player command and settles the promise with its result. */
  private fun runCommand(promise: Promise, command: (SpotifyAppRemote) -> CallResult<Empty>) {
    val r = connected(promise) ?: return
    command(r)
      .setResultCallback { promise.resolve(true) }
      .setErrorCallback { error -> promise.reject("E_SPOTIFY", error.message ?: "Spotify command failed", error) }
  }

  private fun watch(r: SpotifyAppRemote) {
    stateSub?.cancel()
    stateSub = r.playerApi.subscribeToPlayerState().setEventCallback { state ->
      sendEvent("onPlayerState", toMap(state))
    }
  }

  private fun toMap(state: PlayerState): Map<String, Any?> = mapOf(
    "uri" to state.track?.uri,
    "name" to state.track?.name,
    "artist" to state.track?.artist?.name,
    "durationMs" to (state.track?.duration ?: 0L).toDouble(),
    "positionMs" to state.playbackPosition.toDouble(),
    "paused" to state.isPaused,
  )
}

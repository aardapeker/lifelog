# Spotify App Remote SDK, applied to the app when it's minified (consumer rules).
# The SDK maps its messages with Gson through reflection: keep its classes as they are.
-keep class com.spotify.** { *; }
-keepattributes Signature, *Annotation*, InnerClasses, EnclosingMethod
# Optional pieces the SDK references but doesn't need with Gson
-dontwarn com.fasterxml.jackson.**
-dontwarn com.spotify.base.annotations.**

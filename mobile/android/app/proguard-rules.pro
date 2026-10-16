# Flutter keeps what it needs. Add app-specific rules here if a release build strips something.
-keep class io.flutter.** { *; }

# Suppress warnings for optional Play Store deferred components in Flutter embedding
-dontwarn com.google.android.play.core.**


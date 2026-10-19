# kotlinx.serialization: keep generated serializers for @Serializable classes.
-keepattributes *Annotation*, InnerClasses
-keepclassmembers @kotlinx.serialization.Serializable class ** {
    *** Companion;
    kotlinx.serialization.KSerializer serializer(...);
}

# Live's native engine (libarc_live.so) binds these by name.
-keep class dev.arc.ep133.audio.NativeAudio {
    native <methods>;
}

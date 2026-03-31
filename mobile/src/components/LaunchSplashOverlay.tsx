import { LinearGradient } from 'expo-linear-gradient';
import { useCallback, useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppLogo } from './AppLogo';

const SPLASH_BG = '#0B1220';
/** Oturum hazır olsa bile en az bu kadar kalır; logo/metin okunabilsin. */
const MIN_VISIBLE_MS = 3100;
const MAX_WAIT_MS = 12000;

type Props = {
  authReady: boolean;
  onFinished: () => void;
};

/**
 * İlk açılışta native splash ile uyumlu kısa marka animasyonu; `assets/logo.png` (uygulama ikonu).
 */
export function LaunchSplashOverlay({ authReady, onFinished }: Props) {
  const startedAt = useRef(Date.now());
  const finishedRef = useRef(false);
  const logoScale = useRef(new Animated.Value(0.72)).current;
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const titleOpacity = useRef(new Animated.Value(0)).current;
  const tagOpacity = useRef(new Animated.Value(0)).current;
  const rootOpacity = useRef(new Animated.Value(1)).current;

  const runExit = useCallback(() => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    Animated.timing(rootOpacity, {
      toValue: 0,
      duration: 580,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) onFinished();
    });
  }, [onFinished, rootOpacity]);

  useEffect(() => {
    Animated.parallel([
      Animated.spring(logoScale, {
        toValue: 1,
        friction: 7,
        tension: 88,
        useNativeDriver: true,
      }),
      Animated.timing(logoOpacity, {
        toValue: 1,
        duration: 400,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();

    Animated.sequence([
      Animated.delay(240),
      Animated.timing(titleOpacity, {
        toValue: 1,
        duration: 360,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();

    Animated.sequence([
      Animated.delay(400),
      Animated.timing(tagOpacity, {
        toValue: 1,
        duration: 340,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }, [logoOpacity, logoScale, tagOpacity, titleOpacity]);

  useEffect(() => {
    const tryExit = () => {
      if (!authReady) return;
      const elapsed = Date.now() - startedAt.current;
      const wait = Math.max(0, MIN_VISIBLE_MS - elapsed);
      return wait;
    };

    if (!authReady) {
      const maxTimer = setTimeout(() => {
        runExit();
      }, MAX_WAIT_MS);
      return () => clearTimeout(maxTimer);
    }

    const wait = tryExit();
    const t = setTimeout(() => runExit(), wait);
    return () => clearTimeout(t);
  }, [authReady, runExit]);

  return (
    <Animated.View
      pointerEvents="auto"
      style={[StyleSheet.absoluteFillObject, styles.layer, { opacity: rootOpacity }]}
    >
      <LinearGradient
        colors={['#0B1220', '#0F172A', '#111827']}
        start={{ x: 0.2, y: 0 }}
        end={{ x: 0.9, y: 1 }}
        style={StyleSheet.absoluteFillObject}
      />
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <Animated.View
            style={{
              opacity: logoOpacity,
              transform: [{ scale: logoScale }],
              shadowColor: '#38BDF8',
              shadowOffset: { width: 0, height: 0 },
              shadowOpacity: 0.35,
              shadowRadius: 24,
              elevation: 12,
            }}
          >
            <AppLogo size={104} />
          </Animated.View>
          <Animated.Text style={[styles.title, { opacity: titleOpacity }]}>RouteWise</Animated.Text>
          <Animated.Text style={[styles.tagline, { opacity: tagOpacity }]}>
            Rotaların, tek yerde
          </Animated.Text>
        </View>
      </SafeAreaView>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  layer: {
    backgroundColor: SPLASH_BG,
    zIndex: 100000,
  },
  safe: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 14,
  },
  title: {
    marginTop: 8,
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.5,
    color: 'rgba(255,255,255,0.96)',
  },
  tagline: {
    fontSize: 15,
    fontWeight: '600',
    color: 'rgba(148,163,184,0.95)',
    letterSpacing: 0.2,
  },
});

import { LinearGradient } from 'expo-linear-gradient';
import type { NavigationContainerRef } from '@react-navigation/native';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { RootStackParamList } from '../navigation/types';
import { setAppOnboardingDoneForUser } from '../services/appOnboardingStorage';
import { useAppTheme } from '../ThemeContext';
import type { AppTheme } from '../theme';

type TabTarget = 'HomeTab' | 'DiscoverTab' | 'ProfileTab';

type Step = {
  title: string;
  body: string;
  tab: TabTarget;
};

const STEPS: Step[] = [
  {
    tab: 'HomeTab',
    title: 'RouteWise’e hoş geldin',
    body:
      'Gezilerini duraklar, süre, masraf ve yakıt ile planla; arkadaşlarınla paylaş. Rota sunumu ve Yer keşfet ile rotanı ve tek tek yerleri görsel olarak keşfet; kaydettiğin yerler Keşfet sekmesinde özet kartlarla durur. Bu turda alt menüdeki ana bölümleri göreceksin.',
  },
  {
    tab: 'HomeTab',
    title: 'Ana sayfa',
    body:
      'Rotaların burada: ara, duruma göre süz. Yeni Gezi Planı oluşturabilirsin. Yer keşfet ile bir yer adı arayıp seçtiğinde, rota sunumundaki gibi üstte görsel, altta özet ve yorumlarla tam ekran bir sunum açılır. Bir gezinin içinden Rota sunumuna girerek duraklarını sırayla gezebilirsin. Hava kartı ve bildirim zili de burada.',
  },
  {
    tab: 'DiscoverTab',
    title: 'Keşfet sekmesi',
    body:
      'Skor, sıralama ve topluluk anketleri burada. «Kaydettiğin yerler» satırında profilden kaydettiğin mekânlar görsel özet ve yorum özetiyle listelenir; özetler cihazda önbelleğe alınır. Bir karta uzun basarak kaydı kaldırabilirsin. Ana sayfadaki Yer keşfet ise yeni yer aramak ve sunum açmak içindir. Arkadaşlar için Keşfet ve Ana sayfa kartlarını kullan.',
  },
  {
    tab: 'ProfileTab',
    title: 'Profil',
    body:
      'Adın, telefonun, masraf türlerin ve tema seçimin burada. Kaydettiğin yerler listesi de profilde; Yer keşfet içinden «Kaydet» ile eklediğin mekânlar hem profilde hem Keşfet’teki kartlarda görünür. İstersen Açık, Koyu, Okyanus, Gün batımı veya Orman temalarından birini seç.',
  },
  {
    tab: 'HomeTab',
    title: 'Hazırsın',
    body:
      'Alt menüden sekmeler arasında geçebilirsin. Planını kur; rota sunumu, yer keşfet ve Keşfet’teki kayıtlı yer kartlarıyla deneyimi tamamla. İyi yolculuklar.',
  },
];

function navigateToTab(
  ref: NavigationContainerRef<RootStackParamList>,
  tab: TabTarget
): void {
  if (!ref.isReady()) return;
  switch (tab) {
    case 'HomeTab':
      ref.navigate('Main', { screen: 'HomeTab', params: { screen: 'Home' } });
      break;
    case 'DiscoverTab':
      ref.navigate('Main', { screen: 'DiscoverTab', params: { screen: 'Discover', params: undefined } });
      break;
    case 'ProfileTab':
      ref.navigate('Main', { screen: 'ProfileTab', params: { screen: 'Profile' } });
      break;
    default:
      break;
  }
}

type Props = {
  visible: boolean;
  userId: string;
  navigationRef: NavigationContainerRef<RootStackParamList>;
  onFinished: () => void;
};

export function AppOnboardingTour({ visible, userId, navigationRef, onFinished }: Props) {
  const theme = useAppTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(theme, insets.bottom), [theme, insets.bottom]);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (!visible) {
      setIndex(0);
      return;
    }
    setIndex(0);
    const t = setTimeout(() => navigateToTab(navigationRef, STEPS[0].tab), 80);
    return () => clearTimeout(t);
  }, [visible, navigationRef]);

  const step = STEPS[index] ?? STEPS[0];
  const isLast = index >= STEPS.length - 1;

  const finish = useCallback(async () => {
    await setAppOnboardingDoneForUser(userId);
    navigateToTab(navigationRef, 'HomeTab');
    onFinished();
  }, [userId, navigationRef, onFinished]);

  const goNext = useCallback(() => {
    if (isLast) {
      void finish();
      return;
    }
    const next = index + 1;
    setIndex(next);
    navigateToTab(navigationRef, STEPS[next].tab);
  }, [index, isLast, navigationRef, finish]);

  const goBack = useCallback(() => {
    if (index <= 0) return;
    const prev = index - 1;
    setIndex(prev);
    navigateToTab(navigationRef, STEPS[prev].tab);
  }, [index, navigationRef]);

  const skip = useCallback(() => {
    void finish();
  }, [finish]);

  const grad: [string, string] = [theme.color.primary, theme.color.primaryDark];

  if (!visible) return null;

  return (
    <Modal visible transparent animationType="fade" statusBarTranslucent onRequestClose={skip}>
      <View style={styles.backdrop}>
        <LinearGradient colors={grad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.stepPill}>
              {index + 1} / {STEPS.length}
            </Text>
            <Pressable onPress={skip} style={({ pressed }) => [styles.skipBtn, pressed && { opacity: 0.85 }]}>
              <Text style={styles.skipBtnText}>Atla</Text>
            </Pressable>
          </View>
          <Text style={styles.title}>{step.title}</Text>
          <Text style={styles.body}>{step.body}</Text>
          <View style={styles.dots}>
            {STEPS.map((_, i) => (
              <View key={i} style={[styles.dot, i === index && styles.dotActive]} />
            ))}
          </View>
          <View style={styles.actions}>
            <Pressable
              onPress={goBack}
              disabled={index === 0}
              style={({ pressed }) => [
                styles.secondaryBtn,
                index === 0 && styles.secondaryBtnDisabled,
                pressed && index > 0 && { opacity: 0.88 },
              ]}
            >
              <Text style={[styles.secondaryBtnText, index === 0 && styles.secondaryBtnTextDisabled]}>
                Geri
              </Text>
            </Pressable>
            <Pressable
              onPress={goNext}
              style={({ pressed }) => [styles.primaryBtn, pressed && { opacity: 0.92 }]}
            >
              <Text style={styles.primaryBtnText}>{isLast ? 'Başla' : 'İleri'}</Text>
            </Pressable>
          </View>
          <Text style={styles.hint}>Alttaki sekmeler şu an seçilen bölüme göre vurgulanır.</Text>
        </LinearGradient>
        <View style={{ height: Math.max(insets.bottom, 12) }} />
      </View>
    </Modal>
  );
}

function createStyles(theme: AppTheme, bottomInset: number) {
  return StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: theme.color.overlayDark,
      justifyContent: 'flex-end',
      paddingHorizontal: theme.space.md,
      paddingBottom: Math.max(bottomInset, theme.space.md),
    },
    card: {
      borderRadius: theme.radius.xl,
      padding: theme.space.lg,
      maxWidth: 440,
      width: '100%',
      alignSelf: 'center',
      marginBottom: theme.space.sm,
      ...theme.shadowCard,
    },
    cardHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: theme.space.md,
    },
    stepPill: {
      color: 'rgba(255,255,255,0.9)',
      fontSize: theme.font.tiny,
      fontWeight: '800',
      letterSpacing: 0.5,
      backgroundColor: 'rgba(0,0,0,0.2)',
      paddingVertical: 6,
      paddingHorizontal: 12,
      borderRadius: theme.radius.pill,
      overflow: 'hidden',
    },
    skipBtn: { paddingVertical: 8, paddingHorizontal: 12 },
    skipBtnText: {
      color: 'rgba(255,255,255,0.95)',
      fontSize: theme.font.small,
      fontWeight: '800',
    },
    title: {
      color: '#FFFFFF',
      fontSize: theme.font.h2,
      fontWeight: '900',
      letterSpacing: -0.3,
      marginBottom: theme.space.sm,
    },
    body: {
      color: 'rgba(255,255,255,0.92)',
      fontSize: theme.font.body,
      lineHeight: 24,
      fontWeight: '600',
    },
    dots: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginTop: theme.space.lg,
      marginBottom: theme.space.md,
    },
    dot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: 'rgba(255,255,255,0.35)',
    },
    dotActive: {
      width: 22,
      backgroundColor: '#FFFFFF',
    },
    actions: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: theme.space.sm,
    },
    secondaryBtn: {
      flex: 1,
      paddingVertical: 14,
      borderRadius: theme.radius.pill,
      borderWidth: 1.5,
      borderColor: 'rgba(255,255,255,0.55)',
      alignItems: 'center',
    },
    secondaryBtnDisabled: {
      borderColor: 'rgba(255,255,255,0.2)',
    },
    secondaryBtnText: {
      color: '#FFFFFF',
      fontSize: theme.font.body,
      fontWeight: '800',
    },
    secondaryBtnTextDisabled: {
      color: 'rgba(255,255,255,0.35)',
    },
    primaryBtn: {
      flex: 1.2,
      paddingVertical: 14,
      borderRadius: theme.radius.pill,
      backgroundColor: '#FFFFFF',
      alignItems: 'center',
    },
    primaryBtnText: {
      color: theme.color.primaryDark,
      fontSize: theme.font.body,
      fontWeight: '900',
    },
    hint: {
      marginTop: theme.space.md,
      color: 'rgba(255,255,255,0.75)',
      fontSize: theme.font.tiny,
      textAlign: 'center',
      lineHeight: 18,
      fontWeight: '600',
    },
  });
}

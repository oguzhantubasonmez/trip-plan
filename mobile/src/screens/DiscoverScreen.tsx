import { useFocusEffect } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { auth } from '../lib/firebase';
import {
  createDiscoverPoll,
  loadDiscoverScreenData,
  voteDiscoverPoll,
  type DiscoverScreenPayload,
} from '../services/discover';
import { filterMutualFriendUids } from '../services/friends';
import { getPlaceDetails } from '../services/places';
import { getUserProfile, removeSavedPlaceForUser, type SavedPlaceEntry } from '../services/userProfile';
import { PlaceDiscoverModal } from '../components/PlaceDiscoverModal';
import { PollVoteNamesModal } from '../components/PollVoteNamesModal';
import { PrimaryButton } from '../components/PrimaryButton';
import { Screen } from '../components/Screen';
import { TextField } from '../components/TextField';
import { listDiscoverPollVoters } from '../services/pollVoters';
import {
  BADGE_TIER_LABELS,
  DISCOVER_SCORE_LEGEND_MIN,
  DISCOVER_SCORE_TRAVELER_MIN,
  type BadgeTierId,
} from '../types/gamification';
import { useAppTheme, useThemeMode } from '../ThemeContext';
import type { AppTheme } from '../theme';
import type { DiscoverSecondStopPayload } from '../navigation/types';
import type { StopPresentationPayload } from '../utils/presentationModel';
import { buildDiscoverSpotlightPayload } from '../utils/discoverSpotlightPayload';
import { POLL_MAX_OPTIONS, POLL_MIN_OPTIONS } from '../utils/pollFirestore';
import {
  readSavedPlaceDiscoverCache,
  removeSavedPlaceDiscoverCache,
  writeSavedPlaceDiscoverCache,
} from '../utils/savedPlacesDiscoverCache';
import { fetchPresentationWebForPlaceSpotlight } from '../utils/stopWebEnrichment';

type SavedRowState = {
  entry: SavedPlaceEntry;
  status: 'loading' | 'ready' | 'error';
  payload?: StopPresentationPayload;
};

export function DiscoverScreen(props: {
  onOpenFriends: () => void;
  focusPollId?: string;
  onNavigateCreateTripWithSecondStop: (payload: DiscoverSecondStopPayload) => void;
  onOpenTrip: (tripId: string) => void;
}) {
  const theme = useAppTheme();
  const { mode } = useThemeMode();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const uid = auth.currentUser?.uid;

  const [data, setData] = useState<DiscoverScreenPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pollBusy, setPollBusy] = useState(false);
  const [createPollOpen, setCreatePollOpen] = useState(false);
  const [createTitle, setCreateTitle] = useState('');
  const [optionDrafts, setOptionDrafts] = useState<string[]>(() => ['', '']);
  const [selectedFriendIds, setSelectedFriendIds] = useState<Set<string>>(() => new Set());
  const [mutualFriends, setMutualFriends] = useState<{ uid: string; label: string }[]>([]);
  const [mutualLoading, setMutualLoading] = useState(false);
  const [createBusy, setCreateBusy] = useState(false);
  const [pollTip, setPollTip] = useState<{
    pollId: string;
    optionIndex: number;
    letter: string;
    optionText: string;
  } | null>(null);
  const [pollTipNames, setPollTipNames] = useState<string[]>([]);
  const [pollTipLoading, setPollTipLoading] = useState(false);
  const [pollTipError, setPollTipError] = useState<string | null>(null);
  const pollTipHoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [savedRows, setSavedRows] = useState<SavedRowState[]>([]);
  const [placeDiscoverOpen, setPlaceDiscoverOpen] = useState(false);
  const [discoverSeedPlaceId, setDiscoverSeedPlaceId] = useState<string | null>(null);
  const [discoverSeedPayload, setDiscoverSeedPayload] = useState<StopPresentationPayload | null>(null);

  const clearDiscoverSeed = useCallback(() => {
    setDiscoverSeedPlaceId(null);
    setDiscoverSeedPayload(null);
  }, []);

  const heroGrad = useMemo((): [string, string, string] => {
    if (mode === 'light') return ['#38BDF8', '#A78BFA', '#FB923C'];
    return ['#7C3AED', '#DB2777', '#F59E0B'];
  }, [mode]);

  const heroGradEnd = useMemo((): [string, string] => {
    if (mode === 'light') return ['#E0F2FE', '#FFF7ED'];
    return ['#1E1B4B', '#312E81'];
  }, [mode]);

  const load = useCallback(async () => {
    if (!uid) {
      setData(null);
      setLoading(false);
      setError(null);
      return;
    }
    setError(null);
    const fid = props.focusPollId?.trim() || undefined;
    try {
      const payload = await loadDiscoverScreenData(uid, fid ? { focusPollId: fid } : undefined);
      setData(payload);
    } catch (e: any) {
      setError(e?.message || 'Keşfet verileri yüklenemedi.');
      setData(null);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [uid, props.focusPollId]);

  const onRefresh = useCallback(() => {
    if (!uid) return;
    setRefreshing(true);
    void load();
  }, [uid, load]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      void load();
    }, [load])
  );

  useFocusEffect(
    useCallback(() => {
      if (!uid) {
        setSavedRows([]);
        return;
      }
      let cancelled = false;
      void (async () => {
        const profile = await getUserProfile(uid);
        if (cancelled) return;
        const list = profile?.savedPlaces ?? [];
        const initial: SavedRowState[] = [];
        for (const entry of list) {
          const cached = await readSavedPlaceDiscoverCache(entry.googlePlaceId);
          initial.push(
            cached
              ? { entry, status: 'ready', payload: cached }
              : { entry, status: 'loading' }
          );
        }
        if (!cancelled) setSavedRows(initial);

        for (const entry of list) {
          if (cancelled) break;
          const id = entry.googlePlaceId;
          const hadCache = initial.find((r) => r.entry.googlePlaceId === id)?.payload;
          if (hadCache) continue;
          try {
            const details = await getPlaceDetails(id);
            const web = await fetchPresentationWebForPlaceSpotlight({
              locationName: details.name,
              coords: { latitude: details.latitude, longitude: details.longitude },
              googlePlaceId: id,
              placeRating:
                details.rating != null && details.rating > 0 ? details.rating : undefined,
              placeUserRatingsTotal:
                details.userRatingsTotal != null && details.userRatingsTotal > 0
                  ? details.userRatingsTotal
                  : undefined,
            });
            const payload = buildDiscoverSpotlightPayload(details, id, web);
            await writeSavedPlaceDiscoverCache(id, payload);
            if (!cancelled) {
              setSavedRows((prev) =>
                prev.map((r) =>
                  r.entry.googlePlaceId === id ? { ...r, status: 'ready', payload } : r
                )
              );
            }
          } catch {
            if (!cancelled) {
              setSavedRows((prev) =>
                prev.map((r) =>
                  r.entry.googlePlaceId === id ? { ...r, status: 'error' } : r
                )
              );
            }
          }
        }
      })();
      return () => {
        cancelled = true;
      };
    }, [uid])
  );

  const confirmRemoveSaved = useCallback(
    (row: SavedRowState) => {
      const name = row.entry.displayName?.trim() || row.payload?.title || 'Bu yer';
      Alert.alert(
        'Kaydı sil',
        `“${name}” kayıtlı yerlerden çıkarılsın mı? Yerel özet önbelleği de silinir.`,
        [
          { text: 'İptal', style: 'cancel' },
          {
            text: 'Sil',
            style: 'destructive',
            onPress: () => {
              if (!uid) return;
              void (async () => {
                try {
                  await removeSavedPlaceForUser(uid, row.entry.googlePlaceId);
                  await removeSavedPlaceDiscoverCache(row.entry.googlePlaceId);
                  setSavedRows((prev) =>
                    prev.filter((r) => r.entry.googlePlaceId !== row.entry.googlePlaceId)
                  );
                } catch (e: any) {
                  Alert.alert('Hata', e?.message || 'Silinemedi.');
                }
              })();
            },
          },
        ]
      );
    },
    [uid]
  );

  async function handleVote(choiceId: string) {
    if (!uid || pollBusy || !data?.poll || data.poll.userChoice) return;
    const pid = data.poll.pollId;
    setPollBusy(true);
    setError(null);
    try {
      await voteDiscoverPoll(uid, pid, choiceId);
      const nextPoll = { ...data.poll };
      nextPoll.options = nextPoll.options.map((o) =>
        o.id === choiceId ? { ...o, count: o.count + 1 } : o
      );
      nextPoll.userChoice = choiceId;
      nextPoll.totalVotes = nextPoll.options.reduce((s, o) => s + o.count, 0);
      setData({ ...data, poll: nextPoll });
    } catch (e: any) {
      setError(e?.message || 'Oy kullanılamadı. Firestore kurallarını kontrol et.');
    } finally {
      setPollBusy(false);
    }
  }

  useEffect(() => {
    if (!createPollOpen || !uid) return;
    let cancelled = false;
    setMutualLoading(true);
    void (async () => {
      try {
        const me = await getUserProfile(uid);
        const raw = me?.friends ?? [];
        const mutual = await filterMutualFriendUids(uid, raw);
        const rows: { uid: string; label: string }[] = [];
        for (const id of mutual) {
          const p = await getUserProfile(id);
          const label = p?.displayName?.trim() || p?.phoneNumber || id.slice(0, 8);
          rows.push({ uid: id, label });
        }
        rows.sort((a, b) => a.label.localeCompare(b.label, 'tr', { sensitivity: 'base' }));
        if (!cancelled) setMutualFriends(rows);
      } catch {
        if (!cancelled) setMutualFriends([]);
      } finally {
        if (!cancelled) setMutualLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [createPollOpen, uid]);

  function toggleFriendPick(id: string) {
    setSelectedFriendIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleCreatePoll() {
    if (!uid) return;
    setCreateBusy(true);
    setError(null);
    try {
      await createDiscoverPoll({
        createdBy: uid,
        question: createTitle,
        optionTexts: optionDrafts,
        inviteeUids: [...selectedFriendIds],
      });
      setCreatePollOpen(false);
      setCreateTitle('');
      setOptionDrafts(['', '']);
      setSelectedFriendIds(new Set());
      await load();
    } catch (e: any) {
      setError(e?.message || 'Anket oluşturulamadı.');
    } finally {
      setCreateBusy(false);
    }
  }

  function clearPollTipHoverTimer() {
    if (pollTipHoverTimerRef.current) {
      clearTimeout(pollTipHoverTimerRef.current);
      pollTipHoverTimerRef.current = null;
    }
  }

  async function openPollVoteTooltip(params: {
    pollId: string;
    optionIndex: number;
    letter: string;
    optionText: string;
    optionCount: number;
  }) {
    if (!uid) return;
    setPollTip({
      pollId: params.pollId,
      optionIndex: params.optionIndex,
      letter: params.letter,
      optionText: params.optionText,
    });
    setPollTipLoading(true);
    setPollTipError(null);
    setPollTipNames([]);
    try {
      const all = await listDiscoverPollVoters(params.pollId, uid, params.optionCount);
      const names = all
        .filter((r) => r.choiceIndex === params.optionIndex)
        .map((r) => r.displayName);
      setPollTipNames(names);
    } catch (e: any) {
      setPollTipError(e?.message || 'Oy listesi yüklenemedi.');
    } finally {
      setPollTipLoading(false);
    }
  }

  const first = data?.leaderboard[0];
  const second = data?.leaderboard[1];
  const third = data?.leaderboard[2];

  const pollPctList = useMemo(() => {
    if (!data?.poll?.options.length) return [] as number[];
    const t = data.poll.totalVotes;
    if (t <= 0) return data.poll.options.map(() => 50);
    return data.poll.options.map((o) => Math.round((o.count / t) * 1000) / 10);
  }, [data?.poll]);

  const canSubmitCreate =
    createTitle.trim().length >= 2 &&
    optionDrafts.filter((x) => String(x ?? '').trim().length > 0).length >= POLL_MIN_OPTIONS &&
    selectedFriendIds.size > 0;

  function barGradientPair(i: number): [string, string] {
    const pairs: [string, string][] = [
      theme.primaryButtonGradient as [string, string],
      theme.accentButtonGradient as [string, string],
      [theme.color.ocean, theme.color.primary],
      [theme.color.accentTeal, theme.color.accent],
      [theme.color.accentPurple, theme.color.accentPink],
      [theme.color.sand, theme.color.accent],
      [theme.color.primaryDark, theme.color.ocean],
      [theme.color.danger, theme.color.accent],
    ];
    return pairs[i % pairs.length];
  }

  const nextBadgeHint = useMemo(() => {
    if (!data) return '';
    const s = data.score;
    if (s < DISCOVER_SCORE_TRAVELER_MIN) {
      return `Gezgin rozeti: ${Math.max(0, DISCOVER_SCORE_TRAVELER_MIN - s)} puan kaldı`;
    }
    if (s < DISCOVER_SCORE_LEGEND_MIN) {
      return `Efsane: ${Math.max(0, DISCOVER_SCORE_LEGEND_MIN - s)} puan kaldı`;
    }
    return 'Tüm rozetler açık — yine de gezmeye devam!';
  }, [data]);

  if (!uid) {
    return (
      <Screen>
        <View style={styles.centered}>
          <Text style={styles.muted}>Giriş yapınca Keşfet açılır.</Text>
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.color.primary} />}
      >
        {loading && !data ? (
          <View style={styles.centered}>
            <ActivityIndicator color={theme.color.primary} size="large" />
            <Text style={styles.muted}>Skorlar ve sıralama yükleniyor…</Text>
          </View>
        ) : null}

        {error ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
            <Pressable onPress={() => void load()} style={styles.retryBtn}>
              <Text style={styles.retryBtnText}>Yeniden dene</Text>
            </Pressable>
          </View>
        ) : null}

        {data ? (
          <>
            <LinearGradient colors={heroGrad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.heroShell}>
              <View style={styles.heroInner}>
                <Text style={styles.heroKicker}>Canlı özet</Text>
                <Text style={styles.heroTitle}>Keşfet modu</Text>
                <Text style={styles.heroSub}>
                  Gezi puanın rotalarından hesaplanıyor. Arkadaşlarınla sıralamayı kıyasla — kazanmak şart değil,
                  gülmek şart.
                </Text>
                <View style={styles.sparkRow}>
                  <Text style={styles.spark}>✨</Text>
                  <Text style={styles.sparkLabel}>
                    {data.streak > 0
                      ? `${data.streak} gün üst üste Keşfet açtın — seri devam!`
                      : 'Her gün uğra; seri yakında başlar.'}
                  </Text>
                  <Text style={styles.spark}>✨</Text>
                </View>
              </View>
            </LinearGradient>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.chipsRow}
              style={styles.chipsScroll}
            >
              {data.vibeChips.map((label) => (
                <View key={label} style={styles.chip}>
                  <Text style={styles.chipText}>{label}</Text>
                </View>
              ))}
            </ScrollView>

            {savedRows.length > 0 ? (
              <View style={styles.savedSection}>
                <Text style={styles.sectionLabel}>Kaydettiğin yerler</Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.savedScroll}
                >
                  {savedRows.map((row) => {
                    const p = row.payload;
                    const title = p?.title?.trim() || row.entry.displayName?.trim() || 'Kayıtlı yer';
                    const summaryLine = p?.summaryBullets?.[0]?.trim();
                    const reviewLine = p?.reviewBullets?.[0]?.trim();
                    const subLine =
                      reviewLine && summaryLine
                        ? `${summaryLine.slice(0, 72)}${summaryLine.length > 72 ? '…' : ''}`
                        : summaryLine || reviewLine || row.entry.formattedAddress?.trim() || '';
                    const rating =
                      p?.placeRating != null && p.placeRating > 0
                        ? `★ ${p.placeRating.toFixed(1)}${
                            p.placeUserRatingsTotal != null && p.placeUserRatingsTotal > 0
                              ? ` (${p.placeUserRatingsTotal})`
                              : ''
                          }`
                        : '';
                    return (
                      <Pressable
                        key={row.entry.googlePlaceId}
                        onPress={() => {
                          setDiscoverSeedPlaceId(row.entry.googlePlaceId);
                          setDiscoverSeedPayload(row.payload ?? null);
                          setPlaceDiscoverOpen(true);
                        }}
                        onLongPress={() => confirmRemoveSaved(row)}
                        style={({ pressed }) => [styles.savedCard, theme.shadowSoft, pressed && { opacity: 0.92 }]}
                      >
                        {row.status === 'loading' ? (
                          <View style={[styles.savedHero, styles.savedHeroLoading]}>
                            <ActivityIndicator color={theme.color.primary} />
                          </View>
                        ) : row.status === 'error' ? (
                          <View style={[styles.savedHero, styles.savedHeroLoading]}>
                            <Text style={styles.savedErrorEmoji}>⚠️</Text>
                          </View>
                        ) : p?.heroImageUrl ? (
                          <Image
                            source={{ uri: p.heroImageUrl }}
                            style={styles.savedHero}
                            resizeMode="cover"
                            accessibilityIgnoresInvertColors
                          />
                        ) : (
                          <View style={[styles.savedHero, styles.savedHeroPlaceholder]}>
                            <Text style={styles.savedHeroPlaceholderEmoji}>📍</Text>
                          </View>
                        )}
                        <View style={styles.savedBody}>
                          <Text style={styles.savedTitle} numberOfLines={2}>
                            {title}
                          </Text>
                          {rating ? <Text style={styles.savedMeta}>{rating}</Text> : null}
                          {subLine ? (
                            <Text style={styles.savedLine} numberOfLines={2}>
                              {subLine}
                            </Text>
                          ) : row.status === 'loading' ? (
                            <Text style={styles.savedLine} numberOfLines={1}>
                              Özet yükleniyor…
                            </Text>
                          ) : row.status === 'error' ? (
                            <Text style={styles.savedLine} numberOfLines={2}>
                              Özet alınamadı; kısa dokunuşla yeniden dene.
                            </Text>
                          ) : null}
                          {reviewLine && summaryLine ? (
                            <Text style={styles.savedReviewTease} numberOfLines={2}>
                              “{reviewLine.slice(0, 90)}
                              {reviewLine.length > 90 ? '…' : ''}”
                            </Text>
                          ) : null}
                        </View>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </View>
            ) : null}

            <LinearGradient colors={heroGradEnd} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.softBand}>
              <Text style={styles.bandTitle}>Skor barı</Text>
              <View style={styles.statRow}>
                <View style={[styles.statBubble, { borderColor: theme.color.primary }]}>
                  <Text style={styles.statNum}>{data.score}</Text>
                  <Text style={styles.statLabel}>Gezi puanı</Text>
                  <Text style={styles.statHint}>rota · durak · km</Text>
                </View>
                <View style={[styles.statBubble, { borderColor: theme.color.accent }]}>
                  <Text style={styles.statNum}>{data.streak}</Text>
                  <Text style={styles.statLabel}>Seri</Text>
                  <Text style={styles.statHint}>günlük ziyaret</Text>
                </View>
                <View style={[styles.statBubble, { borderColor: theme.color.accentPurple }]}>
                  <Text style={styles.statNum}>{data.stats.tripCount}</Text>
                  <Text style={styles.statLabel}>Rota</Text>
                  <Text style={styles.statHint}>katıldığın</Text>
                </View>
              </View>
            </LinearGradient>

            <View style={[styles.card, theme.shadowCard]}>
              <View style={styles.cardHead}>
                <Text style={styles.cardEmoji}>🥇</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardTitle}>Arkadaş sıralaması</Text>
                  <Text style={styles.cardSub}>
                    Karşılıklı onaylı arkadaşlarınla puan kıyası. Az arkadaş = kısa liste; davet gönder, şenlik büyüsün.
                  </Text>
                </View>
              </View>
              <View style={styles.podium}>
                <View style={styles.podiumSlot}>
                  <Text style={styles.podiumMedal}>🥈</Text>
                  <View style={[styles.podiumBar, styles.podiumBar2, second?.isSelf && styles.podiumBarSelf]}>
                    <Text style={styles.podiumScore}>{second ? second.score : '—'}</Text>
                  </View>
                  <Text style={styles.podiumName} numberOfLines={1}>
                    {second?.displayName ?? '—'}
                  </Text>
                </View>
                <View style={styles.podiumSlot}>
                  <Text style={styles.podiumMedal}>🥇</Text>
                  <View style={[styles.podiumBar, styles.podiumBar1, first?.isSelf && styles.podiumBarSelf]}>
                    <Text style={styles.podiumScore}>{first ? first.score : '—'}</Text>
                  </View>
                  <Text style={styles.podiumName} numberOfLines={1}>
                    {first?.displayName ?? '—'}
                  </Text>
                </View>
                <View style={styles.podiumSlot}>
                  <Text style={styles.podiumMedal}>🥉</Text>
                  <View style={[styles.podiumBar, styles.podiumBar3, third?.isSelf && styles.podiumBarSelf]}>
                    <Text style={styles.podiumScore}>{third ? third.score : '—'}</Text>
                  </View>
                  <Text style={styles.podiumName} numberOfLines={1}>
                    {third?.displayName ?? '—'}
                  </Text>
                </View>
              </View>
              <Text style={styles.whisper}>
                Puan formülü: rota, durak, km, onaylı durak ve tahmini sürüş süresi — aynı mantık profil özetinde.
              </Text>
            </View>

            <Text style={styles.sectionLabel}>Mini görevler</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.questScroll}
            >
              {data.quests.map((q) => {
                const pct = q.target > 0 ? Math.min(100, (q.progress / q.target) * 100) : 0;
                return (
                  <View
                    key={q.id}
                    style={[
                      styles.questCard,
                      theme.shadowSoft,
                      q.done ? { borderColor: theme.color.success } : { borderColor: theme.color.border },
                    ]}
                  >
                    <Text style={styles.questEmoji}>{q.emoji}</Text>
                    <Text style={styles.questTitle}>{q.title}</Text>
                    <Text style={styles.questSub}>
                      {q.progress}/{q.target}
                      {q.done ? ' · tamam' : ''}
                    </Text>
                    <View style={styles.questTrack}>
                      <View style={[styles.questFill, { width: `${pct}%`, backgroundColor: theme.color.primary }]} />
                    </View>
                  </View>
                );
              })}
            </ScrollView>

            <View style={[styles.card, theme.shadowCard]}>
              <View style={styles.cardHead}>
                <Text style={styles.cardEmoji}>🏅</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardTitle}>Rozet vitrin</Text>
                  <Text style={styles.cardSub}>{nextBadgeHint}</Text>
                </View>
              </View>
              <View style={styles.badgeRow}>
                {(['explorer', 'traveler', 'legend'] as const).map((tier) => (
                  <BadgeOrb key={tier} tier={tier} active={data.badgeTier === tier} theme={theme} styles={styles} />
                ))}
              </View>
            </View>

            <View style={[styles.card, theme.shadowCard]}>
              <View style={styles.cardHead}>
                <Text style={styles.cardEmoji}>📊</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardTitle}>Topluluk anketi</Text>
                  <Text style={styles.cardSub}>
                    {POLL_MIN_OPTIONS}–{POLL_MAX_OPTIONS} seçenek; davet ettiğin karşılıklı arkadaşların ziline gider.
                    Herkes bir kez oy verir.
                  </Text>
                </View>
              </View>
              <Pressable
                onPress={() => {
                  setOptionDrafts(['', '']);
                  setCreatePollOpen(true);
                }}
                style={({ pressed }) => [
                  styles.pollCreateLink,
                  pressed && { opacity: 0.88 },
                ]}
                accessibilityRole="button"
                accessibilityLabel="Yeni anket oluştur"
              >
                <Text style={styles.pollCreateLinkText}>+ Yeni anket oluştur</Text>
              </Pressable>
              {data.poll ? (
                <>
                  <View style={{ height: theme.space.sm }} />
                  <Text style={styles.pollQ}>{data.poll.question}</Text>
                  {data.poll.options.map((opt, optIdx) => {
                    const pct = pollPctList[optIdx] ?? 50;
                    const letter = String.fromCharCode(65 + optIdx);
                    const voted = Boolean(data.poll?.userChoice);
                    return (
                      <View key={opt.id} style={styles.pollOptBlock}>
                        <View style={styles.pollOptHeaderRow}>
                          <Text style={[styles.pollOptLabel, styles.pollOptLabelFlex]} numberOfLines={4}>
                            {opt.text}
                          </Text>
                          {uid ? (
                            <Pressable
                              accessibilityRole="button"
                              accessibilityLabel={`${letter} şıkkını kim seçti`}
                              accessibilityHint="Bu şıkkı seçenlerin isimlerini gösterir"
                              hitSlop={10}
                              onPress={() =>
                                void openPollVoteTooltip({
                                  pollId: data.poll!.pollId,
                                  optionIndex: optIdx,
                                  letter,
                                  optionText: opt.text,
                                  optionCount: data.poll!.options.length,
                                })
                              }
                              onHoverIn={
                                Platform.OS === 'web'
                                  ? () => {
                                      clearPollTipHoverTimer();
                                      pollTipHoverTimerRef.current = setTimeout(() => {
                                        pollTipHoverTimerRef.current = null;
                                        void openPollVoteTooltip({
                                          pollId: data.poll!.pollId,
                                          optionIndex: optIdx,
                                          letter,
                                          optionText: opt.text,
                                          optionCount: data.poll!.options.length,
                                        });
                                      }, 420);
                                    }
                                  : undefined
                              }
                              onHoverOut={
                                Platform.OS === 'web' ? () => clearPollTipHoverTimer() : undefined
                              }
                              style={({ pressed }) => [styles.pollInfoBtn, pressed && { opacity: 0.75 }]}
                            >
                              <Text style={styles.pollInfoMark}>ⓘ</Text>
                            </Pressable>
                          ) : null}
                        </View>
                        <View style={styles.pollBarTrack}>
                          <LinearGradient
                            colors={barGradientPair(optIdx)}
                            start={{ x: 0, y: 0.5 }}
                            end={{ x: 1, y: 0.5 }}
                            style={[styles.pollBarFill, { width: `${pct}%` }]}
                          />
                        </View>
                        {!voted ? (
                          <Pressable
                            onPress={() => void handleVote(opt.id)}
                            disabled={pollBusy}
                            style={({ pressed }) => [styles.pollVoteBtn, pressed && { opacity: 0.9 }]}
                          >
                            <Text style={styles.pollVoteBtnText}>
                              {pollBusy ? '…' : `${letter} şıkkına oy ver`}
                            </Text>
                          </Pressable>
                        ) : null}
                      </View>
                    );
                  })}
                  <Text style={styles.pollMeta}>
                    {data.poll.totalVotes} oy ·{' '}
                    {data.poll.userChoice
                      ? 'Sen de katıldın, teşekkürler!'
                      : data.poll.isCreator
                        ? 'Sen oluşturdun — oy verebilirsin.'
                        : 'Oy ver, tablo şekillensin.'}
                  </Text>
                </>
              ) : (
                <Text style={styles.pollEmptyHint}>
                  Henüz seninle paylaşılmış bir anket yok. Yukarıdan oluştur veya arkadaşının davetini zilden aç.
                </Text>
              )}
              <View style={{ height: theme.space.md }} />
              <Pressable
                onPress={() => {
                  setOptionDrafts(['', '']);
                  setCreatePollOpen(true);
                }}
                style={({ pressed }) => [
                  styles.ctaFriends,
                  theme.shadowSoft,
                  pressed && { opacity: 0.92, transform: [{ scale: 0.98 }] },
                ]}
                accessibilityRole="button"
                accessibilityLabel="Anket oluştur ve davet gönder"
              >
                <LinearGradient
                  colors={heroGrad}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.ctaFriendsGrad}
                >
                  <Text style={styles.ctaFriendsEmoji}>📨</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.ctaFriendsTitle}>Anket oluştur ve davet gönder</Text>
                    <Text style={styles.ctaFriendsSub}>
                      Şıkları yaz, davet edeceğin karşılıklı arkadaşlarını seç — zil bildirimi gider.
                    </Text>
                  </View>
                  <Text style={styles.ctaChevron}>→</Text>
                </LinearGradient>
              </Pressable>
              <Pressable
                onPress={props.onOpenFriends}
                style={({ pressed }) => [styles.pollFriendsLink, pressed && { opacity: 0.88 }]}
                accessibilityRole="button"
                accessibilityLabel="Arkadaş listesi"
              >
                <Text style={styles.pollFriendsLinkText}>Arkadaş listesi</Text>
                <Text style={styles.pollFriendsLinkSub}>
                  Ankete zil daveti yalnızca karşılıklı arkadaşlarına gider; listeyi buradan güncelle. Sıralama da
                  aynı ekranda.
                </Text>
              </Pressable>
            </View>

            <Text style={styles.footerPun}>RotaWise: plan ciddi, yüz gülücük. 🧭</Text>
          </>
        ) : null}
        <View style={{ height: theme.space.xl }} />
      </ScrollView>

      <PlaceDiscoverModal
        visible={placeDiscoverOpen}
        seedPlaceId={discoverSeedPlaceId}
        seedInitialPayload={discoverSeedPayload}
        onSeedConsumed={clearDiscoverSeed}
        onClose={() => {
          setPlaceDiscoverOpen(false);
          clearDiscoverSeed();
        }}
        onNavigateCreateTripWithSecondStop={(p) => {
          setPlaceDiscoverOpen(false);
          clearDiscoverSeed();
          props.onNavigateCreateTripWithSecondStop(p);
        }}
        onOpenTrip={(tripId) => {
          setPlaceDiscoverOpen(false);
          clearDiscoverSeed();
          props.onOpenTrip(tripId);
        }}
      />

      <Modal
        visible={createPollOpen}
        transparent
        animationType="fade"
        onRequestClose={() => !createBusy && setCreatePollOpen(false)}
      >
        <Pressable
          style={styles.createModalBackdrop}
          onPress={() => !createBusy && setCreatePollOpen(false)}
        >
          <Pressable style={styles.createModalCard} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.createModalTitle}>Topluluk anketi</Text>
            <Text style={styles.createModalHint}>
              Başlık ve en az {POLL_MIN_OPTIONS} seçenek yaz; «Şık ekle» ile en fazla {POLL_MAX_OPTIONS} şıkkına
              çıkabilirsin. Karşılıklı arkadaşlarını işaretle — onlara zil bildirimi gider.
            </Text>
            <TextField label="Başlık / soru" value={createTitle} onChangeText={setCreateTitle} />
            {optionDrafts.map((row, idx) => {
              const letter = String.fromCharCode(65 + idx);
              return (
                <View key={`opt-${idx}`}>
                  <View style={{ height: theme.space.sm }} />
                  <TextField
                    label={`${letter} şıkkı`}
                    value={row}
                    onChangeText={(v) =>
                      setOptionDrafts((prev) => prev.map((p, i) => (i === idx ? v : p)))
                    }
                  />
                </View>
              );
            })}
            <View style={styles.optionDraftActions}>
              {optionDrafts.length < POLL_MAX_OPTIONS ? (
                <Pressable
                  onPress={() => setOptionDrafts((prev) => [...prev, ''])}
                  style={({ pressed }) => [styles.optionDraftLinkBtn, pressed && { opacity: 0.85 }]}
                >
                  <Text style={styles.optionDraftLinkText}>+ Şık ekle</Text>
                </Pressable>
              ) : null}
              {optionDrafts.length > POLL_MIN_OPTIONS ? (
                <Pressable
                  onPress={() => setOptionDrafts((prev) => prev.slice(0, -1))}
                  style={({ pressed }) => [styles.optionDraftLinkBtn, pressed && { opacity: 0.85 }]}
                >
                  <Text style={styles.optionDraftLinkTextMuted}>Son şıkkı kaldır</Text>
                </Pressable>
              ) : null}
            </View>
            <Text style={styles.friendPickSectionLabel}>Davet edilecek arkadaşlar</Text>
            {mutualLoading ? (
              <ActivityIndicator color={theme.color.primary} style={{ marginVertical: theme.space.md }} />
            ) : mutualFriends.length === 0 ? (
              <Text style={styles.pollEmptyHint}>
                Karşılıklı arkadaşın yok. Önce arkadaş ekleyip karşılıklı onaylayın.
              </Text>
            ) : (
              <ScrollView
                style={styles.friendPickScroll}
                keyboardShouldPersistTaps="handled"
                nestedScrollEnabled
              >
                {mutualFriends.map((f) => {
                  const on = selectedFriendIds.has(f.uid);
                  return (
                    <Pressable
                      key={f.uid}
                      onPress={() => toggleFriendPick(f.uid)}
                      style={[styles.friendPickRow, on && styles.friendPickRowOn]}
                    >
                      <Text style={styles.friendPickCheck}>{on ? '☑' : '☐'}</Text>
                      <Text style={styles.friendPickLabel} numberOfLines={1}>
                        {f.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            )}
            <PrimaryButton
              title={createBusy ? 'Gönderiliyor…' : 'Anketi oluştur ve davet et'}
              onPress={() => void handleCreatePoll()}
              loading={createBusy}
              disabled={createBusy || !canSubmitCreate}
            />
            <View style={{ height: theme.space.sm }} />
            <PrimaryButton
              title="İptal"
              variant="outline"
              onPress={() => setCreatePollOpen(false)}
              disabled={createBusy}
            />
          </Pressable>
        </Pressable>
      </Modal>

      <PollVoteNamesModal
        visible={pollTip != null}
        onClose={() => {
          clearPollTipHoverTimer();
          setPollTip(null);
          setPollTipNames([]);
          setPollTipError(null);
        }}
        optionSummary={pollTip ? `${pollTip.letter} · ${pollTip.optionText}` : ''}
        names={pollTipNames}
        loading={pollTipLoading}
        error={pollTipError}
      />
    </Screen>
  );
}

function BadgeOrb(props: {
  tier: BadgeTierId;
  active: boolean;
  theme: AppTheme;
  styles: ReturnType<typeof createStyles>;
}) {
  const { tier, active, theme, styles } = props;
  const bg =
    tier === 'explorer'
      ? theme.color.primarySoft
      : tier === 'traveler'
        ? theme.color.accentSoft
        : 'rgba(167, 139, 250, 0.22)';
  const border = active ? theme.color.primary : theme.color.border;
  const medal = tier === 'explorer' ? '🥉' : tier === 'traveler' ? '🥈' : '🥇';
  return (
    <View style={[styles.badgeOrb, { backgroundColor: bg, borderColor: border, borderWidth: active ? 2 : 1 }]}>
      <Text style={[styles.badgeEmoji, !active && { opacity: 0.45 }]}>{medal}</Text>
      <Text style={[styles.badgeName, !active && { opacity: 0.5 }]}>{BADGE_TIER_LABELS[tier]}</Text>
    </View>
  );
}

function createStyles(theme: AppTheme) {
  return StyleSheet.create({
    scroll: {
      paddingBottom: theme.space.xxl,
      paddingHorizontal: theme.space.md,
      paddingTop: theme.space.sm,
    },
    centered: { paddingVertical: theme.space.xl, alignItems: 'center', gap: 12 },
    muted: { color: theme.color.muted, fontSize: theme.font.small, fontWeight: '600' },
    errorBox: {
      backgroundColor: theme.color.inputBg,
      borderRadius: theme.radius.lg,
      padding: theme.space.md,
      borderWidth: 1,
      borderColor: theme.color.danger,
      marginBottom: theme.space.md,
    },
    errorText: { color: theme.color.danger, fontSize: theme.font.small, fontWeight: '700' },
    retryBtn: { marginTop: theme.space.sm, alignSelf: 'flex-start' },
    retryBtnText: { color: theme.color.primaryDark, fontSize: theme.font.small, fontWeight: '800' },
    heroShell: {
      borderRadius: theme.radius.xl,
      overflow: 'hidden',
      marginBottom: theme.space.md,
      ...theme.shadowCard,
    },
    heroInner: {
      padding: theme.space.lg,
      paddingVertical: theme.space.xl,
    },
    heroKicker: {
      color: 'rgba(255,255,255,0.92)',
      fontSize: theme.font.tiny,
      fontWeight: '800',
      textTransform: 'uppercase',
      letterSpacing: 1.4,
      marginBottom: 6,
    },
    heroTitle: {
      color: '#FFFFFF',
      fontSize: theme.font.hero,
      fontWeight: '900',
      letterSpacing: -0.8,
    },
    heroSub: {
      color: 'rgba(255,255,255,0.95)',
      fontSize: theme.font.body,
      lineHeight: 24,
      marginTop: theme.space.sm,
      fontWeight: '600',
    },
    sparkRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginTop: theme.space.md,
    },
    spark: { fontSize: 16 },
    sparkLabel: {
      flex: 1,
      color: 'rgba(255,255,255,0.88)',
      fontSize: theme.font.tiny,
      fontWeight: '700',
    },
    chipsScroll: { marginBottom: theme.space.md },
    chipsRow: {
      gap: 10,
      paddingRight: theme.space.md,
      alignItems: 'center',
    },
    chip: {
      backgroundColor: theme.color.surface,
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderRadius: theme.radius.pill,
      borderWidth: 1,
      borderColor: theme.color.cardBorderAccent,
      ...theme.shadowSoft,
    },
    chipText: {
      color: theme.color.text,
      fontSize: theme.font.tiny,
      fontWeight: '800',
    },
    savedSection: { marginBottom: theme.space.md },
    savedScroll: { gap: 12, paddingRight: theme.space.md, paddingBottom: theme.space.xs },
    savedCard: {
      width: 268,
      borderRadius: theme.radius.lg,
      backgroundColor: theme.color.surface,
      borderWidth: 1,
      borderColor: theme.color.border,
      overflow: 'hidden',
    },
    savedHero: { width: '100%', height: 112, backgroundColor: theme.color.inputBg },
    savedHeroLoading: { alignItems: 'center', justifyContent: 'center' },
    savedHeroPlaceholder: { alignItems: 'center', justifyContent: 'center' },
    savedHeroPlaceholderEmoji: { fontSize: 36, opacity: 0.85 },
    savedErrorEmoji: { fontSize: 28 },
    savedBody: { padding: theme.space.sm },
    savedTitle: { color: theme.color.text, fontSize: theme.font.small, fontWeight: '900' },
    savedMeta: { color: theme.color.muted, fontSize: 10, fontWeight: '700', marginTop: 4 },
    savedLine: { color: theme.color.textSecondary, fontSize: theme.font.tiny, marginTop: 6, lineHeight: 18 },
    savedReviewTease: {
      color: theme.color.muted,
      fontSize: theme.font.tiny,
      fontStyle: 'italic',
      marginTop: 6,
      lineHeight: 18,
    },
    softBand: {
      borderRadius: theme.radius.xl,
      padding: theme.space.lg,
      marginBottom: theme.space.md,
      borderWidth: 1,
      borderColor: theme.color.cardBorderPrimary,
    },
    bandTitle: {
      color: theme.color.textSecondary,
      fontSize: theme.font.small,
      fontWeight: '800',
      marginBottom: theme.space.md,
    },
    statRow: { flexDirection: 'row', gap: 10, flexWrap: 'wrap', justifyContent: 'space-between' },
    statBubble: {
      flex: 1,
      minWidth: 92,
      backgroundColor: theme.color.surface,
      borderRadius: theme.radius.lg,
      padding: theme.space.md,
      borderWidth: 2,
      alignItems: 'center',
    },
    statNum: {
      color: theme.color.text,
      fontSize: 28,
      fontWeight: '900',
    },
    statLabel: {
      color: theme.color.text,
      fontSize: theme.font.tiny,
      fontWeight: '800',
      marginTop: 4,
    },
    statHint: {
      color: theme.color.muted,
      fontSize: 10,
      fontWeight: '600',
      marginTop: 2,
      textAlign: 'center',
    },
    card: {
      backgroundColor: theme.color.surface,
      borderRadius: theme.radius.xl,
      padding: theme.space.lg,
      borderWidth: 1,
      borderColor: theme.color.cardBorderPrimary,
      marginBottom: theme.space.md,
    },
    cardHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: theme.space.md },
    cardEmoji: { fontSize: 28, marginTop: 2 },
    cardTitle: { color: theme.color.text, fontSize: theme.font.h2, fontWeight: '900' },
    cardSub: { color: theme.color.muted, fontSize: theme.font.tiny, marginTop: 4, lineHeight: 18 },
    podium: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      justifyContent: 'center',
      gap: 10,
      paddingVertical: theme.space.sm,
    },
    podiumSlot: { alignItems: 'center', flex: 1, maxWidth: 110 },
    podiumMedal: { fontSize: 26, marginBottom: 6 },
    podiumBar: {
      width: '100%',
      borderRadius: theme.radius.md,
      marginBottom: 8,
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 6,
    },
    podiumBar1: {
      height: 88,
      backgroundColor: theme.color.primarySoft,
      borderWidth: 2,
      borderColor: theme.color.primary,
    },
    podiumBar2: {
      height: 64,
      backgroundColor: theme.color.inputBg,
      borderWidth: 1,
      borderColor: theme.color.border,
    },
    podiumBar3: {
      height: 52,
      backgroundColor: theme.color.inputBg,
      borderWidth: 1,
      borderColor: theme.color.border,
    },
    podiumBarSelf: {
      borderColor: theme.color.accent,
      borderWidth: 2,
    },
    podiumScore: { color: theme.color.text, fontSize: theme.font.small, fontWeight: '900' },
    podiumName: { color: theme.color.textSecondary, fontSize: theme.font.tiny, fontWeight: '800' },
    whisper: {
      color: theme.color.muted,
      fontSize: theme.font.tiny,
      lineHeight: 18,
      fontStyle: 'italic',
      marginTop: theme.space.sm,
      textAlign: 'center',
    },
    sectionLabel: {
      color: theme.color.textSecondary,
      fontSize: theme.font.small,
      fontWeight: '900',
      letterSpacing: 0.5,
      marginBottom: theme.space.sm,
      marginLeft: 2,
    },
    questScroll: { gap: 12, paddingRight: theme.space.md, paddingBottom: theme.space.sm },
    questCard: {
      width: 156,
      backgroundColor: theme.color.surface,
      borderRadius: theme.radius.lg,
      padding: theme.space.md,
      borderWidth: 2,
    },
    questEmoji: { fontSize: 32, marginBottom: 8 },
    questTitle: { color: theme.color.text, fontSize: theme.font.small, fontWeight: '900' },
    questSub: { color: theme.color.muted, fontSize: 10, fontWeight: '700', marginTop: 4 },
    questTrack: {
      height: 8,
      borderRadius: theme.radius.pill,
      backgroundColor: theme.color.inputBg,
      marginTop: 10,
      overflow: 'hidden',
    },
    questFill: { height: '100%', borderRadius: theme.radius.pill },
    badgeRow: { flexDirection: 'row', gap: 10, justifyContent: 'space-between' },
    badgeOrb: {
      flex: 1,
      alignItems: 'center',
      paddingVertical: theme.space.md,
      borderRadius: theme.radius.lg,
    },
    badgeEmoji: { fontSize: 22, marginBottom: 6 },
    badgeName: {
      color: theme.color.text,
      fontSize: 10,
      fontWeight: '800',
      textAlign: 'center',
    },
    pollQ: {
      color: theme.color.text,
      fontSize: theme.font.small,
      fontWeight: '800',
      marginBottom: theme.space.md,
    },
    pollOptBlock: { marginBottom: theme.space.sm },
    pollOptHeaderRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 8,
      marginBottom: 6,
    },
    pollOptLabelFlex: { flex: 1, minWidth: 0 },
    pollOptLabel: { color: theme.color.textSecondary, fontSize: theme.font.tiny, fontWeight: '700' },
    pollInfoBtn: {
      padding: 4,
      marginTop: -2,
      borderRadius: theme.radius.sm,
    },
    pollInfoMark: {
      color: theme.color.primaryDark,
      fontSize: theme.font.body,
      fontWeight: '800',
    },
    pollBarTrack: {
      height: 14,
      borderRadius: theme.radius.pill,
      backgroundColor: theme.color.inputBg,
      overflow: 'hidden',
      marginBottom: 8,
    },
    pollBarFill: { height: '100%', borderRadius: theme.radius.pill },
    pollVoteBtn: {
      alignSelf: 'flex-start',
      paddingVertical: 8,
      paddingHorizontal: 12,
      borderRadius: theme.radius.md,
      backgroundColor: theme.color.primarySoft,
      borderWidth: 1,
      borderColor: theme.color.cardBorderPrimary,
    },
    pollVoteBtnText: { color: theme.color.primaryDark, fontSize: theme.font.tiny, fontWeight: '800' },
    pollMeta: {
      color: theme.color.muted,
      fontSize: theme.font.tiny,
      marginBottom: theme.space.md,
      fontStyle: 'italic',
    },
    ctaFriends: {
      borderRadius: theme.radius.xl,
      overflow: 'hidden',
    },
    ctaFriendsGrad: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingVertical: theme.space.md,
      paddingHorizontal: theme.space.lg,
    },
    ctaFriendsEmoji: { fontSize: 28 },
    ctaFriendsTitle: { color: '#FFFFFF', fontSize: theme.font.body, fontWeight: '900' },
    ctaFriendsSub: { color: 'rgba(255,255,255,0.9)', fontSize: theme.font.tiny, marginTop: 2, fontWeight: '600' },
    ctaChevron: { color: '#FFFFFF', fontSize: 22, fontWeight: '300' },
    footerPun: {
      textAlign: 'center',
      color: theme.color.muted,
      fontSize: theme.font.tiny,
      fontWeight: '700',
      marginTop: theme.space.sm,
    },
    pollCreateLink: {
      alignSelf: 'flex-start',
      paddingVertical: 8,
      paddingHorizontal: 12,
      borderRadius: theme.radius.pill,
      backgroundColor: theme.color.primarySoft,
      borderWidth: 1,
      borderColor: theme.color.primary,
    },
    pollCreateLinkText: {
      color: theme.color.primaryDark,
      fontSize: theme.font.tiny,
      fontWeight: '800',
    },
    pollEmptyHint: {
      color: theme.color.textSecondary,
      fontSize: theme.font.tiny,
      lineHeight: 18,
      marginTop: theme.space.sm,
      marginBottom: theme.space.sm,
    },
    createModalBackdrop: {
      flex: 1,
      backgroundColor: theme.color.overlayDark,
      justifyContent: 'center',
      padding: theme.space.md,
    },
    createModalCard: {
      backgroundColor: theme.color.surface,
      borderRadius: theme.radius.xl,
      padding: theme.space.lg,
      borderWidth: 1,
      borderColor: theme.color.cardBorderPrimary,
      maxHeight: '88%',
      ...theme.shadowCard,
    },
    createModalTitle: {
      color: theme.color.text,
      fontSize: theme.font.h2,
      fontWeight: '900',
      marginBottom: theme.space.xs,
    },
    createModalHint: {
      color: theme.color.muted,
      fontSize: theme.font.tiny,
      lineHeight: 18,
      marginBottom: theme.space.md,
    },
    friendPickSectionLabel: {
      color: theme.color.textSecondary,
      fontSize: theme.font.small,
      fontWeight: '800',
      marginTop: theme.space.md,
      marginBottom: theme.space.xs,
    },
    friendPickScroll: { maxHeight: 200, marginBottom: theme.space.md },
    friendPickRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingVertical: 10,
      paddingHorizontal: theme.space.sm,
      borderRadius: theme.radius.md,
      borderWidth: 1,
      borderColor: theme.color.border,
      backgroundColor: theme.color.inputBg,
      marginBottom: 8,
    },
    friendPickRowOn: {
      borderColor: theme.color.primary,
      backgroundColor: theme.color.primarySoft,
    },
    friendPickCheck: { fontSize: theme.font.body, color: theme.color.text },
    friendPickLabel: { flex: 1, color: theme.color.text, fontSize: theme.font.small, fontWeight: '700' },
    optionDraftActions: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: theme.space.sm,
      marginTop: theme.space.sm,
      marginBottom: theme.space.sm,
    },
    optionDraftLinkBtn: { paddingVertical: 6, paddingHorizontal: 4 },
    optionDraftLinkText: { color: theme.color.primaryDark, fontSize: theme.font.small, fontWeight: '800' },
    optionDraftLinkTextMuted: { color: theme.color.muted, fontSize: theme.font.small, fontWeight: '700' },
    pollFriendsLink: {
      marginTop: theme.space.sm,
      paddingVertical: theme.space.sm,
      paddingHorizontal: theme.space.sm,
      borderRadius: theme.radius.lg,
      borderWidth: 1,
      borderColor: theme.color.border,
      backgroundColor: theme.color.inputBg,
    },
    pollFriendsLinkText: {
      color: theme.color.primaryDark,
      fontSize: theme.font.small,
      fontWeight: '800',
    },
    pollFriendsLinkSub: {
      color: theme.color.muted,
      fontSize: theme.font.tiny,
      fontWeight: '600',
      lineHeight: 18,
      marginTop: 6,
    },
  });
}

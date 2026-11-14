import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useEffect, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Glass, GlassArea } from '../components/Glass';
import Ionicons from '../components/Icon';
import { FadeIn, haptic, PressScale } from '../components/motion';
import { Chip, IconButton, InfoButton, PillButton } from '../components/ui';
import { setSetting } from '../lib/db';
import {
  basket,
  chainOf,
  getGrocerySettings,
  getList,
  getPicks,
  priceList,
  rememberPick,
  saveGrocerySettings,
  saveList,
  tl,
  type Basket,
  type GrocerySettings,
  type Item,
  type Priced,
  type Product,
} from '../lib/groceries';
import { colors, fonts, inputColors, radius } from '../lib/theme';
import { useFirstFrame } from '../lib/perf';

const DISTANCES = [1, 2, 3, 5];

/**
 * The grocery list: write what you need, tap "Find the cheapest", and see what each item costs at
 * the chain markets near you, which single shop is cheapest for all of it, and the cheapest split.
 * Prices come straight from marketfiyati.org.tr (no AI, so it costs nothing).
 */
export default function GroceriesScreen() {
  useFirstFrame('Groceries'); // Settings → Privacy → Speed
  const db = useSQLiteContext();
  const insets = useSafeAreaInsets();
  const [list, setList] = useState<Item[]>([]);
  const [s, setS] = useState<GrocerySettings | null>(null);
  const [text, setText] = useState('');
  const [priced, setPriced] = useState<Record<string, Priced>>({});
  const [open, setOpen] = useState<string | null>(null);
  const [running, setRunning] = useState<string | null>(null); // "3/8 · yumurta"
  const [error, setError] = useState('');
  const [where, setWhere] = useState<{ label: string; markets: number } | null>(null);

  useFocusEffect(
    useCallback(() => {
      getList(db).then(setList);
      getGrocerySettings(db).then(setS);
    }, [db]),
  );

  const update = (next: Item[]) => {
    setList(next);
    saveList(db, next).catch(() => {});
  };

  const add = async () => {
    const names = text
      .split(/[,\n]/)
      .map((x) => x.trim())
      .filter(Boolean);
    if (!names.length) return;
    const picks = await getPicks(db);
    const now = Date.now();
    update([...list, ...names.map((n, i) => ({ id: `${now}-${i}`, text: n, done: false, pick: picks[n.toLowerCase()] ?? null, addedAt: now }))]);
    setText('');
    haptic.tick();
  };

  const toggle = (id: string) => {
    haptic.tick();
    update(list.map((i) => (i.id === id ? { ...i, done: !i.done } : i)));
  };
  const remove = (id: string) => update(list.filter((i) => i.id !== id));

  const choose = (item: Item, p: Product | null) => {
    const pick = p ? { id: p.id, title: p.title, brand: p.brand, image: p.image, size: p.size } : null;
    update(list.map((i) => (i.id === item.id ? { ...i, pick } : i)));
    rememberPick(db, item.text, pick).catch(() => {});
    const row = priced[item.id];
    if (row) setPriced({ ...priced, [item.id]: { ...row, item: { ...item, pick }, product: p ?? row.options[0] ?? null } });
    haptic.tick();
  };

  const run = async () => {
    const todo = list.filter((i) => !i.done);
    if (!todo.length) return;
    setError('');
    setPriced({});
    setRunning(`0/${todo.length}`);
    let n = 0;
    try {
      const res = await priceList(db, list, (p) => {
        n++;
        setPriced((x) => ({ ...x, [p.item.id]: p }));
        setRunning(`${n}/${todo.length} · ${p.item.text}`);
      });
      setWhere({ label: res.place.label, markets: res.branches.length });
      haptic.success();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(null);
    }
  };

  const setDistance = (km: number) => {
    if (!s) return;
    const next = { ...s, distanceKm: km };
    setS(next);
    saveGrocerySettings(db, next).catch(() => {});
  };

  const rows = list.map((i) => priced[i.id]).filter((p): p is Priced => !!p);
  const b = rows.length ? basket(rows.map((r) => ({ ...r, item: list.find((i) => i.id === r.item.id) ?? r.item }))) : null;
  // the last result, for the Life tab card
  const lastKey = b?.chains[0] ? `${b.chains[0].chain}:${b.chains[0].total}:${b.split.total}` : '';
  useEffect(() => {
    if (!lastKey || running) return;
    const [chain, total, split] = lastKey.split(':');
    setSetting(db, 'groceries.last', JSON.stringify({ chain, total: Number(total), split: Number(split), at: Date.now() })).catch(() => {});
  }, [db, lastKey, running]);
  const left = list.filter((i) => !i.done).length;

  return (
    <View style={styles.screen}>
      <GlassArea>
        <View style={[styles.bar, { paddingTop: insets.top + 8 }]}>
          <IconButton icon="arrow-back" label="Back" onPress={() => router.back()} />
          <Text style={styles.barTitle}>Groceries</Text>
          <InfoButton
            title="Where the prices come from"
            points={[
              'From marketfiyati.org.tr, the price comparison site TÜBİTAK made with the Central Bank: A101, BİM, ŞOK, Migros, CarrefourSA, Hakmar and Tarım Kredi, per branch.',
              'Only the branches within your distance count. Prices can be a few hours old, and local shops and pazar are not in it.',
              'No AI is used here, so checking prices costs nothing.',
              'Tap an item after checking to choose the exact product. Your choice is remembered next time.',
            ]}
          />
        </View>

        <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 120 }]} keyboardShouldPersistTaps="handled">
          <Text style={styles.title}>🛒 Groceries</Text>
          <Text style={styles.sub}>{left ? `${left} to buy` : 'Write what you need, then find where it’s cheapest.'}</Text>

          {/* add */}
          <View style={styles.addRow}>
            <TextInput
              value={text}
              onChangeText={setText}
              onSubmitEditing={add}
              placeholder="süt, yumurta, ekmek…"
              placeholderTextColor={colors.muted}
              returnKeyType="done"
              style={styles.input}
              {...inputColors}
            />
            <IconButton icon="add" label="Add" onPress={add} />
          </View>

          {/* the list */}
          {list.map((item) => {
            const p = priced[item.id];
            const best = p?.product?.prices[0];
            const isOpen = open === item.id && !!p?.options.length;
            return (
              <View key={item.id} style={[styles.item, item.done && { opacity: 0.45 }]}>
                <View style={styles.itemRow}>
                  <Pressable onPress={() => toggle(item.id)} hitSlop={10} accessibilityLabel={item.done ? `Untick ${item.text}` : `Tick ${item.text}`}>
                    <Ionicons name={item.done ? 'checkmark-circle' : 'ellipse-outline'} size={26} color={item.done ? colors.ok : colors.muted} />
                  </Pressable>
                  <Pressable style={{ flex: 1 }} onPress={() => p?.options.length && setOpen(isOpen ? null : item.id)} onLongPress={() => remove(item.id)}>
                    <Text style={[styles.itemText, item.done && styles.struck]}>{item.text}</Text>
                    {p?.error ? (
                      <Text style={styles.itemErr}>{p.error}</Text>
                    ) : best ? (
                      <Text style={styles.itemPrice} numberOfLines={1}>
                        <Text style={{ color: chainOf(best.chain).color, fontFamily: fonts.sansBold }}>{chainOf(best.chain).name}</Text> {tl(best.price)} · {p.product!.title}
                        {item.pick ? ' ✓' : ''}
                      </Text>
                    ) : p ? (
                      <Text style={styles.itemErr}>Not found nearby. Try other words.</Text>
                    ) : item.pick ? (
                      <Text style={styles.itemMuted} numberOfLines={1}>
                        ✓ {item.pick.title}
                      </Text>
                    ) : null}
                  </Pressable>
                  {!!p?.options.length && <Ionicons name={isOpen ? 'chevron-up' : 'chevron-down'} size={18} color={colors.muted} />}
                </View>
                {isOpen && (
                  <FadeIn style={styles.options}>
                    {p!.options.slice(0, 8).map((o) => {
                      const mine = item.pick?.id === o.id;
                      const perChain = [...new Map(o.prices.map((x) => [x.chain, x])).values()].slice(0, 3);
                      return (
                        <PressScale key={o.id} scaleTo={0.98} onPress={() => choose(item, mine ? null : o)} style={[styles.option, mine && styles.optionMine]}>
                          {o.image ? <Image source={{ uri: o.image }} style={styles.optImg} resizeMode="contain" /> : <View style={styles.optImg} />}
                          <View style={{ flex: 1 }}>
                            <Text style={styles.optTitle} numberOfLines={2}>
                              {o.title}
                              {o.size && !o.title.includes(o.size) ? ` · ${o.size}` : ''}
                            </Text>
                            <View style={styles.chips}>
                              {perChain.map((x) => (
                                <Text key={x.chain} style={styles.priceChip}>
                                  <Text style={{ color: chainOf(x.chain).color }}>●</Text> {chainOf(x.chain).name} {tl(x.price)}
                                  {x.regular ? <Text style={styles.was}> {tl(x.regular)}</Text> : null}
                                </Text>
                              ))}
                            </View>
                          </View>
                          {mine && <Ionicons name="checkmark-circle" size={22} color={colors.ok} />}
                        </PressScale>
                      );
                    })}
                    <Text style={styles.hint}>Tap the one you buy. It's remembered for "{item.text}".</Text>
                  </FadeIn>
                )}
              </View>
            );
          })}
          {list.some((i) => i.done) && (
            <Pressable onPress={() => update(list.filter((i) => !i.done))} style={styles.clear}>
              <Text style={styles.clearText}>Clear ticked items</Text>
            </Pressable>
          )}
          {!!list.length && <Text style={styles.hint}>Long-press an item to delete it.</Text>}

          {/* how far */}
          {s && (
            <>
              <Text style={styles.label}>Markets within</Text>
              <View style={styles.chips}>
                {DISTANCES.map((km) => (
                  <Chip key={km} label={`${km} km`} active={s.distanceKm === km} onPress={() => setDistance(km)} />
                ))}
              </View>
            </>
          )}

          {!!error && <Text style={styles.error}>⚠️ {error}</Text>}

          {/* the verdict */}
          {b && b.priced > 0 && !running && (
            <FadeIn delay={100}>
              <Verdict b={b} />
              {where && (
                <Text style={styles.hint}>
                  {where.markets} chain markets within {s?.distanceKm} km of {where.label} · prices from marketfiyati.org.tr
                </Text>
              )}
            </FadeIn>
          )}
        </ScrollView>

        {/* always in reach */}
        {left > 0 && (
          <View style={[styles.go, { bottom: insets.bottom + 18 }]} pointerEvents="box-none">
            <PillButton label={running ? `Checking ${running}…` : 'Find the cheapest'} onPress={run} disabled={!!running} full />
          </View>
        )}
      </GlassArea>
    </View>
  );
}

/** One shop for all of it vs. the cheapest split, in plain words. */
function Verdict({ b }: { b: Basket }) {
  const full = b.chains.filter((c) => c.missing.length === 0);
  const oneShop = full[0] ?? b.chains[0];
  const saves = oneShop && !oneShop.missing.length ? oneShop.total - b.split.total : 0;
  return (
    <Glass radius={radius.md} style={styles.verdict}>
      <Text style={styles.vLabel}>CHEAPEST WAY</Text>
      <Text style={styles.vBig}>{tl(b.split.total)}</Text>
      {b.split.stops.map((st) => (
        <Text key={st.chain} style={styles.vLine}>
          <Text style={{ color: chainOf(st.chain).color, fontFamily: fonts.sansBold }}>{chainOf(st.chain).name}</Text> · {st.items.map((i) => i.text).join(', ')}
        </Text>
      ))}
      {b.split.stops.length > 1 && saves > 0.5 && (
        <Text style={styles.vSave}>
          Splitting saves {tl(saves)} vs. everything at {chainOf(oneShop.chain).name}
          {saves < 15 ? ' (maybe not worth the extra stop 😄)' : ' 🤑'}
        </Text>
      )}

      <Text style={[styles.vLabel, { marginTop: 18 }]}>ONE SHOP FOR EVERYTHING</Text>
      {b.chains.slice(0, 7).map((c) => (
        <View key={c.chain} style={styles.vRow}>
          <View style={[styles.dot, { backgroundColor: chainOf(c.chain).color }]} />
          <Text style={styles.vChain}>{chainOf(c.chain).name}</Text>
          <Text style={styles.vMissing} numberOfLines={1}>
            {c.missing.length ? `no ${c.missing.join(', ')}` : '✓ has it all'}
          </Text>
          <Text style={styles.vTotal}>{tl(c.total)}</Text>
        </View>
      ))}
    </Glass>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  bar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 6 },
  barTitle: { fontFamily: fonts.sans, fontSize: 16, color: colors.text },
  content: { padding: 20, paddingTop: 8 },
  title: { fontFamily: fonts.display, fontSize: 36, lineHeight: 42, letterSpacing: -0.5, color: colors.text },
  sub: { fontFamily: fonts.sansRegular, fontSize: 15, color: colors.muted, marginTop: 4, marginBottom: 16 },
  addRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 },
  input: { flex: 1, backgroundColor: colors.raised, borderRadius: radius.pill, paddingHorizontal: 18, paddingVertical: 13, color: colors.text, fontFamily: fonts.sansRegular, fontSize: 15 },
  item: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line, paddingVertical: 12 },
  itemRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  itemText: { fontFamily: fonts.sans, fontSize: 17, color: colors.text },
  struck: { textDecorationLine: 'line-through' },
  itemPrice: { fontFamily: fonts.sansRegular, fontSize: 13, color: colors.muted, marginTop: 3 },
  itemMuted: { fontFamily: fonts.sansRegular, fontSize: 13, color: colors.muted, marginTop: 3 },
  itemErr: { fontFamily: fonts.sansRegular, fontSize: 13, color: colors.danger, marginTop: 3 },
  options: { marginTop: 10, marginLeft: 38, gap: 8 },
  option: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10, borderRadius: radius.sm, backgroundColor: colors.surface },
  optionMine: { borderWidth: 1, borderColor: colors.ok },
  optImg: { width: 48, height: 48, borderRadius: 10, backgroundColor: '#FFFFFF' },
  optTitle: { fontFamily: fonts.sans, fontSize: 14, color: colors.text },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 6 },
  priceChip: { fontFamily: fonts.sansRegular, fontSize: 12, color: colors.text },
  was: { color: colors.muted, textDecorationLine: 'line-through' },
  clear: { alignSelf: 'flex-start', marginTop: 14 },
  clearText: { fontFamily: fonts.sans, fontSize: 13, color: colors.muted, textDecorationLine: 'underline' },
  hint: { fontFamily: fonts.sansRegular, fontSize: 12, lineHeight: 17, color: colors.muted, marginTop: 10 },
  label: { fontFamily: fonts.serif, fontSize: 14, color: colors.muted, marginTop: 24, marginBottom: 10 },
  error: { fontFamily: fonts.sansRegular, fontSize: 14, lineHeight: 20, color: colors.danger, marginTop: 16 },
  verdict: { padding: 18, marginTop: 24 },
  vLabel: { fontFamily: fonts.sans, fontSize: 11, letterSpacing: 1.2, color: colors.muted },
  vBig: { fontFamily: fonts.display, fontSize: 34, color: colors.text, marginTop: 4, marginBottom: 6 },
  vLine: { fontFamily: fonts.sansRegular, fontSize: 14, lineHeight: 21, color: colors.text },
  vSave: { fontFamily: fonts.sans, fontSize: 14, color: colors.ok, marginTop: 8 },
  vRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 7 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  vChain: { fontFamily: fonts.sans, fontSize: 15, color: colors.text, width: 92 },
  vMissing: { flex: 1, fontFamily: fonts.sansRegular, fontSize: 12, color: colors.muted },
  vTotal: { fontFamily: fonts.sansBold, fontSize: 15, color: colors.text },
  go: { position: 'absolute', left: 20, right: 20, elevation: 12 },
});

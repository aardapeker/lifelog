import { useLocalSearchParams } from "expo-router";
import { ScrollView, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Page, usePageBottom } from "../../components/Page";
import { Header } from "../../radar/components/Header";
import { MoviePage } from "../../radar/components/MoviePage";

/** A film or series that isn't in the feed (opened from "More like this"): the same page, without Save. */
export default function MovieScreen() {
  const { kind, id } = useLocalSearchParams<{ kind: string; id: string }>();
  const insets = useSafeAreaInsets();
  const pageBottom = usePageBottom();
  return (
    <Page>
      <Header title={kind === "tv" ? "Series" : "Film"} />
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: insets.bottom + 48 + pageBottom },
        ]}
      >
        <MoviePage kind={kind === "tv" ? "tv" : "movie"} id={Number(id)} />
      </ScrollView>
    </Page>
  );
}

const styles = StyleSheet.create({ content: { padding: 20 } });

import { useLocalSearchParams } from "expo-router";
import { ScrollView, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Page, usePageBottom } from "../../components/Page";
import { Header } from "../../radar/components/Header";
import { PersonPage } from '../../radar/components/PersonPage';

/** An actor or director, opened from a movie page (cast, director, created by). */
export default function PersonScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const pageBottom = usePageBottom();
  return (
    <Page>
      <Header title="Person" />
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: insets.bottom + 48 + pageBottom },
        ]}
      >
        <PersonPage id={Number(id)} />
      </ScrollView>
    </Page>
  );
}

const styles = StyleSheet.create({ content: { padding: 20 } });

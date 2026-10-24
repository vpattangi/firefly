// Community alerts (design: "Community alerts" frame). Live list of active incidents from
// list_active_incidents, updated over Realtime by useIncidents.

import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { Chip } from '@/components/chip';
import { ReportSheet } from '@/components/report-sheet';
import { Card, ErrorText, Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useIncidents } from '@/hooks/use-incidents';
import { useTheme } from '@/hooks/use-theme';
import type { Incident } from '@/lib/api';

const FILTERS = ['All updates', 'Hazards', 'Safety'] as const;
type Filter = (typeof FILTERS)[number];

const CATEGORY_ICON: Record<string, keyof typeof Ionicons.glyphMap> = {
  broken_lighting: 'flash-off-outline',
  blocked_path: 'remove-circle-outline',
  flooding: 'water-outline',
  construction: 'construct-outline',
  fallen_tree: 'leaf-outline',
  fire_hazard: 'flame-outline',
  unsafe_conditions: 'warning-outline',
  safety_concern: 'shield-outline',
  other: 'alert-circle-outline',
};

const STATUS_LABEL: Record<Incident['eaiser_status'], string> = {
  submitted: 'Reported',
  in_progress: 'Being fixed',
  resolved: 'Resolved',
};

export default function AlertsScreen() {
  const theme = useTheme();
  const { incidents, error } = useIncidents();
  const [filter, setFilter] = useState<Filter>('All updates');
  const [reportOpen, setReportOpen] = useState(false);
  const now = useNow();

  const list = incidents.filter((i) =>
    filter === 'All updates' ? true : filter === 'Safety' ? i.category === 'safety_concern' : i.category !== 'safety_concern'
  );

  return (
    <Screen
      title="Community alerts"
      subtitle="Look out for your fellow Spartans."
      footer={<Button title="Report an update" icon="add" onPress={() => setReportOpen(true)} />}>
      <View style={styles.liveRow}>
        <ThemedText type="smallBold" themeColor="success" style={styles.live}>
          ● LIVE FEED
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          Around SJSU
        </ThemedText>
      </View>
      <View style={styles.chips}>
        {FILTERS.map((f) => (
          <Chip key={f} label={f} selected={filter === f} onPress={() => setFilter(f)} />
        ))}
      </View>

      <ErrorText message={error} />
      {list.length === 0 && (
        <Card>
          <ThemedText type="small" themeColor="textSecondary">
            Nothing reported right now. See something broken or unsafe? Report it and walkers nearby are rerouted around it.
          </ThemedText>
        </Card>
      )}

      {list.map((i) => {
        const hazard = i.category !== 'safety_concern';
        return (
          <Card key={i.id}>
            <View style={styles.cardHead}>
              <View style={[styles.iconBox, { backgroundColor: i.severity === 'high' ? theme.backgroundSelected : theme.amberSoft }]}>
                <Ionicons
                  name={CATEGORY_ICON[i.category] ?? 'alert-circle-outline'}
                  size={22}
                  color={i.severity === 'high' ? theme.danger : hazard ? theme.warning : theme.accent}
                />
              </View>
              <View style={styles.flex}>
                <ThemedText style={styles.cardTitle}>{i.title}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {timeAgo(i.updated_at, now)} · {i.severity} severity
                </ThemedText>
              </View>
              <ThemedText type="smallBold" themeColor={i.eaiser_status === 'in_progress' ? 'accent' : 'textSecondary'}>
                {STATUS_LABEL[i.eaiser_status]}
              </ThemedText>
            </View>
            {i.building && (
              <ThemedText type="smallBold" themeColor="accent">
                {i.building}
              </ThemedText>
            )}
            {i.summary && (
              <ThemedText type="small" themeColor="textSecondary">
                {i.summary}
              </ThemedText>
            )}
            <View style={styles.foot}>
              <ThemedText type="small" themeColor="textSecondary" style={styles.flex}>
                {i.reports_count} student report{i.reports_count === 1 ? '' : 's'}
                {i.eaiser_simulated ? ' · EAiSER simulated' : ''}
              </ThemedText>
              <ThemedText type="smallBold" themeColor="accent" onPress={() => router.navigate('/')}>
                View on map ↗
              </ThemedText>
            </View>
          </Card>
        );
      })}

      <ThemedText type="small" themeColor="textSecondary">
        Student reports, not verified safety information or emergency monitoring. In an emergency, call 911.
      </ThemedText>

      <ReportSheet visible={reportOpen} onClose={() => setReportOpen(false)} />
    </Screen>
  );
}

/** Current time, refreshed every 30 s so "2 min ago" labels stay fresh. */
function useNow() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);
  return now;
}

function timeAgo(iso: string, now: number) {
  const min = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60_000));
  if (min < 1) return 'Just now';
  if (min < 60) return `${min} min ago`;
  const h = Math.round(min / 60);
  return h < 24 ? `${h} hr ago` : `${Math.round(h / 24)} d ago`;
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  liveRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  live: {
    fontSize: 11,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  cardHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  iconBox: {
    width: 40,
    height: 40,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  foot: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
});

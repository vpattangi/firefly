// Campus safety dashboard (demo): live incidents, walkers, reroutes. Aggregates only: no names, no routes.
// Safety staff (rows in public.safety_admins) can mirror EAiSER's status; "Resolved" removes the zone.

import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { Card, ErrorText, Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { WalkMap, type MapZone } from '@/components/walk-map';
import { Spacing } from '@/constants/theme';
import { useIncidents } from '@/hooks/use-incidents';
import { getSafetyOverview, setIncidentStatus, type Incident, type SafetyOverview } from '@/lib/api';
import { CATEGORY_LABEL } from '@/lib/safety';

export default function AdminScreen() {
  const { incidents, refresh } = useIncidents();
  const [overview, setOverview] = useState<SafetyOverview | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadOverview = useCallback(() => {
    getSafetyOverview()
      .then(setOverview)
      .catch((e: Error) => setError(e.message));
  }, []);

  useEffect(() => {
    loadOverview();
    const t = setInterval(loadOverview, 5000);
    return () => clearInterval(t);
  }, [loadOverview]);
  useEffect(loadOverview, [incidents, loadOverview]);

  const setStatus = async (i: Incident, status: Incident['eaiser_status']) => {
    try {
      await setIncidentStatus(i.id, status);
      refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const zones: MapZone[] = incidents.map((z) => ({
    id: z.id,
    latitude: z.lat,
    longitude: z.lng,
    radius: z.radius_m,
    title: z.title,
    description: CATEGORY_LABEL[z.category],
    severity: z.severity,
  }));

  return (
    <Screen safeTop={false}>
      <View style={styles.stats}>
        <Stat n={overview?.active_incidents} label="active problems" />
        <Stat n={overview?.walking_now} label="students walking" />
        <Stat n={overview?.active_groups} label="active groups" />
        <Stat n={overview?.reroutes_last_hour} label="reroutes (1 h)" />
      </View>
      <WalkMap pins={[]} zones={zones} height={280} />
      <ErrorText message={error} />
      {incidents.length === 0 && (
        <Card>
          <ThemedText type="small" themeColor="textSecondary">
            No active problems.
          </ThemedText>
        </Card>
      )}
      {incidents.map((i) => (
        <Card key={i.id}>
          <ThemedText type="smallBold" themeColor={i.severity === 'high' ? 'danger' : 'warning'}>
            {i.title} · {i.severity}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {i.summary}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {i.building ? `${i.building} · ` : ''}
            {i.reports_count} student{i.reports_count === 1 ? '' : 's'} · sent to {i.route_to ?? 'Facilities'} · {i.eaiser_status}
            {i.eaiser_simulated ? ' · EAiSER simulated' : ''}
          </ThemedText>
          {overview?.is_admin && (
            <View style={styles.actions}>
              <View style={styles.flex}>
                <Button compact variant="secondary" title="In progress" onPress={() => setStatus(i, 'in_progress')} />
              </View>
              <View style={styles.flex}>
                <Button compact title="Resolved" onPress={() => setStatus(i, 'resolved')} />
              </View>
            </View>
          )}
        </Card>
      ))}
    </Screen>
  );
}

function Stat({ n, label }: { n: number | undefined; label: string }) {
  return (
    <Card>
      <ThemedText type="subtitle">{n ?? '–'}</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
    </Card>
  );
}

const styles = StyleSheet.create({
  stats: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  actions: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  flex: {
    flex: 1,
  },
});

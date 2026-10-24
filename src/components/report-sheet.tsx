// "Report a problem": photo + a few words -> emergency check -> EAiSER -> live danger zone for everyone.
//
// Emergencies never go into a repair queue: if it sounds like someone is in danger we ask one question,
// put UPD / 911 first, and only afterwards offer a non-descriptive "safety concern" zone so other
// walkers route around the area (no people are described, it expires in 45 minutes).

import { Image } from 'expo-image';
import * as Linking from 'expo-linking';
import * as Location from 'expo-location';
import { useState } from 'react';
import { Modal, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { Card, ErrorText, Field, Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { EmergencyPhone, SafeWalkPhone, Spacing } from '@/constants/theme';
import { submitIncident, type Incident } from '@/lib/api';
import type { LatLng } from '@/lib/directions';
import { classifyReport, type EaiserResult } from '@/lib/eaiser';
import { pickImage, uploadImage, type PickedImage } from '@/lib/images';
import { emergencyCheck } from '@/lib/safety';
import { useSession } from '@/providers/session';

type Step = 'compose' | 'danger' | 'call' | 'sending' | 'done';

export function ReportSheet({
  visible,
  onClose,
  fallbackLocation,
  onSubmitted,
}: {
  visible: boolean;
  onClose: () => void;
  /** Used when GPS isn't available (e.g. the group's meetup point). */
  fallbackLocation?: LatLng | null;
  onSubmitted?: (incident: Incident, merged: boolean) => void;
}) {
  const { session } = useSession();
  const [step, setStep] = useState<Step>('compose');
  const [text, setText] = useState('');
  const [photo, setPhoto] = useState<PickedImage | null>(null);
  const [result, setResult] = useState<{ eaiser: EaiserResult; incident: Incident; merged: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setStep('compose');
    setText('');
    setPhoto(null);
    setResult(null);
    setError(null);
  };
  const close = () => {
    reset();
    onClose();
  };

  const here = async (): Promise<LatLng> => {
    try {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (perm.granted) {
        const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
        return { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
      }
    } catch {
      // fall back below
    }
    if (fallbackLocation) return fallbackLocation;
    throw new Error('Turn on location so we know where the problem is.');
  };

  const takePhoto = async () => {
    try {
      const img = await pickImage({ source: 'camera' });
      if (img) setPhoto(img);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const next = () => {
    setError(null);
    if (!text.trim() && !photo) {
      setError('Add a photo or a few words.');
      return;
    }
    if (emergencyCheck(text).askIfDanger) setStep('danger');
    else send('condition');
  };

  // kind: 'condition' -> normal EAiSER report; 'safety' -> after an emergency call, a vague temporary zone.
  const send = async (kind: 'condition' | 'safety', alreadyAsked = false) => {
    if (!session) return;
    setStep('sending');
    setError(null);
    try {
      const location = await here();
      let eaiser: EaiserResult;
      if (kind === 'safety') {
        eaiser = {
          id: `safety-${Date.now().toString(36)}`,
          issueType: 'Safety concern',
          category: 'safety_concern',
          title: 'Avoid this area for now',
          description: 'A student reported a safety concern and contacted UPD. Details are not shared.',
          severity: 'high',
          building: null,
          routeTo: 'SJSU University Police (UPD), contacted by the reporter',
          status: 'submitted',
          simulated: false,
        };
      } else {
        eaiser = await classifyReport({ text, photoBase64: photo?.base64, location });
        // EAiSER itself may decide it's an emergency (e.g. fire); ask before filing it as a repair.
        if (!alreadyAsked && emergencyCheck(text, eaiser).askIfDanger) {
          setStep('danger');
          return;
        }
      }
      const photoPath =
        kind === 'condition' && photo
          ? await uploadImage('report-photos', `${session.user.id}/report-${Date.now()}.jpg`, photo)
          : null;
      const res = await submitIncident({
        category: eaiser.category,
        title: eaiser.title,
        summary: eaiser.description,
        severity: eaiser.severity,
        building: eaiser.building,
        routeTo: eaiser.routeTo,
        eaiserId: eaiser.id,
        eaiserSimulated: eaiser.simulated,
        lat: location.latitude,
        lng: location.longitude,
        description: kind === 'safety' ? '' : text.trim(),
        photoPath,
      });
      setResult({ eaiser, incident: res.incident, merged: res.merged });
      setStep('done');
      onSubmitted?.(res.incident, res.merged);
    } catch (e) {
      setError((e as Error).message);
      setStep(kind === 'safety' ? 'call' : 'compose');
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={close}>
      <Screen>
        <View style={styles.header}>
          <ThemedText type="subtitle">Report a problem</ThemedText>
          <Button compact variant="secondary" title="Close" onPress={close} />
        </View>

        {step === 'compose' && (
          <>
            <ThemedText type="small" themeColor="textSecondary">
              Broken light, blocked path, flooding, anything unsafe about the route. It goes to the people who fix it, and
              everyone walking nearby is rerouted around it.
            </ThemedText>
            {photo ? (
              <Image source={{ uri: photo.uri }} style={styles.photo} contentFit="cover" />
            ) : null}
            <Button variant="secondary" title={photo ? 'Retake photo' : 'Take a photo'} onPress={takePhoto} />
            <Field label="What's wrong?" placeholder="e.g. the lights on the paseo by the SU are out" value={text}
              onChangeText={setText} multiline />
            <ErrorText message={error} />
            <Button title="Send report" onPress={next} />
            <EmergencyRow />
          </>
        )}

        {step === 'danger' && (
          <Card>
            <ThemedText type="smallBold">Is anyone in danger right now?</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              Emergencies go straight to University Police, not into a repair queue.
            </ThemedText>
            <Button variant="danger" title="Yes, someone may be in danger" onPress={() => setStep('call')} />
            <Button variant="secondary" title="No, it's a problem with the place" onPress={() => send('condition', true)} />
          </Card>
        )}

        {step === 'call' && (
          <>
            <Card>
              <ThemedText type="smallBold" themeColor="danger">
                Call for help first
              </ThemedText>
              <Button variant="danger" title="Call 911" onPress={() => Linking.openURL(`tel:${EmergencyPhone}`)} />
              <Button title="Call SJSU University Police" onPress={() => Linking.openURL(`tel:${SafeWalkPhone}`)} />
            </Card>
            <Card>
              <ThemedText type="smallBold">After you&apos;ve called: warn other walkers?</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                Students walking nearby get rerouted around this spot for 45 minutes. Nothing about any person is shared,
                only &quot;avoid this area, UPD was contacted.&quot;
              </ThemedText>
              <ErrorText message={error} />
              <Button title="Warn walkers nearby" onPress={() => send('safety')} />
            </Card>
          </>
        )}

        {step === 'sending' && (
          <Card>
            <ThemedText type="smallBold">Sending…</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              Classifying with EAiSER and alerting walkers nearby.
            </ThemedText>
          </Card>
        )}

        {step === 'done' && result && (
          <>
            <Card>
              <ThemedText type="smallBold" themeColor="success">
                {result.merged ? `Added to an existing report (${result.incident.reports_count} students)` : 'Report sent'}
              </ThemedText>
              <Row k="Issue type" v={result.eaiser.issueType} />
              <Row k="Severity" v={result.incident.severity} />
              {result.incident.building ? <Row k="Building" v={result.incident.building} /> : null}
              <Row k="Sent to" v={result.incident.route_to ?? result.eaiser.routeTo} />
              <Row k="Status" v={result.incident.eaiser_status} />
              {result.eaiser.simulated && (
                <ThemedText type="small" themeColor="warning">
                  EAiSER simulated on this phone until the EAiSER for Campuses API is connected.
                </ThemedText>
              )}
            </Card>
            <Card>
              <ThemedText type="small" themeColor="textSecondary">
                Walkers within range now see this on their map, and anyone whose route goes through it has been rerouted.
              </ThemedText>
            </Card>
            <Button title="Done" onPress={close} />
          </>
        )}
      </Screen>
    </Modal>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <View style={styles.row}>
      <ThemedText type="small" themeColor="textSecondary">
        {k}
      </ThemedText>
      <ThemedText type="smallBold" style={styles.value}>
        {v}
      </ThemedText>
    </View>
  );
}

function EmergencyRow() {
  return (
    <ThemedText type="small" themeColor="textSecondary">
      Someone in danger? Don&apos;t report it here, call{' '}
      <ThemedText type="smallBold" themeColor="danger" onPress={() => Linking.openURL(`tel:${EmergencyPhone}`)}>
        911
      </ThemedText>
      .
    </ThemedText>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  photo: {
    width: '100%',
    height: 200,
    borderRadius: Spacing.three,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: Spacing.three,
  },
  value: {
    flexShrink: 1,
    textAlign: 'right',
  },
});

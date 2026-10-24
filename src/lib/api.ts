// All database access for the app goes through this file.
// Privacy is enforced by RLS and security-definer RPCs in supabase/migrations/, so the client
// never writes walk/group/share tables directly. See "Privacy rules" in AGENTS.md before changing anything here.

import { supabase } from '@/lib/supabase';

export type VerificationStatus = 'unverified' | 'pending' | 'verified' | 'rejected';
export type Gender = 'woman' | 'man' | 'nonbinary';
/** Who you're willing to walk with. The database only accepts options your gender allows. */
export type BuddyPref = 'anyone' | 'women_nonbinary' | 'women_only';

export type Profile = {
  id: string;
  first_name: string | null;
  university: string | null;
  avatar_path: string | null;
  verification_status: VerificationStatus;
  gender: Gender | null;
};

export type ContactInfo = {
  phone: string | null;
  email: string | null;
  instagram: string | null;
};

export type MeetupPoint = {
  id: string;
  name: string;
  description: string | null;
  is_staffed: boolean;
  lat: number;
  lng: number;
};

export type GroupStatus = 'forming' | 'walking' | 'completed' | 'cancelled';
export type MemberStatus = 'joined' | 'confirmed' | 'arrived' | 'left';

export type GroupMember = {
  user_id: string;
  is_me: boolean;
  /** Name and photo unlock once you've been within ~30 ft of each other (or started walking). */
  revealed: boolean;
  first_name: string | null;
  avatar_path: string | null;
  status: MemberStatus;
  /** Tapped "I'm here" at the meetup. */
  is_here: boolean;
  /** Rounded live distance from you in feet, while both phones are sharing. Never coordinates. */
  distance_ft: number | null;
  split_order: number | null;
  split_lat: number | null;
  split_lng: number | null;
  walk_alone_m: number | null;
};

export type GroupDetails = {
  id: string;
  status: GroupStatus;
  depart_at: string;
  started_at: string | null;
  meetup_point: Omit<MeetupPoint, 'is_staffed'>;
  /** The group walks along one member's route (the anchor). True when that's you or you're alone. */
  is_anchor: boolean;
  /** Path you walk with the group: your own route if anchor, else the anchor's route up to your split. */
  shared_route: [number, number][];
  my_destination: { label: string | null; lat: number; lng: number };
  my_buddy_pref: BuddyPref;
  members: GroupMember[];
};

export type ShareStatus = {
  user_id: string;
  first_name: string | null;
  avatar_path: string | null;
  i_shared: boolean;
  mutual: boolean;
  phone: string | null;
  email: string | null;
  instagram: string | null;
};

export type MutualContact = ContactInfo & {
  user_id: string;
  first_name: string | null;
  avatar_path: string | null;
  connected_at: string;
};

async function rpc<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw new Error(error.message);
  return data as T;
}

export async function fetchProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, first_name, university, avatar_path, verification_status, gender')
    .eq('id', userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

export async function updateProfile(userId: string, fields: Partial<Pick<Profile, 'first_name' | 'avatar_path'>>) {
  const { error } = await supabase.from('profiles').update(fields).eq('id', userId);
  if (error) throw new Error(error.message);
}

export async function fetchContactInfo(userId: string): Promise<ContactInfo | null> {
  const { data, error } = await supabase
    .from('contact_info')
    .select('phone, email, instagram')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

export async function updateContactInfo(userId: string, fields: Partial<ContactInfo>) {
  const { error } = await supabase
    .from('contact_info')
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq('user_id', userId);
  if (error) throw new Error(error.message);
}

export const listMeetupPoints = () => rpc<MeetupPoint[]>('list_meetup_points');

export const submitIdVerification = (idFrontPath: string, selfiePath: string) =>
  rpc<void>('submit_id_verification', { p_id_front_path: idFrontPath, p_selfie_path: selfiePath });

export const createWalkRequest = (args: {
  meetupPointId: string;
  destLat: number;
  destLng: number;
  destLabel: string;
  route: [number, number][];
  departAt: Date;
  buddyPref: BuddyPref;
}) =>
  rpc<string>('create_walk_request', {
    p_meetup_point_id: args.meetupPointId,
    p_dest_lat: args.destLat,
    p_dest_lng: args.destLng,
    p_dest_label: args.destLabel,
    p_route: args.route,
    p_depart_at: args.departAt.toISOString(),
    p_buddy_pref: args.buddyPref,
  });

export const findOrCreateGroup = (requestId: string) =>
  rpc<string>('find_or_create_group', { p_request_id: requestId });

export const getActiveGroup = () => rpc<string | null>('get_active_group');
export const getGroupDetails = (groupId: string) => rpc<GroupDetails>('get_group_details', { p_group: groupId });
export const confirmGroup = (groupId: string) => rpc<void>('confirm_group', { p_group: groupId });
export const startWalk = (groupId: string) => rpc<void>('start_walk', { p_group: groupId });
export const leaveGroup = (groupId: string) => rpc<void>('leave_group', { p_group: groupId });
export const markArrived = (groupId: string) => rpc<void>('mark_arrived', { p_group: groupId });

/** Gender is set through this RPC only, and can't change during an active walk. */
export const setMyGender = (gender: Gender) => rpc<void>('set_my_gender', { p_gender: gender });
/** Shares your position with the server (never with other phones) so it can reveal buddies within ~30 ft. */
export const updateMyPosition = (groupId: string, lat: number, lng: number, accuracy: number | null) =>
  rpc<void>('update_my_position', { p_group: groupId, p_lat: lat, p_lng: lng, p_accuracy: accuracy });
/** "I'm here": only works once you've been within ~30 ft of someone in your group. */
export const markHere = (groupId: string) => rpc<void>('mark_here', { p_group: groupId });

export const getShareStatus = (groupId: string) => rpc<ShareStatus[]>('get_share_status', { p_group: groupId });
export const setContactShare = (groupId: string, toUser: string, share: boolean) =>
  rpc<void>('set_contact_share', { p_group: groupId, p_to_user: toUser, p_share: share });
export const getMutualContacts = () => rpc<MutualContact[]>('get_mutual_contacts');

// ---------------------------------------------------------------------------
// Incidents, danger zones and rerouting (supabase/migrations/0003_incidents.sql)
// ---------------------------------------------------------------------------

export type Incident = {
  id: string;
  category: string;
  title: string;
  summary: string | null;
  severity: 'low' | 'medium' | 'high';
  building: string | null;
  route_to: string | null;
  eaiser_status: 'submitted' | 'in_progress' | 'resolved';
  eaiser_simulated: boolean;
  lat: number;
  lng: number;
  radius_m: number;
  reports_count: number;
  created_at: string;
  updated_at: string;
};

export type SubmitIncidentResult = { merged: boolean; incident: Incident };

export const submitIncident = (args: {
  category: string;
  title: string;
  summary: string;
  severity: string;
  building: string | null;
  routeTo: string | null;
  eaiserId: string | null;
  eaiserSimulated: boolean;
  lat: number;
  lng: number;
  description: string;
  photoPath: string | null;
}) =>
  rpc<SubmitIncidentResult>('submit_incident', {
    p_category: args.category,
    p_title: args.title,
    p_summary: args.summary,
    p_severity: args.severity,
    p_building: args.building,
    p_route_to: args.routeTo,
    p_eaiser_id: args.eaiserId,
    p_eaiser_simulated: args.eaiserSimulated,
    p_lat: args.lat,
    p_lng: args.lng,
    p_description: args.description,
    p_photo_path: args.photoPath,
  });

export const listActiveIncidents = () => rpc<Incident[]>('list_active_incidents');

/** `route` null = only log the reroute (solo leg rerouted on this phone). */
export const updateMyRoute = (groupId: string, route: [number, number][] | null, incidentId: string | null, addedM: number) =>
  rpc<void>('update_my_route', { p_group: groupId, p_route: route, p_incident: incidentId, p_added_m: addedM });

export type SafetyOverview = {
  active_incidents: number;
  reports_today: number;
  active_groups: number;
  walking_now: number;
  reroutes_last_hour: number;
  groups_rerouted_last_hour: number;
  is_admin: boolean;
};

export const getSafetyOverview = () => rpc<SafetyOverview>('get_safety_overview');
export const setIncidentStatus = (incidentId: string, status: Incident['eaiser_status']) =>
  rpc<void>('set_incident_status', { p_incident: incidentId, p_status: status });

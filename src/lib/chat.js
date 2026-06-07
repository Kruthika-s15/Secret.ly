import { supabase } from '@/integrations/supabase/client';

export async function getOrCreateConversation(meId, otherId) {
  if (meId === otherId) throw new Error("Can't chat with yourself");
  const [a, b] = meId < otherId ? [meId, otherId] : [otherId, meId];
  const { data: existing } = await supabase
    .from('conversations').select('*').eq('user_a', a).eq('user_b', b).maybeSingle();
  if (existing) return existing;
  const { data, error } = await supabase
    .from('conversations').insert({ user_a: a, user_b: b }).select().single();
  if (error) throw error;
  return data;
}

export async function searchProfiles(query, excludeId) {
  const q = query.trim();
  if (!q) return [];
  const { data, error } = await supabase
    .from('profiles').select('id, username, display_name, email')
    .or(`username.ilike.%${q}%,email.ilike.%${q}%,display_name.ilike.%${q}%`)
    .neq('id', excludeId).limit(10);
  if (error) throw error;
  return data ?? [];
}

export async function uploadStegoImage(conversationId, blob) {
  const path = `${conversationId}/${crypto.randomUUID()}.png`;
  const { error } = await supabase.storage
    .from('stego-images').upload(path, blob, { contentType: 'image/png', upsert: false });
  if (error) throw error;
  return path;
}

export async function getSignedImageUrl(path) {
  const { data, error } = await supabase.storage
    .from('stego-images').createSignedUrl(path, 60 * 60);
  if (error) throw error;
  return data.signedUrl;
}

export async function sendMessage({ conversationId, senderId, content, imagePath, imageKind }) {
  const { error } = await supabase.from('messages').insert({
    conversation_id: conversationId,
    sender_id: senderId,
    content: content ?? null,
    image_path: imagePath ?? null,
    image_kind: imageKind ?? null,
  });
  if (error) throw error;
}

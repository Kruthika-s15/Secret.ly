import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { ArrowLeft, Download, KeyRound, MessageSquare, Search, Send, Trash2, UserPlus } from 'lucide-react';
import GlowCard from '@/components/layout/GlowCard';
import ShinyButton from '@/components/shared/ShinyButton';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import {
  getOrCreateConversation,
  getSignedImageUrl,
  searchProfiles,
  sendMessage,
} from '@/lib/chat';
import { cn } from '@/lib/utils';

export default function ChatTab({ onDecryptImage }) {
  const { user } = useAuth();
  const [conversations, setConversations] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState('');
  const [search, setSearch] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [imgUrls, setImgUrls] = useState({});
  const [deletingId, setDeletingId] = useState(null);
  const scrollRef = useRef(null);

  const loadConversations = async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from('conversations').select('*')
      .or(`user_a.eq.${user.id},user_b.eq.${user.id}`)
      .order('last_message_at', { ascending: false });
    if (error) return;
    const convs = data ?? [];
    const peerIds = convs.map((c) => (c.user_a === user.id ? c.user_b : c.user_a));
    let peers = [];
    if (peerIds.length) {
      const { data: p } = await supabase.from('profiles')
        .select('id, username, display_name, email').in('id', peerIds);
      peers = p ?? [];
    }
    const merged = convs.map((c) => ({
      ...c,
      peer: peers.find((pp) => pp.id === (c.user_a === user.id ? c.user_b : c.user_a)),
    }));
    setConversations(merged);
    if (!activeId && merged.length) setActiveId(merged[0].id);
  };

  useEffect(() => { loadConversations(); }, [user]);

  // Realtime conversations
  useEffect(() => {
    if (!user) return;
    const channel = supabase.channel('conv-' + user.id)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'conversations' }, loadConversations)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user]);

  // Load messages
  useEffect(() => {
    if (!activeId) { setMessages([]); return; }
    let cancelled = false;
    supabase.from('messages').select('*')
      .eq('conversation_id', activeId)
      .order('created_at', { ascending: true })
      .then(({ data, error }) => {
        if (error || cancelled) return;
        setMessages(data ?? []);
      });
    return () => { cancelled = true; };
  }, [activeId]);

  // Realtime messages — INSERT + DELETE
  useEffect(() => {
    if (!activeId) return;
    const channel = supabase.channel('msgs-' + activeId)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${activeId}` },
        (payload) => {
          setMessages((prev) => {
            // Replace temp message if exists, otherwise add
            const withoutTemp = prev.filter((m) => !m._temp);
            if (withoutTemp.some((m) => m.id === payload.new.id)) return prev;
            return [...withoutTemp, payload.new];
          });
        }
      )
      .on('postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'messages', filter: `conversation_id=eq.${activeId}` },
        (payload) => {
          setMessages((prev) => prev.filter((m) => m.id !== payload.old.id));
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [activeId]);

  // Resolve image URLs
  useEffect(() => {
    const missing = messages.filter((m) => m.image_path && !imgUrls[m.image_path]);
    if (!missing.length) return;
    (async () => {
      const updates = {};
      for (const m of missing) {
        try { updates[m.image_path] = await getSignedImageUrl(m.image_path); } catch {}
      }
      if (Object.keys(updates).length) setImgUrls((u) => ({ ...u, ...updates }));
    })();
  }, [messages]);

  // Auto scroll
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, activeId]);

  // Search
  useEffect(() => {
    if (!user || !search.trim()) { setResults([]); return; }
    setSearching(true);
    const t = setTimeout(async () => {
      try { setResults(await searchProfiles(search, user.id)); }
      finally { setSearching(false); }
    }, 250);
    return () => clearTimeout(t);
  }, [search, user]);

  const startChatWith = async (p) => {
    if (!user) return;
    try {
      const c = await getOrCreateConversation(user.id, p.id);
      setActiveId(c.id);
      setSearch('');
      setResults([]);
      setConversations((prev) => prev.some((x) => x.id === c.id) ? prev : [{ ...c, peer: p }, ...prev]);
    } catch (e) { toast.error(e.message); }
  };

  const onSend = async () => {
  if (!user || !activeId || !draft.trim()) return;
  const text = draft.trim();
  setDraft('');
  try {
    const { data, error } = await supabase.from('messages').insert({
      conversation_id: activeId,
      sender_id: user.id,
      content: text,
    }).select().single();
    if (error) throw error;
    // Add directly — don't wait for realtime
    setMessages((prev) => {
      if (prev.some((m) => m.id === data.id)) return prev;
      return [...prev, data];
    });
  } catch (e) {
    toast.error(e.message);
    setDraft(text);
  }
};

  const onUnsend = async (msg) => {
    if (msg.sender_id !== user?.id || msg._temp) return;
    setDeletingId(msg.id);
    try {
      const { error } = await supabase.from('messages').delete().eq('id', msg.id);
      if (error) throw error;
      setMessages((prev) => prev.filter((m) => m.id !== msg.id));
      toast.success('Message unsent');
    } catch (e) {
      toast.error(e.message);
    } finally {
      setDeletingId(null);
    }
  };

  const downloadImage = async (path) => {
    try {
      const url = imgUrls[path] ?? (await getSignedImageUrl(path));
      const res = await fetch(url);
      const blob = await res.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'secret-stego.png';
      document.body.appendChild(a); a.click(); a.remove();
    } catch { toast.error('Download failed'); }
  };

  const decryptImage = async (path) => {
    try {
      const url = imgUrls[path] ?? (await getSignedImageUrl(path));
      onDecryptImage?.(url, 'secret-stego.png');
    } catch { toast.error('Could not load image'); }
  };

  const active = useMemo(() => conversations.find((c) => c.id === activeId), [conversations, activeId]);

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[300px_1fr]">
      {/* Sidebar */}
      <GlowCard className={cn(activeId ? 'hidden lg:block' : 'block')}>
        <div className="flex h-[70vh] max-h-[600px] min-h-[420px] flex-col p-4">
          <header className="mb-3 flex items-center gap-2 text-primary">
            <MessageSquare className="h-4 w-4" />
            <h2 className="text-sm uppercase tracking-widest">Chats</h2>
          </header>
          <div className="relative mb-3">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search username or email"
              className="w-full rounded-xl border border-border/60 bg-input/60 py-2 pl-10 pr-3 text-sm outline-none focus:ring-2 focus:ring-primary/40"
            />
          </div>
          <div className="flex-1 space-y-1 overflow-y-auto pr-1">
            {search.trim() ? (
              <>
                {searching && <p className="px-2 text-xs text-muted-foreground">Searching…</p>}
                {!searching && results.length === 0 && <p className="px-2 text-xs text-muted-foreground">No users found</p>}
                {results.map((p) => (
                  <button key={p.id} onClick={() => startChatWith(p)}
                    className="flex w-full items-center gap-3 rounded-lg border border-transparent p-2 text-left transition hover:border-border hover:bg-card/40">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-primary text-xs font-bold text-primary-foreground">
                      {p.username[0]?.toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">@{p.username}</p>
                      <p className="truncate text-[11px] text-muted-foreground">{p.email}</p>
                    </div>
                    <UserPlus className="h-4 w-4 shrink-0 text-primary" />
                  </button>
                ))}
              </>
            ) : conversations.length === 0 ? (
              <p className="px-2 text-xs text-muted-foreground">Search for a user to start chatting</p>
            ) : (
              conversations.map((c) => (
                <button key={c.id} onClick={() => setActiveId(c.id)}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-lg border p-2 text-left transition',
                    activeId === c.id ? 'border-primary/60 bg-primary/10' : 'border-transparent hover:border-border hover:bg-card/40'
                  )}>
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-primary text-xs font-bold text-primary-foreground">
                    {c.peer?.username?.[0]?.toUpperCase() ?? '?'}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">@{c.peer?.username ?? 'unknown'}</p>
                    <p className="truncate text-[11px] text-muted-foreground">
                      {new Date(c.last_message_at).toLocaleString()}
                    </p>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      </GlowCard>

      {/* Messages */}
      <GlowCard className={cn(activeId ? 'block' : 'hidden lg:block')}>
        <div className="flex h-[70vh] max-h-[600px] min-h-[420px] flex-col -m-6">
          <header className="border-b border-border/40 p-4">
            {active ? (
              <div className="flex items-center gap-3">
                <button type="button" onClick={() => setActiveId(null)}
                  className="lg:hidden -ml-1 mr-1 rounded-md p-1 text-muted-foreground hover:text-foreground">
                  <ArrowLeft className="h-4 w-4" />
                </button>
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-primary text-sm font-bold text-primary-foreground">
                  {active.peer?.username?.[0]?.toUpperCase() ?? '?'}
                </div>
                <div>
                  <p className="text-sm font-semibold">@{active.peer?.username ?? 'unknown'}</p>
                  <p className="text-[11px] text-muted-foreground">{active.peer?.email}</p>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Select a conversation</p>
            )}
          </header>

          <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto p-4">
            {messages.map((m) => {
              const mine = m.sender_id === user?.id;
              const url = m.image_path ? imgUrls[m.image_path] : null;
              const isDeleting = deletingId === m.id;
              return (
                <div key={m.id} className={cn('group flex items-end gap-1', mine ? 'justify-end' : 'justify-start')}>
                  {mine && (
                    <button
                      onClick={() => onUnsend(m)}
                      disabled={isDeleting || m._temp}
                      className="mb-1 shrink-0 rounded-md p-1 text-muted-foreground opacity-0 transition group-hover:opacity-100 hover:text-red-400 disabled:opacity-30"
                      title="Unsend"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                  <div className={cn(
                    'max-w-[80%] space-y-2 rounded-2xl px-4 py-2 text-sm transition-opacity',
                    mine ? 'bg-gradient-primary text-primary-foreground' : 'border border-border bg-card/60 text-foreground',
                    isDeleting && 'opacity-40',
                    m._temp && 'opacity-70'
                  )}>
                    {m.content && <p className="whitespace-pre-wrap break-words">{m.content}</p>}
                    {m.image_path && (
                      <div className="space-y-2">
                        {url
                          ? <img src={url} alt="stego" className="max-h-64 rounded-lg ring-1 ring-border" />
                          : <div className="h-24 w-48 animate-pulse rounded-lg bg-muted/30" />
                        }
                        <div className="flex flex-wrap gap-1.5">
                          <button onClick={() => downloadImage(m.image_path)}
                            className={cn(
                              'inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-medium transition',
                              mine ? 'bg-black/30 hover:bg-black/40' : 'border border-border hover:bg-accent'
                            )}>
                            <Download className="h-3 w-3" /> Download
                          </button>
                          {!mine && (
                            <button onClick={() => decryptImage(m.image_path)}
                              className="inline-flex items-center gap-1.5 rounded-md border border-primary/60 bg-primary/10 px-2 py-1 text-[11px] font-medium text-primary transition hover:bg-primary/20">
                              <KeyRound className="h-3 w-3" /> Decrypt
                            </button>
                          )}
                        </div>
                        {m.image_kind && (
                          <p className="text-[10px] uppercase tracking-widest opacity-70">{m.image_kind}</p>
                        )}
                      </div>
                    )}
                    <p className="text-right text-[10px] opacity-60">
                      {m._temp ? 'sending…' : new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                </div>
              );
            })}
            {active && messages.length === 0 && (
              <p className="text-center text-xs text-muted-foreground">
                No messages yet — say hi or send a stego image from Image Hide tab.
              </p>
            )}
          </div>

          {active && (
            <div className="flex items-end gap-2 border-t border-border/40 p-3">
              <textarea
                rows={1}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onSend(); } }}
                placeholder="Type a message…"
                className="flex-1 resize-none rounded-xl border border-border/60 bg-input/60 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/40"
              />
              <ShinyButton onClick={onSend} disabled={!draft.trim()}>
                <Send className="h-4 w-4" />
              </ShinyButton>
            </div>
          )}
        </div>
      </GlowCard>
    </div>
  );
}
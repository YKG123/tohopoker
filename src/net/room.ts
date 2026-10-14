// Peer-to-peer rooms over WebRTC, found by room code. Trystero announces the room on public Nostr relays
// (many independent operators; no account, nothing to pay for); once the browsers find each other the game
// traffic goes directly between them. The room code doubles as the password that encrypts the handshake.
import { joinRoom } from 'trystero/nostr';

const APP_ID = 'imperishable-poker-night';
/** No 0/O or 1/I/L: codes get read out over voice chat. */
const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const CODE_LENGTH = 5;

export const newRoomCode = (): string =>
  Array.from(crypto.getRandomValues(new Uint32Array(CODE_LENGTH)), (n) => CODE_CHARS[n % CODE_CHARS.length]).join('');

/** Uppercases and drops anything that can't be in a code. */
export const cleanCode = (text: string): string =>
  text.toUpperCase().split('').filter((c) => CODE_CHARS.includes(c)).join('').slice(0, CODE_LENGTH);

export interface Link<In, Out> {
  send(msg: Out, to?: string): void;
  onMessage: (msg: In, peer: string) => void;
  onJoin: (peer: string) => void;
  onLeave: (peer: string) => void;
  close(): void;
}

/** Joins room `code`. Messages are JSON; the handlers are set by the caller after opening. */
export function openRoom<In, Out>(code: string): Link<In, Out> {
  if (new URLSearchParams(location.search).get('net') === 'local') return openLocalRoom(code);
  const room = joinRoom({ appId: APP_ID, password: code }, code);
  const action = room.makeAction<string>('msg');
  const link: Link<In, Out> = {
    send: (msg, to) => void action.send(JSON.stringify(msg), to ? { target: to } : undefined).catch(() => undefined),
    onMessage: () => undefined,
    onJoin: () => undefined,
    onLeave: () => undefined,
    close: () => void room.leave(),
  };
  action.onMessage = (data, { peerId }) => {
    let msg: In;
    try {
      msg = JSON.parse(data) as In;
    } catch {
      return;
    }
    link.onMessage(msg, peerId);
  };
  room.onPeerJoin = (peer) => link.onJoin(peer);
  room.onPeerLeave = (peer) => link.onLeave(peer);
  return link;
}

interface LocalPacket {
  room: string;
  from: string;
  to?: string;
  k: 'join' | 'here' | 'leave' | 'msg';
  data?: string;
}

/**
 * Testing without the internet (`?net=local`): tabs of one browser find each other over a BroadcastChannel,
 * with the same join/leave and message behaviour as a real room.
 */
function openLocalRoom<In, Out>(code: string): Link<In, Out> {
  const id = Math.random().toString(36).slice(2);
  const channel = new BroadcastChannel('imperishable-poker-night');
  const peers = new Set<string>();
  const post = (p: Omit<LocalPacket, 'room' | 'from'>) => channel.postMessage({ ...p, room: code, from: id });
  const link: Link<In, Out> = {
    send: (msg, to) => post({ k: 'msg', data: JSON.stringify(msg), to }),
    onMessage: () => undefined,
    onJoin: () => undefined,
    onLeave: () => undefined,
    close: () => {
      post({ k: 'leave' });
      channel.close();
      removeEventListener('pagehide', bye);
    },
  };
  const bye = () => post({ k: 'leave' });
  addEventListener('pagehide', bye);
  channel.onmessage = ({ data: p }: MessageEvent<LocalPacket>) => {
    if (p.room !== code || p.from === id || (p.to && p.to !== id)) return;
    if (p.k === 'leave') {
      if (peers.delete(p.from)) link.onLeave(p.from);
      return;
    }
    if (!peers.has(p.from)) {
      peers.add(p.from);
      if (p.k === 'join') post({ k: 'here', to: p.from });
      link.onJoin(p.from);
    }
    if (p.k === 'msg' && p.data) link.onMessage(JSON.parse(p.data) as In, p.from);
  };
  // Let the caller set its handlers before anyone answers.
  setTimeout(() => post({ k: 'join' }));
  return link;
}

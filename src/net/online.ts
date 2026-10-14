// Online play from the menus: hosting a room (lobby, AI picks, games) and joining one.
import { MAX_SEATS } from '../engine/match';
import { ClientLobby, hostLobby, loadNetSettings, notice, profileScreen } from '../game/netScreens';
import { selectScreen } from '../game/screens';
import { stopBgm } from '../ui/assets';
import { ClientLink, playClientGame } from './client';
import { HostSession, playNetGame } from './host';
import type { ClientMsg, HostMsg } from './protocol';
import { newRoomCode, openRoom } from './room';

/** How long to look for a room, or wait for a lost host, before giving up. */
const FIND_TIMEOUT = 30_000;

export async function hostRoom(stage: HTMLElement): Promise<void> {
  const picked = await profileScreen(stage, false);
  if (!picked) return;
  const settings = loadNetSettings();
  const code = newRoomCode();
  const s = new HostSession(picked.profile, settings, openRoom<ClientMsg, HostMsg>(code), code);
  while (true) {
    const lobby = hostLobby(stage, s.code, () => s.lobbyPlayers(), settings, () => s.lobbyChanged());
    s.onChange = () => lobby.refresh();
    const choice = await lobby.done;
    s.onChange = () => undefined;
    if (!choice) break;
    // The host picks the AI opponents now; anyone who joined meanwhile still gets a seat if there's room.
    const people = s.players.filter((p) => p.peer).length;
    const count = Math.min(settings.ais, MAX_SEATS - 1 - people);
    const ais = count > 0 ? await selectScreen(stage, count) : [];
    if (!s.players.some((p) => p.peer) && !ais.length) continue; // everyone left meanwhile
    await playNetGame(stage, s, ais);
  }
  s.close();
  stopBgm();
}

export async function joinRoom(stage: HTMLElement): Promise<void> {
  const picked = await profileScreen(stage, true);
  if (!picked) return;
  const { profile, code } = picked;
  const net = new ClientLink(code, profile);
  const lobby = new ClientLobby(stage, code);
  lobby.onLeave = () => net.inbox.push({ t: 'leave' });
  // Gives up if the room can't be found (or the host doesn't come back).
  let giveUp = 0;
  const lookFor = (reason: string) => {
    window.clearTimeout(giveUp);
    giveUp = window.setTimeout(() => !net.connected && net.inbox.push({ t: 'bye', reason }), FIND_TIMEOUT);
  };
  lookFor(`Couldn't find room ${code}.\nCheck the code, and that the host's room is open.`);
  const waiting = 'Waiting for the host to start the game...';

  /** Back mid-game: shown until the host seats them again. */
  let rejoining = '';
  let farewell = '';
  loop: while (true) {
    let msg = await net.inbox.next();
    if (msg.t === 'start') {
      window.clearTimeout(giveUp);
      rejoining = '';
      lobby.show(false);
      msg = await playClientGame(stage, net, msg);
      lobby.show(true);
      if (msg.t === 'end') {
        lobby.status(waiting);
        continue;
      }
    }
    switch (msg.t) {
      case 'lobby':
        window.clearTimeout(giveUp);
        lobby.update(msg.players, msg.settings);
        lobby.status(msg.playing ? rejoining || 'A game is under way...' : waiting);
        break;
      case 'wait':
        rejoining = msg.text;
        lobby.status(msg.text);
        break;
      case 'lost':
        lobby.status('Lost the connection to the host. Reconnecting...');
        lookFor('Lost the connection to the host.');
        break;
      case 'bye':
        farewell = msg.reason;
        break loop;
      case 'leave':
        break loop;
      default:
        break;
    }
  }
  window.clearTimeout(giveUp);
  net.close();
  if (farewell) await notice(stage, farewell);
  lobby.remove();
  stopBgm();
}

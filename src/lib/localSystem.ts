import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { db } from './firebase';

export type Winner = 'red' | 'blue';
type Vote = Winner | null;
type Handler = (...args: any[]) => void;
type Referee = { name: string; socketId: string | null };
type Round = { id: number; winner: Winner; timestamp: string; votes: Record<string, Vote> };
type Match = { id: number; title: string; redTeam: string; blueTeam: string; rounds: Round[] };
type Message = { sender: string; text: string; timestamp: string };
type State = {
  referees: Record<string, Referee>;
  votes: Record<string, Vote>;
  winner: Winner | null;
  messages: Message[];
  rounds: Round[];
  matches: Match[];
  settings: { roundDuration: number };
  passwords: Record<string, string>;
};

const defaultState = (): State => ({
  referees: { '1': { name: 'علي', socketId: null }, '2': { name: 'حسين', socketId: null }, '3': { name: 'عباس', socketId: null } },
  votes: { '1': null, '2': null, '3': null }, winner: null, messages: [], rounds: [], matches: [],
  settings: { roundDuration: 0 },
  // Credentials are loaded from Firestore. Never publish fallback passwords in this static app.
  passwords: { '1': '', '2': '', '3': '', jury: '' },
});

let state = defaultState();
const sockets = new Set<LocalSocket>();
const channel = new BroadcastChannel('taekwondo-static-system-v1');
const systemDocument = doc(db, 'systems', 'taekwondo-default');
let resetTimer: number | undefined;

function copy<T>(value: T): T { return structuredClone(value); }
function displayMatch() { return copy(state.matches.at(-1) || { id: 1, title: 'النزال رقم 1', redTeam: 'الفريق الأحمر', blueTeam: 'الفريق الأزرق', rounds: [] }); }
function notifyAll(event: string, ...args: any[]) { sockets.forEach(socket => socket.receive(event, ...args)); }

function announce(previous?: State) {
  notifyAll('update_referees', copy(state.referees));
  notifyAll('update_votes', copy(state.votes));
  notifyAll('update_settings', copy(state.settings));
  notifyAll('update_history', copy(state.rounds));
  notifyAll('update_matches', copy(state.matches));
  notifyAll('update_display', displayMatch());
  if (state.winner) notifyAll('round_result', { winner: state.winner });
  if (previous) state.messages.slice(previous.messages.length).forEach(message => notifyAll('receive_message', message));
}

function broadcast(previous?: State) {
  channel.postMessage({ type: 'state', state: copy(state) });
  void setDoc(systemDocument, copy(state)).catch((error) => {
    console.error('تعذر حفظ حالة النظام في Firestore:', error);
  });
  announce(previous);
}

onSnapshot(systemDocument, (snapshot) => {
  if (!snapshot.exists()) {
    void setDoc(systemDocument, copy(state)).catch((error) => console.error('تعذر إنشاء حالة النظام في Firestore:', error));
    return;
  }
  const previous = copy(state);
  state = snapshot.data() as State;
  announce(previous);
}, (error) => console.error('تعذر الاتصال بـ Firestore:', error));

channel.onmessage = (event: MessageEvent) => {
  if (event.data?.type === 'request-state') {
    channel.postMessage({ type: 'state', state: copy(state) });
    return;
  }
  if (event.data?.type !== 'state') return;
  const previous = copy(state);
  state = event.data.state as State;
  announce(previous);
};

export class LocalSocket {
  readonly id = crypto.randomUUID();
  private handlers = new Map<string, Set<Handler>>();
  jury = false;

  constructor() {
    sockets.add(this);
    queueMicrotask(() => {
      this.receive('connect');
      announce();
      channel.postMessage({ type: 'request-state' });
    });
  }

  on(event: string, handler: Handler) { if (!this.handlers.has(event)) this.handlers.set(event, new Set()); this.handlers.get(event)!.add(handler); return this; }
  receive(event: string, ...args: any[]) { this.handlers.get(event)?.forEach(handler => handler(...args)); }
  disconnect() {
    Object.values(state.referees).forEach(referee => { if (referee.socketId === this.id) referee.socketId = null; });
    sockets.delete(this); broadcast(); this.receive('disconnect');
  }

  emit(event: string, payload?: any, callback?: (response: any) => void) {
    const previous = copy(state);
    if (event === 'authenticate_jury') { this.jury = payload === state.passwords.jury; callback?.({ success: this.jury }); return this; }
    if (event === 'claim_referee') {
      const referee = state.referees[payload.id];
      if (!referee) this.receive('claim_error', 'الحكم غير موجود');
      else if (referee.socketId) this.receive('claim_error', 'هذا الحكم متصل حالياً');
      else if (payload.password !== state.passwords[payload.id]) this.receive('claim_error', 'رمز المرور غير صحيح');
      else { referee.socketId = this.id; broadcast(previous); this.receive('claim_success', payload.id); }
      return this;
    }
    if (event === 'submit_vote') {
      const { refereeId, color } = payload;
      if (state.referees[refereeId]?.socketId !== this.id) { this.receive('vote_error', 'لا يمكنك التصويت إلا من دور الحكم الذي سجلت دخوله'); return this; }
      if (state.votes[refereeId]) { this.receive('vote_error', 'تم تسجيل تصويت هذا الحكم لهذه الجولة'); return this; }
      state.votes[refereeId] = color;
      const colors = Object.values(state.votes);
      const winner: Winner | null = colors.filter(vote => vote === 'red').length >= 2 ? 'red' : colors.filter(vote => vote === 'blue').length >= 2 ? 'blue' : null;
      if (winner) {
        state.winner = winner;
        const round: Round = { id: state.rounds.length + 1, winner, timestamp: new Date().toISOString(), votes: copy(state.votes) };
        state.rounds.push(round);
        let match = state.matches.at(-1);
        if (!match || match.rounds.length === 3) { match = { id: state.matches.length + 1, title: `النزال رقم ${state.matches.length + 1}`, redTeam: 'الفريق الأحمر', blueTeam: 'الفريق الأزرق', rounds: [] }; state.matches.push(match); }
        match.rounds.push(round);
        if (resetTimer) clearTimeout(resetTimer);
        resetTimer = window.setTimeout(() => this.resetRound(), 30000);
      }
      broadcast(previous); return this;
    }
    if (event === 'trigger_reset') { if (!this.jury) { callback?.({ success: false, message: 'يجب تسجيل دخول لجنة التحكيم أولاً' }); return this; } this.resetRound(); callback?.({ success: true }); return this; }
    if (event === 'send_message') { state.messages.push(payload); broadcast(previous); return this; }
    if (event === 'set_settings') {
      if (!this.jury) { callback?.({ success: false, message: 'يجب تسجيل دخول لجنة التحكيم أولاً' }); return this; }
      if (payload.names) Object.entries(payload.names).forEach(([id, name]) => { if (state.referees[id]) state.referees[id].name = name as string; });
      if (payload.roundDuration !== undefined) state.settings.roundDuration = payload.roundDuration;
      if (payload.passwords) {
        const values = ['1', '2', '3', 'jury'].map(key => payload.passwords[key]?.trim());
        if (values.some(value => !value)) { callback?.({ success: false, message: 'يجب إدخال رمز لكل حكم ولجنة التحكيم' }); return this; }
        if (new Set(values.slice(0, 3)).size !== 3) { callback?.({ success: false, message: 'يجب أن يكون لكل حكم رمز مختلف' }); return this; }
        state.passwords = payload.passwords;
      }
      broadcast(previous); callback?.({ success: true }); return this;
    }
    if (event === 'update_match_metadata') {
      if (!this.jury) { callback?.({ success: false, message: 'يجب تسجيل دخول لجنة التحكيم أولاً' }); return this; }
      const match = state.matches.find(item => item.id === payload.id);
      if (!match || !payload.title?.trim() || !payload.redTeam?.trim() || !payload.blueTeam?.trim()) { callback?.({ success: false, message: 'أدخل اسم النزال والفريقين' }); return this; }
      Object.assign(match, { title: payload.title.trim(), redTeam: payload.redTeam.trim(), blueTeam: payload.blueTeam.trim() });
      broadcast(previous); callback?.({ success: true }); return this;
    }
    return this;
  }

  private resetRound() {
    if (resetTimer) clearTimeout(resetTimer); resetTimer = undefined;
    state.votes = { '1': null, '2': null, '3': null }; state.winner = null;
    broadcast(); notifyAll('round_reset');
  }
}

export function createLocalSocket() { return new LocalSocket(); }

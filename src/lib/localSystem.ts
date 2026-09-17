import { doc, onSnapshot, runTransaction, setDoc } from 'firebase/firestore';
import { db } from './firebase';

export type Winner = 'red' | 'blue';
type Vote = Winner | null;
type Handler = (...args: any[]) => void;
type Referee = { name: string; socketId: string | null; lastSeen?: number };
type Round = { id: number; winner: Winner; timestamp: string; votes: Record<string, Vote> };
type Match = { id: number; title: string; redTeam: string; blueTeam: string; rounds: Round[] };
type DisplayResult = { winner: Winner; kind: 'round' | 'match'; roundNumber: number };
type Message = { sender: string; text: string; timestamp: string };
type State = {
  referees: Record<string, Referee>;
  votes: Record<string, Vote>;
  winner: Winner | null;
  displayResult: DisplayResult | null;
  messages: Message[];
  rounds: Round[];
  matches: Match[];
  settings: { roundDuration: number };
  passwords: Record<string, string>;
};

const defaultState = (): State => ({
  referees: { '1': { name: 'علي', socketId: null }, '2': { name: 'حسين', socketId: null }, '3': { name: 'عباس', socketId: null } },
  votes: { '1': null, '2': null, '3': null }, winner: null, displayResult: null, messages: [], rounds: [], matches: [],
  settings: { roundDuration: 0 },
  // Credentials are loaded from Firestore. Never publish fallback passwords in this static app.
  passwords: { '1': '', '2': '', '3': '', jury: '' },
});

let state = defaultState();
const sockets = new Set<LocalSocket>();
const channel = new BroadcastChannel('muay-thai-static-system-v1');
const systemDocument = doc(db, 'systems', 'muay-thai-default');
let resetTimer: number | undefined;
const REFEREE_LEASE_MS = 20_000;
let staleCleanupTimer: number | undefined;

function copy<T>(value: T): T { return structuredClone(value); }
function refereeIsStale(referee: Referee) { return Boolean(referee.socketId && (!referee.lastSeen || Date.now() - referee.lastSeen > REFEREE_LEASE_MS)); }
function clearStaleReferee(referee: Referee) {
  if (!refereeIsStale(referee)) return false;
  referee.socketId = null;
  delete referee.lastSeen;
  return true;
}
function announceLocalState(previous?: State) {
  channel.postMessage({ type: 'state', state: copy(state) });
  announce(previous);
}

async function releaseStaleReferees() {
  const previous = copy(state);
  try {
    const result = await runTransaction(db, async (transaction) => {
      const snapshot = await transaction.get(systemDocument);
      if (!snapshot.exists()) return { current: state, changed: false };
      const current = snapshot.data() as State;
      const changed = Object.values(current.referees).some(clearStaleReferee);
      if (changed) transaction.set(systemDocument, current);
      return { current, changed };
    });
    if (result.changed) {
      state = result.current;
      announceLocalState(previous);
    }
  } catch (error) {
    console.error('تعذر تحرير جلسة الحكم المنتهية:', error);
  }
}
function displayMatch() { return copy(state.matches.at(-1) || { id: 1, title: 'النزال رقم 1', redTeam: 'الفريق الأحمر', blueTeam: 'الفريق الأزرق', rounds: [] }); }
function notifyAll(event: string, ...args: any[]) { sockets.forEach(socket => socket.receive(event, ...args)); }

function announce(previous?: State) {
  notifyAll('update_referees', copy(state.referees));
  notifyAll('update_votes', copy(state.votes));
  notifyAll('update_settings', copy(state.settings));
  notifyAll('update_history', copy(state.rounds));
  notifyAll('update_matches', copy(state.matches));
  notifyAll('update_display', displayMatch());
  notifyAll('update_display_result', state.displayResult ?? null);
  if (state.winner) notifyAll('round_result', { winner: state.winner });
  if (previous) state.messages.slice(previous.messages.length).forEach(message => notifyAll('receive_message', message));
}

function broadcast(previous?: State) {
  announceLocalState(previous);
  void setDoc(systemDocument, copy(state)).catch((error) => {
    console.error('تعذر حفظ حالة النظام في Firestore:', error);
  });
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
  private claimedRefereeId: string | null = null;
  private heartbeat: number | undefined;
  private disconnected = false;
  private advancing = false;
  jury = false;

  constructor() {
    sockets.add(this);
    if (!staleCleanupTimer) staleCleanupTimer = window.setInterval(() => { void releaseStaleReferees(); }, 5_000);
    queueMicrotask(() => {
      this.receive('connect');
      announce();
      channel.postMessage({ type: 'request-state' });
    });
  }

  on(event: string, handler: Handler) { if (!this.handlers.has(event)) this.handlers.set(event, new Set()); this.handlers.get(event)!.add(handler); return this; }
  receive(event: string, ...args: any[]) { this.handlers.get(event)?.forEach(handler => handler(...args)); }
  disconnect() {
    if (this.disconnected) return;
    this.disconnected = true;
    if (this.heartbeat) window.clearInterval(this.heartbeat);
    void this.releaseClaim();
    sockets.delete(this);
    if (sockets.size === 0 && staleCleanupTimer) {
      window.clearInterval(staleCleanupTimer);
      staleCleanupTimer = undefined;
    }
    this.receive('disconnect');
  }

  emit(event: string, payload?: any, callback?: (response: any) => void) {
    const previous = copy(state);
    if (event === 'authenticate_jury') { this.jury = payload === state.passwords.jury; callback?.({ success: this.jury }); return this; }
    if (event === 'claim_referee') { void this.claimReferee(payload); return this; }
    if (event === 'submit_vote') { void this.submitVote(payload); return this; }
    if (event === 'set_display_winner') {
      if (!this.jury) { callback?.({ success: false, message: 'يجب تسجيل دخول لجنة التحكيم أولاً' }); return this; }
      if (payload !== 'red' && payload !== 'blue') { callback?.({ success: false, message: 'اختر الأحمر أو الأزرق' }); return this; }
      const match = state.matches.at(-1);
      const roundNumber = Math.min(match?.rounds.length || 1, 3);
      const isFinalMatchResult = Boolean(match && match.rounds.length === 3);
      const redWins = match?.rounds.filter((round) => round.winner === 'red').length || 0;
      const finalWinner: Winner = redWins >= 2 ? 'red' : 'blue';
      state.displayResult = { winner: isFinalMatchResult ? finalWinner : payload, kind: isFinalMatchResult ? 'match' : 'round', roundNumber };
      broadcast(previous);
      if (resetTimer) clearTimeout(resetTimer);
      // تظهر نتيجة كل جولة 25 ثانية، ثم يُصفّر العرض ويبدأ الحكام الجولة التالية.
      if (!isFinalMatchResult) resetTimer = window.setTimeout(() => this.resetRound(), 25_000);
      callback?.({ success: true });
      return this;
    }
    if (event === 'trigger_reset') { if (!this.jury) { callback?.({ success: false, message: 'يجب تسجيل دخول لجنة التحكيم أولاً' }); return this; } this.resetRound(); callback?.({ success: true }); return this; }
    if (event === 'advance_to_next_match') {
      if (!this.jury) { callback?.({ success: false, message: 'يجب تسجيل دخول لجنة التحكيم أولاً' }); return this; }
      if (this.advancing) { callback?.({ success: false, message: 'جارٍ فتح النزال التالي' }); return this; }
      this.advancing = true;
      void this.advanceToNextMatch().finally(() => { this.advancing = false; });
      callback?.({ success: true }); return this;
    }
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
    if (event === 'ensure_current_match') {
      if (!this.jury) { callback?.({ success: false, message: 'يجب تسجيل دخول لجنة التحكيم أولاً' }); return this; }
      void this.ensureCurrentMatch(callback);
      return this;
    }
    return this;
  }

  private resetRound() {
    if (resetTimer) clearTimeout(resetTimer); resetTimer = undefined;
    state.votes = { '1': null, '2': null, '3': null }; state.winner = null; state.displayResult = null;
    broadcast(); notifyAll('round_reset');
  }

  private async claimReferee(payload: { id: string; password: string }) {
    const previous = copy(state);
    try {
      const next = await runTransaction(db, async (transaction) => {
        const snapshot = await transaction.get(systemDocument);
        const current = (snapshot.exists() ? snapshot.data() : state) as State;
        const referee = current.referees?.[payload.id];
        if (!referee) throw new Error('الحكم غير موجود');
        clearStaleReferee(referee);
        if (referee.socketId) throw new Error('هذا الحكم متصل حالياً');
        if (payload.password !== current.passwords?.[payload.id]) throw new Error('رمز المرور غير صحيح');
        referee.socketId = this.id;
        referee.lastSeen = Date.now();
        transaction.set(systemDocument, current);
        return current;
      });
      state = next;
      this.claimedRefereeId = payload.id;
      this.startHeartbeat();
      announceLocalState(previous);
      this.receive('claim_success', payload.id);
    } catch (error) {
      this.receive('claim_error', error instanceof Error ? error.message : 'تعذر تسجيل الدخول');
    }
  }

  private async submitVote(payload: { refereeId: string; color: Winner }) {
    const previous = copy(state);
    try {
      const next = await runTransaction(db, async (transaction) => {
        const snapshot = await transaction.get(systemDocument);
        const current = (snapshot.exists() ? snapshot.data() : state) as State;
        if (current.referees?.[payload.refereeId]?.socketId !== this.id) throw new Error('لا يمكنك التصويت إلا من دور الحكم الذي سجلت دخوله');
        if (current.winner) throw new Error('انتهت هذه الجولة بالفعل ولا يقبل النظام تصويتًا متأخرًا');
        if (current.votes?.[payload.refereeId]) throw new Error('تم تسجيل تصويت هذا الحكم لهذه الجولة');
        current.votes[payload.refereeId] = payload.color;
        const votes = Object.values(current.votes);
        // تنتظر اللجنة أصوات الحكام الثلاثة؛ لا يُحسم القرار بمجرد أول صوتين متطابقين.
        const allRefereesVoted = votes.length === 3 && votes.every((vote): vote is Winner => vote === 'red' || vote === 'blue');
        const winner: Winner | null = allRefereesVoted
          ? votes.filter((vote) => vote === 'red').length >= 2 ? 'red' : 'blue'
          : null;
        if (winner) {
          current.winner = winner;
          const round: Round = { id: current.rounds.length + 1, winner, timestamp: new Date().toISOString(), votes: copy(current.votes) };
          current.rounds.push(round);
          let match = current.matches.at(-1);
          if (!match || match.rounds.length === 3) { match = { id: current.matches.length + 1, title: `النزال رقم ${current.matches.length + 1}`, redTeam: 'الفريق الأحمر', blueTeam: 'الفريق الأزرق', rounds: [] }; current.matches.push(match); }
          match.rounds.push(round);
        }
        transaction.set(systemDocument, current);
        return current;
      });
      state = next;
      announceLocalState(previous);
    } catch (error) {
      this.receive('vote_error', error instanceof Error ? error.message : 'تعذر تسجيل التصويت');
    }
  }

  private startHeartbeat() {
    if (this.heartbeat) window.clearInterval(this.heartbeat);
    this.heartbeat = window.setInterval(() => {
      void this.renewLease();
    }, 8_000);
  }

  private async renewLease() {
    const refereeId = this.claimedRefereeId;
    if (!refereeId || this.disconnected) return;
    try {
      const next = await runTransaction(db, async (transaction) => {
        const snapshot = await transaction.get(systemDocument);
        if (!snapshot.exists()) return null;
        const current = snapshot.data() as State;
        if (current.referees?.[refereeId]?.socketId !== this.id) return null;
        current.referees[refereeId].lastSeen = Date.now();
        transaction.set(systemDocument, current);
        return current;
      });
      if (next) state = next;
    } catch (error) {
      console.error('تعذر تجديد جلسة الحكم:', error);
    }
  }

  private async releaseClaim() {
    const refereeId = this.claimedRefereeId;
    this.claimedRefereeId = null;
    if (!refereeId) return;
    const previous = copy(state);
    try {
      const result = await runTransaction(db, async (transaction) => {
        const snapshot = await transaction.get(systemDocument);
        if (!snapshot.exists()) return { current: state, released: false };
        const current = snapshot.data() as State;
        const referee = current.referees?.[refereeId];
        if (!referee || referee.socketId !== this.id) return { current, released: false };
        referee.socketId = null;
        delete referee.lastSeen;
        transaction.set(systemDocument, current);
        return { current, released: true };
      });
      if (result.released) {
        state = result.current;
        announceLocalState(previous);
      }
    } catch (error) {
      console.error('تعذر إنهاء جلسة الحكم:', error);
    }
  }

  private async ensureCurrentMatch(callback?: (response: any) => void) {
    const previous = copy(state);
    try {
      const next = await runTransaction(db, async (transaction) => {
        const snapshot = await transaction.get(systemDocument);
        const current = (snapshot.exists() ? snapshot.data() : state) as State;
        if (current.matches.length === 0) {
          current.matches.push({ id: 1, title: 'النزال رقم 1', redTeam: 'الفريق الأحمر', blueTeam: 'الفريق الأزرق', rounds: [] });
          transaction.set(systemDocument, current);
        }
        return current;
      });
      state = next;
      announceLocalState(previous);
      callback?.({ success: true });
    } catch (error) {
      callback?.({ success: false, message: 'تعذر تجهيز بيانات النزال' });
      console.error('تعذر تجهيز النزال الحالي:', error);
    }
  }

  private async advanceToNextMatch() {
    if (resetTimer) clearTimeout(resetTimer); resetTimer = undefined;
    const previous = copy(state);
    try {
      const next = await runTransaction(db, async (transaction) => {
        const snapshot = await transaction.get(systemDocument);
        const current = (snapshot.exists() ? snapshot.data() : state) as State;
        current.votes = { '1': null, '2': null, '3': null };
        current.winner = null;
        current.displayResult = null;
        current.matches.push({ id: current.matches.length + 1, title: `النزال رقم ${current.matches.length + 1}`, redTeam: 'الفريق الأحمر', blueTeam: 'الفريق الأزرق', rounds: [] });
        transaction.set(systemDocument, current);
        return current;
      });
      state = next;
      announceLocalState(previous);
      notifyAll('round_reset');
    } catch (error) {
      console.error('تعذر فتح النزال التالي:', error);
    }
  }
}

export function createLocalSocket() { return new LocalSocket(); }

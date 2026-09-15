import { useEffect, useMemo, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { Link } from 'react-router-dom';
import { Home } from 'lucide-react';

type Winner = 'red' | 'blue';
type Round = { id: number; winner: Winner; timestamp: string };
type PublicMatch = { id: number; title: string; redTeam: string; blueTeam: string; rounds: Round[] };

const winnerLabel: Record<Winner, string> = {
  red: 'الأحمر',
  blue: 'الأزرق',
};

export default function DisplayPage() {
  const [isConnected, setIsConnected] = useState(false);
  const [currentWinner, setCurrentWinner] = useState<Winner | null>(null);
  const [match, setMatch] = useState<PublicMatch>({ id: 1, title: 'النزال رقم 1', redTeam: 'الفريق الأحمر', blueTeam: 'الفريق الأزرق', rounds: [] });

  useEffect(() => {
    const socket: Socket = io();

    socket.on('connect', () => setIsConnected(true));
    socket.on('disconnect', () => setIsConnected(false));
    socket.on('round_result', (result: { winner: Winner }) => setCurrentWinner(result.winner));
    socket.on('round_reset', () => setCurrentWinner(null));
    socket.on('update_display', (nextMatch: PublicMatch) => setMatch(nextMatch));

    return () => socket.disconnect();
  }, []);

  const matchRounds = match.rounds;
  const finalWinner = useMemo<Winner | null>(() => {
    if (matchRounds.length !== 3) return null;
    const redWins = matchRounds.filter((round) => round.winner === 'red').length;
    const blueWins = matchRounds.filter((round) => round.winner === 'blue').length;
    if (redWins === blueWins) return null;
    return redWins > blueWins ? 'red' : 'blue';
  }, [matchRounds]);

  const activeWinner = currentWinner ?? matchRounds.at(-1)?.winner ?? null;

  return (
    <main dir="rtl" className="min-h-screen overflow-hidden bg-slate-950 px-5 py-7 text-slate-50 sm:px-10 sm:py-10">
      <div className="mx-auto flex min-h-[calc(100vh-3.5rem)] max-w-7xl flex-col">
        <header className="flex items-center justify-between border-b border-slate-800 pb-5 sm:pb-7">
          <div>
            <p className="mb-1 text-sm font-semibold tracking-[0.25em] text-slate-400">بطولة التايكوندو</p>
            <h1 className="text-3xl font-black tracking-tight sm:text-5xl">شاشة النتائج المباشرة</h1>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2 rounded-full border border-slate-700 bg-slate-900 px-4 py-2 text-sm font-bold">
              <span className={`h-2.5 w-2.5 rounded-full ${isConnected ? 'bg-emerald-400 animate-pulse' : 'bg-red-500'}`} />
              {isConnected ? 'بث مباشر' : 'بانتظار الاتصال'}
            </div>
            <Link to="/" className="inline-flex items-center gap-2 rounded-full border border-slate-700 bg-slate-900 px-4 py-2 text-sm font-bold text-slate-100 transition-colors hover:bg-slate-800" aria-label="العودة للرئيسية">
              <Home className="h-4 w-4" />
              <span className="hidden sm:inline">الرئيسية</span>
            </Link>
          </div>
        </header>

        <section className="flex flex-1 flex-col justify-center py-8 sm:py-12">
          <p className="mb-2 text-center text-base font-bold text-slate-400 sm:text-xl">النزال رقم {match.id}</p>
          <h2 className="mb-4 text-center text-2xl font-black sm:text-4xl">{match.title}</h2>
          <p className="mb-6 flex justify-center gap-3 text-center text-sm font-bold sm:text-lg"><span className="text-red-400">{match.redTeam}</span><span className="text-slate-500">ضد</span><span className="text-blue-400">{match.blueTeam}</span></p>
          <div className={`relative overflow-hidden rounded-[2rem] border p-8 text-center shadow-2xl transition-colors sm:p-14 ${
            activeWinner === 'red'
              ? 'border-red-400 bg-red-600 shadow-red-950/60'
              : activeWinner === 'blue'
                ? 'border-blue-400 bg-blue-600 shadow-blue-950/60'
                : 'border-slate-700 bg-slate-900'
          }`}>
            <p className="relative z-10 mb-4 text-lg font-bold text-white/80 sm:text-2xl">
              {currentWinner ? 'نتيجة الجولة الحالية' : finalWinner ? 'الفائز في النزال' : 'آخر نتيجة مسجلة'}
            </p>
            <h2 className="relative z-10 text-5xl font-black tracking-tight sm:text-8xl">
              {currentWinner
                ? `فوز ${winnerLabel[currentWinner]}`
                : finalWinner
                  ? `فوز ${winnerLabel[finalWinner]}`
                  : activeWinner
                    ? `فوز ${winnerLabel[activeWinner]}`
                    : 'بانتظار بدء الجولة'}
            </h2>
          </div>

          <div className="mt-8 grid grid-cols-1 gap-4 sm:mt-10 sm:grid-cols-3 sm:gap-6">
            {[0, 1, 2].map((index) => {
              const round = matchRounds[index];
              return (
                <article key={index} className={`rounded-2xl border p-5 text-center sm:p-7 ${
                  round?.winner === 'red'
                    ? 'border-red-900/70 bg-red-950/35'
                    : round?.winner === 'blue'
                      ? 'border-blue-900/70 bg-blue-950/35'
                      : 'border-slate-800 bg-slate-900/70'
                }`}>
                  <p className="mb-3 text-sm font-bold text-slate-400">الجولة {index + 1}</p>
                  <p className={`text-2xl font-black sm:text-3xl ${
                    round?.winner === 'red' ? 'text-red-400' : round?.winner === 'blue' ? 'text-blue-400' : 'text-slate-600'
                  }`}>
                    {round ? `فوز ${winnerLabel[round.winner]}` : 'لم تبدأ'}
                  </p>
                </article>
              );
            })}
          </div>
        </section>
      </div>
    </main>
  );
}

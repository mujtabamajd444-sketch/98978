import { useEffect, useState } from 'react';
import { createLocalSocket, type LocalSocket } from '../lib/localSystem';
import { Link } from 'react-router-dom';
import { Home } from 'lucide-react';

type Winner = 'red' | 'blue';
type PublicMatch = { id: number; title: string; redTeam: string; blueTeam: string; rounds?: unknown[] };
type DisplayResult = { winner: Winner; kind: 'round' | 'match'; roundNumber: number };

const winnerLabel: Record<Winner, string> = {
  red: 'الأحمر',
  blue: 'الأزرق',
};

export default function DisplayPage() {
  const [isConnected, setIsConnected] = useState(false);
  const [displayResult, setDisplayResult] = useState<DisplayResult | null>(null);
  const [match, setMatch] = useState<PublicMatch>({ id: 1, title: 'النزال رقم 1', redTeam: 'الفريق الأحمر', blueTeam: 'الفريق الأزرق', rounds: [] });

  useEffect(() => {
    const socket: LocalSocket = createLocalSocket();

    socket.on('connect', () => setIsConnected(true));
    socket.on('disconnect', () => setIsConnected(false));
    socket.on('update_display_result', (result: DisplayResult | null) => setDisplayResult(result));
    socket.on('update_display', (nextMatch: PublicMatch) => setMatch(nextMatch));

    return () => socket.disconnect();
  }, []);

  return (
    <main dir="rtl" className="min-h-screen overflow-hidden bg-slate-950 px-5 py-7 text-slate-50 sm:px-10 sm:py-10">
      <div className="mx-auto flex min-h-[calc(100vh-3.5rem)] max-w-7xl flex-col">
        <header className="flex items-center justify-between border-b border-slate-800 pb-5 sm:pb-7">
          <div>
            <p className="mb-1 text-sm font-semibold tracking-[0.25em] text-slate-400">بطولة موي تاي</p>
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
          <p className="mb-2 text-center text-base font-bold text-slate-400 sm:text-xl">النزال الحالي</p>
          <h2 className="mb-4 text-center text-2xl font-black sm:text-4xl">{match.title}</h2>
          <p className="mb-6 flex justify-center gap-3 text-center text-sm font-bold sm:text-lg"><span className="text-red-400">{match.redTeam}</span><span className="text-slate-500">ضد</span><span className="text-blue-400">{match.blueTeam}</span></p>
          <div className={`relative overflow-hidden rounded-[2rem] border p-8 text-center shadow-2xl transition-colors sm:p-14 ${
            displayResult?.winner === 'red'
              ? 'border-red-400 bg-red-600 shadow-red-950/60'
              : displayResult?.winner === 'blue'
                ? 'border-blue-400 bg-blue-600 shadow-blue-950/60'
                : 'border-slate-700 bg-slate-900'
          }`}>
            <p className="relative z-10 mb-4 text-lg font-bold text-white/80 sm:text-2xl">
              {displayResult?.kind === 'match' ? 'الفائز في النزال' : displayResult ? `الجولة ${displayResult.roundNumber}` : `الجولة ${Math.min((match.rounds?.length || 0) + 1, 3)}`}
            </p>
            <h2 className="relative z-10 text-5xl font-black tracking-tight sm:text-8xl">
              {displayResult ? `فوز ${winnerLabel[displayResult.winner]}` : 'بانتظار إعلان لجنة التحكيم'}
            </h2>
          </div>

          <p className="mt-8 text-center text-sm font-semibold text-slate-500 sm:text-base">النتيجة تظهر هنا فقط بعد اعتمادها من لوحة لجنة التحكيم.</p>
        </section>
      </div>
    </main>
  );
}

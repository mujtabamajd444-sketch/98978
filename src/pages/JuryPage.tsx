import { useState, useEffect, useRef, FormEvent } from 'react';
import { createLocalSocket, type LocalSocket } from '../lib/localSystem';
import { RotateCcw, Home, Settings, X, ClipboardList, Pencil, SkipForward } from 'lucide-react';
import { Link } from 'react-router-dom';
import { APP_VERSION } from '../lib/version';
import AnimatedNotice from '../components/AnimatedNotice';

export default function JuryPage() {
  const [isConnected, setIsConnected] = useState(false);
  const [votes, setVotes] = useState<Record<string, string | null>>({ "1": null, "2": null, "3": null });
  const [winner, setWinner] = useState<'red' | 'blue' | null>(null);
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [roundTimeLeft, setRoundTimeLeft] = useState<number | null>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [matches, setMatches] = useState<any[]>([]);
  
  const [referees, setReferees] = useState<Record<string, {name: string, socketId: string|null}>>({});
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [editNames, setEditNames] = useState({"1": "", "2": "", "3": ""});
  const [editPasswords, setEditPasswords] = useState({"1": "", "2": "", "3": "", "jury": ""});
  const [editDuration, setEditDuration] = useState<string>("0");
  
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  const [loginError, setLoginError] = useState<string | null>(null);
  const [settingsError, setSettingsError] = useState('');
  const [isMatchesOpen, setIsMatchesOpen] = useState(false);
  const [editingMatch, setEditingMatch] = useState<any | null>(null);
  const [matchDraft, setMatchDraft] = useState({ title: '', redTeam: '', blueTeam: '' });
  const [matchError, setMatchError] = useState('');
  
  const [messages, setMessages] = useState<{sender: string, text: string, timestamp: string}[]>([]);
  const [chatInput, setChatInput] = useState('');
  const chatEndRef = useRef<HTMLDivElement>(null);
  
  const socketRef = useRef<LocalSocket | null>(null);

  useEffect(() => {
    const socket = createLocalSocket();
    socketRef.current = socket;

    socket.on('connect', () => {
      setIsConnected(true);
    });

    socket.on('disconnect', () => {
      setIsConnected(false);
    });

    socket.on('update_votes', (updatedVotes) => {
      setVotes(updatedVotes);
    });

    socket.on('round_result', (result) => {
      setWinner(result.winner);
    });

    socket.on('timer_tick', (data) => {
      setTimeLeft(data.secondsLeft);
    });

    socket.on('round_timer_tick', (data) => {
      setRoundTimeLeft(data.secondsLeft);
    });

    socket.on('round_reset', () => {
      setVotes({ "1": null, "2": null, "3": null });
      setWinner(null);
      setTimeLeft(null);
    });

    socket.on('update_referees', (data) => {
      setReferees(data);
      if (!isSettingsOpen) {
        setEditNames({
          "1": data["1"]?.name || "",
          "2": data["2"]?.name || "",
          "3": data["3"]?.name || ""
        });
      }
    });

    socket.on('update_settings', (data) => {
      if (data && !isSettingsOpen) {
        setEditDuration((data.roundDuration || 0).toString());
      }
    });

    socket.on('update_history', (data) => {
      setHistory(data);
    });

    socket.on('update_matches', (data) => {
      setMatches(data);
    });

    socket.on('receive_message', (msg) => {
      setMessages((prev) => [...prev, msg]);
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSendMessage = (e: FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim() || !socketRef.current) return;
    socketRef.current.emit('send_message', {
      sender: 'لجنة التحكيم',
      text: chatInput.trim(),
      timestamp: new Date().toISOString()
    });
    setChatInput('');
  };

  const saveNames = () => {
    const durationNum = parseInt(editDuration) || 0;
    const isChangingPasswords = (Object.values(editPasswords) as string[]).some((password) => password.trim().length > 0);
    setSettingsError('');
    socketRef.current?.emit('set_settings', {
      names: editNames,
      roundDuration: durationNum,
      ...(isChangingPasswords ? { passwords: editPasswords } : {}),
    }, (response: { success: boolean, message?: string }) => {
      if (response.success) {
        setIsSettingsOpen(false);
      } else {
        setSettingsError(response.message || 'تعذر حفظ الإعدادات');
      }
    });
  };

  const startEditingMatch = (match: any) => {
    setEditingMatch(match);
    setMatchDraft({ title: match.title, redTeam: match.redTeam, blueTeam: match.blueTeam });
    setMatchError('');
  };

  const saveMatch = () => {
    if (!editingMatch) return;
    setMatchError('');
    socketRef.current?.emit('update_match_metadata', { id: editingMatch.id, ...matchDraft }, (response: { success: boolean, message?: string }) => {
      if (response.success) {
        setEditingMatch(null);
      } else {
        setMatchError(response.message || 'تعذر حفظ بيانات النزال');
      }
    });
  };

  const openMatches = () => {
    socketRef.current?.emit('ensure_current_match', undefined, (response: { success: boolean }) => {
      if (response.success) setIsMatchesOpen(true);
    });
  };

  if (!isAuthenticated) {
    return (
      <div className="h-[100dvh] w-full bg-slate-950 text-slate-50 flex flex-col items-center justify-center p-4 font-sans relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-slate-900/40 via-slate-950 to-slate-950 pointer-events-none"></div>
        
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 w-full max-w-sm shadow-2xl text-center relative z-10">
          <h2 className="text-2xl font-bold text-white mb-6">تسجيل الدخول</h2>
          <form onSubmit={(e) => {
            e.preventDefault();
            socketRef.current?.emit('authenticate_jury', passwordInput, (response: any) => {
              if (response.success) {
                setIsAuthenticated(true);
                setLoginError(null);
                setEditPasswords({"1": "", "2": "", "3": "", "jury": ""});
              } else {
                setPasswordInput('');
                setLoginError('رمز الدخول غير صحيح، تحقق منه ثم حاول مرة أخرى.');
              }
            });
          }} className="flex flex-col gap-4">
            <input 
              type="password" 
              value={passwordInput}
              onChange={(e) => setPasswordInput(e.target.value)}
              className="bg-slate-950 border border-slate-700 rounded-lg px-4 py-3 text-center text-lg text-white focus:outline-none focus:border-blue-500 tracking-[0.5em]"
              autoFocus
            />
            <button 
              type="submit"
              className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 rounded-xl transition-colors shadow-lg shadow-blue-900/20 active:scale-95"
            >
              دخول
            </button>
          </form>
          <AnimatedNotice message={loginError} onClose={() => setLoginError(null)} />
          <Link to="/" className="mt-6 inline-block text-slate-400 hover:text-white text-sm transition-colors bg-slate-800/50 px-4 py-2 rounded-full border border-slate-700/50">العودة للرئيسية</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="h-[100dvh] w-full bg-slate-950 text-slate-50 flex flex-col overflow-hidden font-sans">
      {isMatchesOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 bg-slate-800/50 p-4">
              <h2 className="text-lg font-bold">سجل النزالات</h2>
              <button onClick={() => { setIsMatchesOpen(false); setEditingMatch(null); }} className="text-slate-400 hover:text-white"><X className="w-5 h-5" /></button>
            </div>
            <div className="overflow-y-auto p-5">
              {editingMatch ? (
                <div className="flex flex-col gap-4">
                  <h3 className="font-bold text-slate-200">تعديل النزال رقم {editingMatch.id}</h3>
                  <input value={matchDraft.title} onChange={(e) => setMatchDraft({ ...matchDraft, title: e.target.value })} placeholder="عنوان أو رقم النزال، مثال: النزال رقم 5" className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-3 text-white" />
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <input value={matchDraft.redTeam} onChange={(e) => setMatchDraft({ ...matchDraft, redTeam: e.target.value })} placeholder="اسم الفريق الأحمر" className="rounded-lg border border-red-900/70 bg-slate-950 px-3 py-3 text-white" />
                    <input value={matchDraft.blueTeam} onChange={(e) => setMatchDraft({ ...matchDraft, blueTeam: e.target.value })} placeholder="اسم الفريق الأزرق" className="rounded-lg border border-blue-900/70 bg-slate-950 px-3 py-3 text-white" />
                  </div>
                  {matchError && <p role="alert" className="text-sm text-red-300">{matchError}</p>}
                  <div className="flex gap-3"><button onClick={() => setEditingMatch(null)} className="flex-1 rounded-lg bg-slate-800 py-3 font-bold">رجوع</button><button onClick={saveMatch} className="flex-1 rounded-lg bg-emerald-600 py-3 font-bold">حفظ التعديل</button></div>
                </div>
              ) : matches.length === 0 ? (
                <p className="py-10 text-center text-slate-500">لا يوجد نزال مسجل حتى الآن</p>
              ) : (
                <div className="flex flex-col gap-3">{[...matches].reverse().map((match) => <article key={match.id} className="rounded-xl border border-slate-700 bg-slate-950/50 p-4"><div className="flex items-start justify-between gap-3"><div><p className="font-bold">{match.title}</p><p className="mt-1 text-sm"><span className="text-red-400">{match.redTeam}</span> <span className="text-slate-500">ضد</span> <span className="text-blue-400">{match.blueTeam}</span></p><p className="mt-2 text-xs text-slate-500">{match.rounds.length} من 3 جولات</p></div><button onClick={() => startEditingMatch(match)} className="rounded-lg border border-slate-600 bg-slate-800 p-2 text-slate-200 hover:bg-slate-700" title="تعديل بيانات النزال"><Pencil className="w-4 h-4" /></button></div></article>)}</div>
              )}
            </div>
          </div>
        </div>
      )}
      {/* Settings Modal */}
      {isSettingsOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl">
            <div className="p-4 border-b border-slate-800 flex justify-between items-center bg-slate-800/50">
              <h2 className="font-bold text-lg">إعدادات الحكام والرموز</h2>
              <button onClick={() => setIsSettingsOpen(false)} className="text-slate-400 hover:text-white transition-colors"><X className="w-5 h-5"/></button>
            </div>
            <div className="p-6 flex flex-col gap-4 max-h-[80vh] overflow-y-auto">
              <p className="rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 text-center text-xs leading-5 text-slate-400">
                لا تظهر الرموز الحالية. لتغييرها، أدخل رموزًا جديدة ومختلفة للحقول الأربعة ثم احفظ.
              </p>

              {[1,2,3].map(id => (
                <div key={id} className="flex gap-2">
                  <div className="flex flex-col gap-1.5 flex-1">
                    <label className="text-xs font-semibold text-slate-400">اسم الحكم {id}</label>
                    <input
                      type="text"
                      value={editNames[id.toString() as keyof typeof editNames]}
                      onChange={(e) => setEditNames({...editNames, [id.toString()]: e.target.value})}
                      className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
                    />
                  </div>
                  <div className="flex flex-col gap-1.5 flex-1">
                    <label className="text-xs font-semibold text-slate-400">رمز جديد للحكم {id}</label>
                    <input
                      type="password"
                      value={editPasswords[id.toString() as keyof typeof editPasswords]}
                      onChange={(e) => setEditPasswords({...editPasswords, [id.toString()]: e.target.value})}
                      autoComplete="new-password"
                      placeholder="••••••"
                      className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
                    />
                  </div>
                </div>
              ))}
              
              <div className="flex flex-col gap-1.5 mt-2">
                <label className="text-xs font-semibold text-slate-400">رمز جديد للجنة التحكيم</label>
                <input
                  type="password"
                  value={editPasswords.jury}
                  onChange={(e) => setEditPasswords({...editPasswords, jury: e.target.value})}
                  autoComplete="new-password"
                  placeholder="••••••"
                  className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
                />
              </div>

              {settingsError && (
                <p role="alert" className="rounded-lg border border-red-800 bg-red-950/50 px-3 py-2 text-center text-sm text-red-200">
                  {settingsError}
                </p>
              )}

              <div className="flex flex-col gap-1.5 mt-2">
                <label className="text-xs font-semibold text-slate-400">وقت الجولة (ثواني، 0 = إيقاف المؤقت)</label>
                <input
                  type="number"
                  min="0"
                  value={editDuration}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val === "" || val === "0") {
                      setEditDuration(val);
                    } else {
                      // Remove leading zeros if user types something else
                      setEditDuration(val.replace(/^0+/, ''));
                    }
                  }}
                  onBlur={() => {
                    if (editDuration === "") setEditDuration("0");
                  }}
                  className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
                />
              </div>

              <button onClick={saveNames} className="mt-4 w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-2.5 rounded-lg transition-colors">
                حفظ الإعدادات
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <header className="flex-none bg-slate-900 border-b border-slate-800 px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between shadow-md z-10">
        <div className="flex items-center gap-3 sm:gap-4">
          <Link to="/" className="text-slate-400 hover:text-white transition-colors bg-slate-800 p-2 rounded-lg border border-slate-700/50 hover:bg-slate-700 active:scale-95">
            <Home className="w-5 h-5" />
          </Link>
          <h1 className="text-xl sm:text-2xl font-bold tracking-wider text-slate-100 uppercase">لوحة تحكم لجنة التحكيم</h1>
          <span className="inline text-[10px] font-bold tracking-wide text-slate-500" title="إصدار النظام">v{APP_VERSION}</span>
          <div className="hidden sm:flex items-center gap-2 sm:gap-3 bg-slate-800/50 px-3 py-1.5 rounded-full border border-slate-700/50">
            <div className={`w-2.5 h-2.5 rounded-full ${isConnected ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`}></div>
            <span className={`text-xs sm:text-sm font-semibold uppercase tracking-widest ${isConnected ? 'text-emerald-400' : 'text-red-400'}`}>
              {isConnected ? 'متصل' : 'غير متصل'}
            </span>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <button onClick={openMatches} className="bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-600 px-3 py-2 rounded-lg text-sm font-semibold transition-colors shadow-sm flex items-center gap-2" title="تعديل عنوان وترقيم النزال">
            <ClipboardList className="w-4 h-4" />
            <span className="hidden sm:inline">النزالات</span>
          </button>
          <button 
            onClick={() => setIsSettingsOpen(true)}
            className="bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-600 px-3 py-2 rounded-lg text-sm font-semibold transition-colors shadow-sm flex items-center gap-2 active:scale-95"
            title="إعداد الأسماء"
          >
            <Settings className="w-4 h-4" />
          </button>
          <button 
            onClick={() => socketRef.current?.emit('trigger_reset')}
            className="bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-600 px-3 sm:px-4 py-2 rounded-lg text-sm font-semibold transition-colors shadow-sm flex items-center gap-2 active:scale-95"
          >
            <RotateCcw className="w-4 h-4" />
            <span className="hidden sm:inline">تصفير العرض / جولة جديدة</span>
            <span className="sm:hidden">تصفير</span>
          </button>
          <button
            onClick={() => socketRef.current?.emit('advance_to_next_match')}
            className="bg-amber-600 hover:bg-amber-500 text-white border border-amber-400/40 px-3 sm:px-4 py-2 rounded-lg text-sm font-semibold transition-colors shadow-sm flex items-center gap-2 active:scale-95"
            title="إنهاء النزال بالقاضية وفتح النزال التالي"
          >
            <SkipForward className="w-4 h-4" />
            <span className="hidden sm:inline">قاضية / نزال جديد</span>
            <span className="sm:hidden">نزال جديد</span>
          </button>
          <button
            onClick={() => socketRef.current?.emit('set_display_winner', 'red')}
            className="bg-red-600 hover:bg-red-500 text-white border border-red-400/40 px-3 sm:px-4 py-2 rounded-lg text-sm font-semibold transition-colors shadow-sm flex items-center gap-2 active:scale-95"
            title="عرض فوز الأحمر على شاشة العرض"
          >
            <span className="hidden sm:inline">عرض فوز الأحمر</span>
            <span className="sm:hidden">الأحمر</span>
          </button>
          <button
            onClick={() => socketRef.current?.emit('set_display_winner', 'blue')}
            className="bg-blue-600 hover:bg-blue-500 text-white border border-blue-400/40 px-3 sm:px-4 py-2 rounded-lg text-sm font-semibold transition-colors shadow-sm flex items-center gap-2 active:scale-95"
            title="عرض فوز الأزرق على شاشة العرض"
          >
            <span className="hidden sm:inline">عرض فوز الأزرق</span>
            <span className="sm:hidden">الأزرق</span>
          </button>
        </div>
      </header>

      <div className="flex-1 flex flex-col min-h-0">
        {/* Top Section: Dashboard (approx 60%) */}
        <main className="flex-[3] flex flex-col lg:flex-row p-4 sm:p-6 lg:p-8 bg-slate-950 relative overflow-y-auto gap-6">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-slate-900/40 via-slate-950 to-slate-950 pointer-events-none"></div>
          
          <div className="relative z-10 flex flex-col gap-6 max-w-5xl mx-auto lg:mx-0 lg:max-w-none lg:flex-[3] w-full py-4 lg:py-0 lg:justify-center">
            
            {/* Referees Status Board */}
            <div>
              <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-widest mb-4 text-center sm:text-start">حالة الحكام</h2>
              <div className="flex flex-col sm:flex-row gap-4">
                {[1, 2, 3].map((refNum) => {
                  const vote = votes[refNum.toString()];
                  return (
                    <div key={refNum} className="flex-1 min-w-0 bg-slate-900 border border-slate-800 rounded-2xl p-6 flex flex-col items-center justify-center gap-4 shadow-lg transition-colors relative">
                      {/* Connection Indicator */}
                      <div className={`absolute top-4 right-4 w-2 h-2 rounded-full ${referees[refNum.toString()]?.socketId ? 'bg-emerald-500' : 'bg-slate-700'}`}></div>
                      
                      <span className="text-slate-300 font-semibold text-lg text-center w-full truncate px-4">
                        {referees[refNum.toString()]?.name || `الحكم ${refNum}`}
                      </span>
                      <div className={`h-16 w-full flex items-center justify-center rounded-xl border shadow-inner transition-colors duration-300 ${
                        vote === 'red' ? 'bg-red-950/40 border-red-900/50 text-red-500' :
                        vote === 'blue' ? 'bg-blue-950/40 border-blue-900/50 text-blue-500' :
                        'bg-slate-950 border-slate-800/50 text-slate-500'
                      }`}>
                        <span className={`font-mono tracking-wider font-bold ${!vote ? 'animate-pulse' : ''}`}>
                          {vote === 'red' ? 'أحمر' : vote === 'blue' ? 'أزرق' : 'في الانتظار...'}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Final Result Area */}
            <div className="mt-2">
              <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-widest mb-4 text-center sm:text-start">قرار الجولة</h2>
              <div className={`border-2 rounded-3xl p-8 sm:p-12 flex flex-col items-center justify-center shadow-2xl relative overflow-hidden transition-colors duration-500 ${
                winner === 'red' ? 'bg-red-600 border-red-500 shadow-[0_0_50px_-12px_rgba(220,38,38,0.6)]' :
                winner === 'blue' ? 'bg-blue-600 border-blue-500 shadow-[0_0_50px_-12px_rgba(37,99,235,0.6)]' :
                'bg-slate-900 border-slate-700/50'
              }`}>
                <div className="absolute inset-0 bg-gradient-to-b from-transparent to-slate-950/20 pointer-events-none"></div>
                <span className={`font-medium mb-2 uppercase tracking-widest relative z-10 transition-colors ${
                  winner ? 'text-white/80' : 'text-slate-500'
                }`}>النتيجة النهائية</span>
                <span className={`text-5xl sm:text-6xl md:text-7xl font-black tracking-tight relative z-10 transition-colors ${
                  winner ? 'text-white drop-shadow-md' : 'text-slate-400'
                }`}>
                  {winner === 'red' ? 'فوز الأحمر' : winner === 'blue' ? 'فوز الأزرق' : 'قيد الانتظار'}
                </span>
                
                {timeLeft !== null && (
                  <div className="absolute top-4 right-4 bg-slate-950/40 backdrop-blur-sm text-white/90 px-4 py-2 rounded-full font-mono text-sm border border-white/20 shadow-lg z-20">
                    الجولة القادمة خلال {timeLeft}ث
                  </div>
                )}

                {roundTimeLeft !== null && !winner && (
                  <div className="absolute top-4 left-4 bg-slate-950/40 backdrop-blur-sm text-blue-400 px-4 py-2 rounded-full font-mono text-sm border border-blue-900/50 shadow-lg z-20 flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-ping"></div>
                    باقي {roundTimeLeft}ث
                  </div>
                )}
              </div>
            </div>

          </div>

          {/* History Sidebar */}
          <div className="relative z-10 hidden lg:flex flex-col flex-[1] w-full min-w-[320px] max-w-sm bg-slate-900/80 backdrop-blur-md rounded-3xl p-6 border border-slate-800 h-full overflow-y-auto shadow-2xl">
            <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-widest mb-4">سجل الجولات والنزالات</h2>
            <div className="flex flex-col gap-4">
              {history.length === 0 ? (
                <div className="text-center text-slate-500 py-8 text-sm">لا يوجد سجل حتى الآن</div>
              ) : (
                // Group history into chunks of 3 rounds per match
                Array.from({ length: Math.ceil(history.length / 3) }).map((_, matchIndex) => {
                  const matchNumber = matchIndex + 1;
                  const startIdx = matchIndex * 3;
                  const matchRounds = history.slice(startIdx, startIdx + 3);
                  
                  return (
                    <div key={`match-${matchNumber}`} className="bg-slate-800/80 border border-slate-700 rounded-2xl p-4 flex flex-col gap-3 shadow-md">
                      <h3 className="text-sm font-bold text-slate-300 border-b border-slate-700/50 pb-2 text-center">النزال رقم {matchNumber}</h3>
                      
                      <div className="flex flex-col gap-2">
                        {matchRounds.map((round, rIdx) => (
                          <div key={rIdx} className="bg-slate-900/50 border border-slate-700/30 rounded-xl p-3 flex flex-col gap-2">
                            <div className="flex justify-between items-center mb-1">
                              <span className="text-xs font-medium text-slate-400">جولة {round.id}</span>
                              <span className={`text-xs font-bold px-2 py-1 rounded ${round.winner === 'red' ? 'bg-red-500/20 text-red-400' : 'bg-blue-500/20 text-blue-400'}`}>
                                {round.winner === 'red' ? 'فوز الأحمر' : 'فوز الأزرق'}
                              </span>
                            </div>
                            <div className="flex justify-between gap-1 text-[10px] text-slate-500 text-center font-bold">
                              {[1,2,3].map(r => (
                                <div key={r} className={`flex-1 rounded p-1.5 ${round.votes?.[r] === 'red' ? 'bg-red-950/50 text-red-500 border border-red-900/30' : round.votes?.[r] === 'blue' ? 'bg-blue-950/50 text-blue-500 border border-blue-900/30' : 'bg-slate-800/50 text-slate-600'}`}>
                                  ح{r}: {round.votes?.[r] === 'red' ? 'أحمر' : round.votes?.[r] === 'blue' ? 'أزرق' : '-'}
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                }).reverse() // Show newest matches at the top
              )}
            </div>
          </div>
        </main>

        {/* Bottom Section: Chat Box (approx 40%) */}
        <footer className="flex-[2] bg-slate-900 border-t border-slate-800 flex flex-col min-h-0">
          {/* Chat Messages Area */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.length === 0 ? (
              <div className="flex flex-col gap-1 items-center justify-center h-full text-slate-500">
                <span className="text-sm font-medium">لا توجد رسائل بعد.</span>
                <span className="text-xs">ستظهر سجلات النظام ومحادثات الحكام هنا.</span>
              </div>
            ) : (
              messages.map((msg, idx) => {
                const isMe = msg.sender === 'لجنة التحكيم';
                return (
                  <div key={idx} className={`flex flex-col max-w-5xl mx-auto w-full ${isMe ? 'items-end' : 'items-start'}`}>
                    <span className="text-xs text-slate-500 mb-1 px-1">{msg.sender}</span>
                    <div className={`px-4 py-2 rounded-2xl text-sm max-w-[85%] sm:max-w-[70%] shadow-md ${
                      isMe 
                        ? 'bg-emerald-600 text-white rounded-tl-sm' 
                        : 'bg-slate-800 text-slate-200 rounded-tr-sm border border-slate-700'
                    }`}>
                      {msg.text}
                    </div>
                  </div>
                );
              })
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Chat Input */}
          <div className="p-3 sm:p-4 bg-slate-900 border-t border-slate-800">
            <form className="flex gap-2 mx-auto max-w-5xl" onSubmit={handleSendMessage}>
              <input 
                type="text" 
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder="بث رسالة..." 
                className="flex-1 bg-slate-950 border border-slate-700 rounded-full px-4 py-2.5 sm:py-3 text-sm sm:text-base text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all"
              />
              <button 
                type="submit"
                className="bg-emerald-600 hover:bg-emerald-500 text-white rounded-full px-4 sm:px-6 py-2.5 sm:py-3 font-semibold text-sm sm:text-base transition-colors flex items-center justify-center shadow-lg shadow-emerald-900/20"
              >
                إرسال
              </button>
            </form>
          </div>
        </footer>
      </div>
    </div>
  );
}

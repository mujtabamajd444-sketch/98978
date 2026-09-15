import { useState, useEffect, useRef, FormEvent } from 'react';
import { io, Socket } from 'socket.io-client';
import { Link } from 'react-router-dom';
import { Home } from 'lucide-react';

export default function RefereePage() {
  const [isConnected, setIsConnected] = useState(false);
  const [myRefId, setMyRefId] = useState<string | null>(null);
  const [referees, setReferees] = useState<Record<string, {name: string, socketId: string|null}>>({});
  
  const [selectedRefForLogin, setSelectedRefForLogin] = useState<string | null>(null);
  const [refereePasswordInput, setRefereePasswordInput] = useState('');
  
  const [votedColor, setVotedColor] = useState<'red' | 'blue' | null>(null);
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [roundTimeLeft, setRoundTimeLeft] = useState<number | null>(null);
  
  const [messages, setMessages] = useState<{sender: string, text: string, timestamp: string}[]>([]);
  const [chatInput, setChatInput] = useState('');
  const chatEndRef = useRef<HTMLDivElement>(null);
  
  // Use ref to keep track of socket instance for button clicks
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    const socket = io();
    socketRef.current = socket;

    socket.on('connect', () => {
      setIsConnected(true);
    });

    socket.on('disconnect', () => {
      setIsConnected(false);
    });

    socket.on('update_referees', (data) => {
      setReferees(data);
    });

    socket.on('claim_success', (id) => {
      setMyRefId(id);
      setSelectedRefForLogin(null);
      setRefereePasswordInput('');
    });

    socket.on('claim_error', (msg) => {
      alert(msg);
      setRefereePasswordInput('');
    });

    socket.on('vote_error', (msg) => {
      setVotedColor(null);
      alert(msg);
    });

    socket.on('timer_tick', (data) => {
      setTimeLeft(data.secondsLeft);
    });

    socket.on('round_timer_tick', (data) => {
      setRoundTimeLeft(data.secondsLeft);
    });

    socket.on('round_reset', () => {
      setVotedColor(null);
      setTimeLeft(null);
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

  const handleVote = (color: 'red' | 'blue') => {
    if (votedColor || !socketRef.current || !myRefId) return; // Prevent double voting
    socketRef.current.emit('submit_vote', { refereeId: myRefId, color });
    setVotedColor(color);
  };

  const handleSendMessage = (e: FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim() || !socketRef.current || !myRefId) return;
    socketRef.current.emit('send_message', {
      sender: referees[myRefId]?.name || `الحكم ${myRefId}`,
      text: chatInput.trim(),
      timestamp: new Date().toISOString()
    });
    setChatInput('');
  };

  if (!myRefId) {
    return (
      <div className="h-[100dvh] w-full bg-slate-950 text-slate-50 flex flex-col items-center justify-center p-4 font-sans relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-slate-900/40 via-slate-950 to-slate-950 pointer-events-none"></div>
        
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 w-full max-w-sm shadow-2xl text-center relative z-10">
          {!selectedRefForLogin ? (
            <>
              <h2 className="text-2xl font-bold text-white mb-8">اختر اسمك للدخول</h2>
              <div className="flex flex-col gap-4">
                {["1", "2", "3"].map(id => {
                  const ref = referees[id];
                  if (!ref) return null;
                  const isTaken = ref.socketId !== null;
                  return (
                    <button
                      key={id}
                      disabled={isTaken}
                      onClick={() => setSelectedRefForLogin(id)}
                      className={`w-full p-4 rounded-xl font-bold text-lg transition-all ${isTaken ? 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-800' : 'bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-900/20 active:scale-95'}`}
                    >
                      {ref.name} {isTaken && "(متصل حالياً)"}
                    </button>
                  );
                })}
              </div>
            </>
          ) : (
            <>
              <h2 className="text-2xl font-bold text-white mb-2">رمز المرور</h2>
              <p className="text-sm text-slate-400 mb-6">للدخول باسم {referees[selectedRefForLogin]?.name}</p>
              
              <form onSubmit={(e) => {
                e.preventDefault();
                socketRef.current?.emit("claim_referee", { id: selectedRefForLogin, password: refereePasswordInput });
              }} className="flex flex-col gap-4">
                <input 
                  type="password" 
                  value={refereePasswordInput}
                  onChange={(e) => setRefereePasswordInput(e.target.value)}
                  className="bg-slate-950 border border-slate-700 rounded-lg px-4 py-3 text-center text-lg text-white focus:outline-none focus:border-blue-500 tracking-[0.5em]"
                  autoFocus
                />
                <div className="flex gap-3 mt-2">
                  <button 
                    type="button"
                    onClick={() => {
                      setSelectedRefForLogin(null);
                      setRefereePasswordInput('');
                    }}
                    className="flex-1 bg-slate-800 hover:bg-slate-700 text-white font-bold py-3 rounded-xl transition-colors active:scale-95"
                  >
                    رجوع
                  </button>
                  <button 
                    type="submit"
                    className="flex-1 bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 rounded-xl transition-colors shadow-lg shadow-blue-900/20 active:scale-95"
                  >
                    تأكيد
                  </button>
                </div>
              </form>
            </>
          )}
          <Link to="/" className="mt-8 inline-block text-slate-400 hover:text-white text-sm transition-colors bg-slate-800/50 px-4 py-2 rounded-full border border-slate-700/50">العودة للرئيسية</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="h-[100dvh] w-full bg-slate-950 text-slate-50 flex flex-col overflow-hidden font-sans relative">
      {/* Vote Feedback Overlay (shown only after voting) */}
      {votedColor && (
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 z-50 bg-slate-900/95 backdrop-blur-md border border-slate-700 px-8 py-6 rounded-3xl shadow-[0_0_50px_-12px_rgba(0,0,0,0.8)] text-center flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
          <div>
            <h3 className="text-xl sm:text-2xl font-bold text-white mb-1">تم إرسال التصويت!</h3>
            <p className="text-slate-400 font-medium tracking-wide">في انتظار النتائج...</p>
          </div>
          {timeLeft !== null && (
            <div className="mt-2 bg-slate-800/80 px-4 py-2 rounded-full border border-slate-700/50">
              <span className="text-slate-300 font-mono text-sm">الجولة القادمة خلال {timeLeft}ث</span>
            </div>
          )}
        </div>
      )}

      {/* Header */}
      <header className="flex-none bg-slate-900 border-b border-slate-800 px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between shadow-md z-10">
        <div className="flex items-center gap-3">
          <Link to="/" className="text-slate-400 hover:text-white transition-colors bg-slate-800 p-2 rounded-lg border border-slate-700/50 hover:bg-slate-700 active:scale-95">
            <Home className="w-5 h-5" />
          </Link>
          <h1 className="text-xl sm:text-2xl font-bold tracking-wider text-slate-100 uppercase">واجهة {referees[myRefId]?.name || 'الحكم'}</h1>
        </div>
        <div className="flex items-center gap-2 sm:gap-3 bg-slate-800/50 px-3 py-1.5 rounded-full border border-slate-700/50">
          <div className={`w-2.5 h-2.5 rounded-full ${isConnected ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`}></div>
          <span className={`text-xs sm:text-sm font-semibold uppercase tracking-widest ${isConnected ? 'text-emerald-400' : 'text-red-400'}`}>
            {isConnected ? 'متصل' : 'غير متصل'}
          </span>
        </div>
      </header>

      <div className="flex-1 flex flex-col min-h-0">
        {/* Top Section: Voting Buttons (approx 60%) */}
        <main className="flex-[3] flex p-4 sm:p-6 gap-4 sm:gap-6 bg-slate-950 relative">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-slate-900/40 via-slate-950 to-slate-950 pointer-events-none"></div>
          
          {roundTimeLeft !== null && !votedColor && (
            <div className="absolute top-8 left-1/2 -translate-x-1/2 z-20 bg-slate-900/80 backdrop-blur-md px-6 py-2 rounded-full border border-slate-700 shadow-xl flex items-center gap-3">
              <div className="w-2 h-2 rounded-full bg-blue-500 animate-ping"></div>
              <span className="font-mono text-xl font-bold text-slate-200">{roundTimeLeft}</span>
            </div>
          )}
          
          <button 
            disabled={votedColor !== null}
            onClick={() => handleVote('red')}
            className={`relative z-10 flex-1 rounded-2xl sm:rounded-3xl flex items-center justify-center transition-all group ${
              votedColor === 'red' 
                ? 'bg-red-600 shadow-[0_0_40px_-10px_rgba(220,38,38,0.8)] border-b-0 translate-y-2'
                : votedColor === 'blue'
                ? 'bg-slate-900 border-2 border-slate-800 text-slate-700 opacity-50 cursor-not-allowed'
                : 'bg-red-600 hover:bg-red-500 active:bg-red-700 shadow-[0_0_40px_-10px_rgba(220,38,38,0.5)] active:scale-[0.98] border-b-8 border-red-800 active:border-b-0 active:translate-y-2 cursor-pointer'
            }`}
          >
            <span className={`text-5xl sm:text-7xl md:text-8xl font-black tracking-tight drop-shadow-lg ${votedColor === 'blue' ? 'text-slate-800' : 'text-white group-active:drop-shadow-sm'}`}>أحمر</span>
          </button>
          
          <button 
            disabled={votedColor !== null}
            onClick={() => handleVote('blue')}
            className={`relative z-10 flex-1 rounded-2xl sm:rounded-3xl flex items-center justify-center transition-all group ${
              votedColor === 'blue' 
                ? 'bg-blue-600 shadow-[0_0_40px_-10px_rgba(37,99,235,0.8)] border-b-0 translate-y-2'
                : votedColor === 'red'
                ? 'bg-slate-900 border-2 border-slate-800 text-slate-700 opacity-50 cursor-not-allowed'
                : 'bg-blue-600 hover:bg-blue-500 active:bg-blue-700 shadow-[0_0_40px_-10px_rgba(37,99,235,0.5)] active:scale-[0.98] border-b-8 border-blue-800 active:border-b-0 active:translate-y-2 cursor-pointer'
            }`}
          >
            <span className={`text-5xl sm:text-7xl md:text-8xl font-black tracking-tight drop-shadow-lg ${votedColor === 'red' ? 'text-slate-800' : 'text-white group-active:drop-shadow-sm'}`}>أزرق</span>
          </button>
        </main>

        {/* Bottom Section: Chat Box (approx 40%) */}
        <footer className="flex-[2] bg-slate-900 border-t border-slate-800 flex flex-col min-h-0">
          {/* Chat Messages Area */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.length === 0 ? (
              <div className="flex flex-col gap-1 items-center justify-center h-full text-slate-500">
                <span className="text-sm font-medium">لا توجد رسائل بعد.</span>
                <span className="text-xs">تحدث مع لجنة التحكيم هنا.</span>
              </div>
            ) : (
              messages.map((msg, idx) => {
                const isMe = myRefId && msg.sender === (referees[myRefId]?.name || `الحكم ${myRefId}`);
                return (
                  <div key={idx} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                    <span className="text-xs text-slate-500 mb-1 px-1">{msg.sender}</span>
                    <div className={`px-4 py-2 rounded-2xl text-sm max-w-[85%] ${
                      isMe 
                        ? 'bg-blue-600 text-white rounded-tl-sm' 
                        : 'bg-slate-800 text-slate-200 rounded-tr-sm'
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
            <form className="flex gap-2" onSubmit={handleSendMessage}>
              <input 
                type="text" 
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder="أرسل رسالة للجنة التحكيم..." 
                className="flex-1 bg-slate-950 border border-slate-700 rounded-full px-4 py-2.5 sm:py-3 text-sm sm:text-base text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
              />
              <button 
                type="submit"
                className="bg-blue-600 hover:bg-blue-500 text-white rounded-full px-4 sm:px-6 py-2.5 sm:py-3 font-semibold text-sm sm:text-base transition-colors flex items-center justify-center shadow-lg shadow-blue-900/20"
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

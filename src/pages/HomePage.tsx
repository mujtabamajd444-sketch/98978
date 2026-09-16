import { Link } from 'react-router-dom';

export default function HomePage() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-50 flex flex-col items-center justify-center p-4">
      <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-xl shadow-2xl p-8 text-center">
        <img src={`${import.meta.env.BASE_URL}muay-thai-logo.png`} alt="شعار نظام موي تاي" className="mx-auto mb-5 h-24 w-24 rounded-3xl border border-blue-300/20 object-cover shadow-xl" />
        <h1 className="text-3xl font-bold tracking-tight mb-2">نظام موي تاي</h1>
        <p className="text-slate-400 mb-8">اختر دورك للمتابعة</p>
        
        <div className="flex flex-col gap-4">
          <Link 
            to="/referee" 
            className="flex items-center justify-center w-full py-4 px-6 bg-blue-600 hover:bg-blue-700 transition-colors rounded-lg font-semibold text-lg shadow-lg shadow-blue-900/20"
          >
            واجهة الحكم
          </Link>
          
          <Link 
            to="/jury" 
            className="flex items-center justify-center w-full py-4 px-6 bg-emerald-600 hover:bg-emerald-700 transition-colors rounded-lg font-semibold text-lg shadow-lg shadow-emerald-900/20"
          >
            لوحة تحكم لجنة التحكيم
          </Link>

          <Link 
            to="/display" 
            className="flex items-center justify-center w-full py-4 px-6 bg-violet-600 hover:bg-violet-700 transition-colors rounded-lg font-semibold text-lg shadow-lg shadow-violet-900/20"
          >
            شاشة العرض المباشر
          </Link>
        </div>
      </div>
    </div>
  );
}

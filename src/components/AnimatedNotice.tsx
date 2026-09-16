import { AlertCircle, CheckCircle2, X } from 'lucide-react';

type Props = { message: string | null; tone?: 'error' | 'success'; onClose: () => void };

export default function AnimatedNotice({ message, tone = 'error', onClose }: Props) {
  if (!message) return null;
  const isError = tone === 'error';
  return (
    <div role="alert" dir="rtl" className={`fixed left-4 right-4 top-4 z-[110] mx-auto flex max-w-sm animate-[bounce_0.45s_ease-out] items-center gap-3 rounded-2xl border p-4 shadow-2xl ${isError ? 'border-red-400/40 bg-red-950/95 text-red-50' : 'border-emerald-400/40 bg-emerald-950/95 text-emerald-50'}`}>
      {isError ? <AlertCircle className="h-6 w-6 shrink-0 text-red-300" /> : <CheckCircle2 className="h-6 w-6 shrink-0 text-emerald-300" />}
      <p className="flex-1 text-sm font-bold leading-6">{message}</p>
      <button type="button" onClick={onClose} className="rounded-lg p-1 hover:bg-white/10" aria-label="إغلاق"><X className="h-4 w-4" /></button>
    </div>
  );
}

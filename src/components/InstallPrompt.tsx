import { useEffect, useState } from 'react';
import { Download, X } from 'lucide-react';

type InstallEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

export default function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<InstallEvent | null>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [isInstalling, setIsInstalling] = useState(false);
  const [showHelp, setShowHelp] = useState(false);

  useEffect(() => {
    const standalone = window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone;
    if (standalone) return;
    setIsVisible(true);

    const onBeforeInstall = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as InstallEvent);
    };
    const onInstalled = () => setIsVisible(false);
    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const install = async () => {
    if (!deferredPrompt) {
      setShowHelp(true);
      return;
    }
    setIsInstalling(true);
    await deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    if (choice.outcome === 'accepted') setIsVisible(false);
    setDeferredPrompt(null);
    setIsInstalling(false);
  };

  if (!isVisible) return null;

  return (
    <aside dir="rtl" className="fixed bottom-4 left-4 right-4 z-[90] mx-auto flex max-w-md items-center gap-3 rounded-2xl border border-blue-400/30 bg-slate-900/95 p-3 text-slate-50 shadow-2xl backdrop-blur-md" aria-label="تثبيت التطبيق">
      <img src={`${import.meta.env.BASE_URL}muay-thai-logo.png`} alt="شعار تطبيق موي تاي" className="h-12 w-12 rounded-xl object-cover" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-black">ثبّت التطبيق على جهازك</p>
        <p className="mt-0.5 text-xs leading-5 text-slate-300">افتح النظام لاحقًا من الشاشة الرئيسية.</p>
      </div>
      <button type="button" onClick={() => void install()} disabled={isInstalling} className="inline-flex shrink-0 items-center gap-1 rounded-xl bg-blue-600 px-3 py-2 text-xs font-bold hover:bg-blue-500 disabled:opacity-60">
          <Download className="h-4 w-4" /> {isInstalling ? 'جارٍ…' : 'تثبيت'}
      </button>
      <button type="button" onClick={() => setIsVisible(false)} className="self-start rounded-lg p-1 text-slate-400 hover:bg-slate-800 hover:text-white" aria-label="إغلاق"><X className="h-4 w-4" /></button>
      {showHelp && (
        <div className="absolute bottom-[calc(100%+0.75rem)] left-0 right-0 rounded-2xl border border-slate-700 bg-slate-900 p-4 text-sm text-slate-200 shadow-2xl">
          <p className="font-bold text-white">التثبيت من المتصفح</p>
          <p className="mt-2 leading-6">في Chrome أو Edge: افتح قائمة ⋯ ثم اختر <bdi className="font-bold">تثبيت التطبيق</bdi> أو <bdi className="font-bold">Apps ← Install</bdi>. في iPhone: مشاركة ثم <bdi className="font-bold">إضافة إلى الشاشة الرئيسية</bdi>.</p>
          <button type="button" onClick={() => setShowHelp(false)} className="mt-3 rounded-lg bg-slate-800 px-3 py-2 text-xs font-bold hover:bg-slate-700">فهمت</button>
        </div>
      )}
    </aside>
  );
}

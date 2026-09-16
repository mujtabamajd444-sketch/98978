import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { APP_VERSION, clearApplicationCacheAndReload, getAvailableVersion } from '../lib/version';

export default function UpdatePrompt() {
  const [availableVersion, setAvailableVersion] = useState<string | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);

  useEffect(() => {
    let active = true;
    const checkForUpdate = () => {
      void getAvailableVersion().then((version) => {
        if (active && version && version !== APP_VERSION) setAvailableVersion(version);
      });
    };
    const checkWhenVisible = () => {
      if (document.visibilityState === 'visible') checkForUpdate();
    };

    checkForUpdate();
    const interval = window.setInterval(checkForUpdate, 15_000);
    window.addEventListener('focus', checkForUpdate);
    document.addEventListener('visibilitychange', checkWhenVisible);
    return () => {
      active = false;
      window.clearInterval(interval);
      window.removeEventListener('focus', checkForUpdate);
      document.removeEventListener('visibilitychange', checkWhenVisible);
    };
  }, []);

  if (!availableVersion) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-sm" dir="rtl" role="dialog" aria-modal="true" aria-label="تحديث جديد">
      <div className="w-full max-w-sm rounded-3xl border border-blue-400/30 bg-slate-900 p-6 text-center text-slate-50 shadow-2xl">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-500/15 text-blue-300"><RefreshCw className="h-7 w-7" /></div>
        <h2 className="text-xl font-black">يوجد تحديث جديد</h2>
        <p className="mt-2 text-sm leading-6 text-slate-300">الإصدار المتاح <bdi className="font-bold text-white">v{availableVersion}</bdi>، والإصدار الحالي <bdi>v{APP_VERSION}</bdi>.</p>
        <button
          type="button"
          disabled={isUpdating}
          onClick={() => { setIsUpdating(true); void clearApplicationCacheAndReload(); }}
          className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 font-bold transition-colors hover:bg-blue-500 disabled:opacity-60"
        >
          <RefreshCw className={`h-4 w-4 ${isUpdating ? 'animate-spin' : ''}`} />
          {isUpdating ? 'جاري التحديث…' : 'تحديث الآن'}
        </button>
      </div>
    </div>
  );
}

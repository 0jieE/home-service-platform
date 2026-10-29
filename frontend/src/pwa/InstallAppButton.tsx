import { useState, type ReactNode } from 'react';
import { Download, Share, SquarePlus } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { usePwaInstall } from './usePwaInstall';

/**
 * "Install app": the browser's install prompt where available, Add to Home Screen steps on
 * iPhone/iPad, nothing when installed or unsupported. `className` styles the trigger.
 */
export function InstallAppButton({
  className,
  children,
  label = 'Install app',
  title,
}: {
  className: string;
  /** Trigger content; defaults to a download icon + label. */
  children?: ReactNode;
  label?: string;
  title?: string;
}) {
  const { mode, promptInstall } = usePwaInstall();
  const [iosHelp, setIosHelp] = useState(false);
  if (!mode) return null;

  const onClick = async () => {
    if (mode === 'ios') {
      setIosHelp(true);
      return;
    }
    const outcome = await promptInstall();
    if (outcome === 'accepted')
      toast.success('Installed. Open Kidapawan Home Service from your home screen.');
  };

  return (
    <>
      <button type="button" onClick={onClick} className={className} title={title} aria-label={title}>
        {children ?? (
          <>
            <Download className="size-5" aria-hidden="true" />
            {label}
          </>
        )}
      </button>
      <IosInstallModal open={iosHelp} onClose={() => setIosHelp(false)} />
    </>
  );
}

function IosInstallModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      size="sm"
      title="Install on iPhone or iPad"
      description="Add the app to your home screen. It opens full screen, like any other app."
      footer={<Button onClick={onClose}>Done</Button>}
    >
      <ol className="space-y-4">
        <li className="flex gap-3">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-pine-900 font-display text-sm font-bold text-sun-400">
            1
          </span>
          <p className="pt-1">
            Tap the <strong>Share</strong> button{' '}
            <Share
              className="inline size-4 align-[-2px] text-brand-700"
              aria-label="(square with an arrow)"
            />{' '}
            in Safari’s toolbar.
          </p>
        </li>
        <li className="flex gap-3">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-pine-900 font-display text-sm font-bold text-sun-400">
            2
          </span>
          <p className="pt-1">
            Scroll down and tap <strong>Add to Home Screen</strong>{' '}
            <SquarePlus className="inline size-4 align-[-2px] text-brand-700" aria-hidden="true" />, then{' '}
            <strong>Add</strong>.
          </p>
        </li>
      </ol>
    </Modal>
  );
}

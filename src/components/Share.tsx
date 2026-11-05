import { useEffect, useState } from 'react';
import { useStore } from '../store';
import { clearShareFromUrl, decodeProject, encodeProject, qrSvg, shareCodeFromUrl, shareUrl } from '../share';
import { alertDialog, chooseDialog, openPanel, toast } from './Dialog';
import { Icon } from './ui';

/** Open the share panel for everything in the current session. */
export function openShare() {
  return openPanel('Share project', <SharePanel />);
}

function SharePanel() {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [qr, setQr] = useState<string | null | undefined>(undefined); // undefined = not requested
  const [qrLoading, setQrLoading] = useState(false);
  const counts = { scenarios: useStore((s) => s.scenarios.length), cards: useStore((s) => s.library.length) };

  useEffect(() => {
    const s = useStore.getState();
    encodeProject({ library: s.library, scenarios: s.scenarios, location: s.location, period: s.period, stage: s.analysis.slots })
      .then((code) => setUrl(shareUrl(code)))
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  const copy = async () => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      toast('Link copied');
    } catch {
      const el = document.getElementById('share-url') as HTMLInputElement | null;
      el?.select();
      toast('Press Ctrl/⌘+C to copy');
    }
  };

  const showQr = async () => {
    if (!url) return;
    setQrLoading(true);
    setQr(await qrSvg(url));
    setQrLoading(false);
  };

  const canNativeShare = typeof navigator.share === 'function';

  return (
    <div className="share">
      <p className="muted small">
        {counts.scenarios} scenario{counts.scenarios === 1 ? '' : 's'} · {counts.cards} library card{counts.cards === 1 ? '' : 's'}, with tax
        locations and settings. The project is packed into the link itself — nothing is uploaded. Anyone with the link can see these numbers.
      </p>
      {error ? (
        <p className="totals-warn">Couldn't build a link: {error}</p>
      ) : (
        <>
          <div className="share-row">
            <input id="share-url" className="share-url" readOnly value={url ?? 'Preparing…'} onFocus={(e) => e.currentTarget.select()} aria-label="Share link" />
            <button type="button" className="glass-btn dialog-ok" onClick={copy} disabled={!url} data-autofocus="true">
              Copy link
            </button>
          </div>
          <div className="share-row">
            {canNativeShare && (
              <button
                type="button"
                className="glass-btn"
                disabled={!url}
                onClick={() => url && navigator.share({ title: 'EDI scenarios', url }).catch(() => {})}
              >
                <Icon name="share" size={15} /> Share…
              </button>
            )}
            <button type="button" className="glass-btn" disabled={!url || qrLoading} onClick={showQr} aria-expanded={qr !== undefined}>
              <Icon name="qr" size={15} /> {qr === undefined ? 'Show QR code' : 'Refresh QR code'}
            </button>
            {url && <span className="muted small share-size">{(url.length / 1024).toFixed(1)} KB link</span>}
          </div>
          {qr === null && (
            <p className="totals-warn subtle">This project is too large for a QR code — share the link instead.</p>
          )}
          {qr && (
            <div className="share-qr" role="img" aria-label="QR code for the share link" dangerouslySetInnerHTML={{ __html: qr }} />
          )}
        </>
      )}
    </div>
  );
}

/** On startup: if the URL carries a shared project, offer to open it. */
export function useIncomingShare() {
  useEffect(() => {
    const code = shareCodeFromUrl();
    if (!code) return;
    clearShareFromUrl(); // don't re-prompt on refresh
    (async () => {
      let project;
      try {
        project = await decodeProject(code);
      } catch {
        await alertDialog('Couldn’t open shared project', 'The link looks incomplete or damaged. Ask for it to be sent again.');
        return;
      }
      const { scenarios, library } = useStore.getState();
      const hasWork = scenarios.length > 0 || library.length > 0;
      const summary = `${project.scenarios.length} scenario${project.scenarios.length === 1 ? '' : 's'} and ${project.library.length} library card${project.library.length === 1 ? '' : 's'}.`;
      const choice = await chooseDialog({
        title: 'Open shared project?',
        message: hasWork
          ? `This link contains ${summary} Add them alongside your current work, or replace your current work with them?`
          : `This link contains ${summary}`,
        buttons: hasWork
          ? [
              { label: 'Cancel', value: 'cancel', tone: 'plain' },
              { label: 'Replace mine', value: 'replace', tone: 'danger' },
              { label: 'Add alongside', value: 'add', tone: 'primary', focus: true },
            ]
          : [
              { label: 'Cancel', value: 'cancel', tone: 'plain' },
              { label: 'Open', value: 'replace', tone: 'primary', focus: true },
            ],
      });
      if (choice === 'add' || choice === 'replace') {
        useStore.getState().importProject(project, choice);
        toast(choice === 'add' ? 'Shared scenarios added' : 'Shared project opened');
      }
    })();
  }, []);
}

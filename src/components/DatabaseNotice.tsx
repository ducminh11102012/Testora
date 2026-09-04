import { BrandGlyph } from './ui/BrandMark';

/**
 * Shown instead of the app when no database is attached, or when the one that
 * is attached cannot be reached. It replaces a stack trace with the two steps
 * that actually fix it.
 */
export default function DatabaseNotice({ reason, error }: {
  reason: 'unset' | 'unreachable'; error?: string;
}) {
  return (
    <div className="insp-split">
      <div className="insp-rail" aria-hidden="true" />
      <div className="insp-panel px-[24px] sm:px-[56px] py-[40px]">
        <div className="w-full max-w-[680px]">
          <div className="mb-[48px] flex items-center gap-[10px]">
            <BrandGlyph size={26} color="var(--brand)" />
            <span className="text-[20px] font-semibold" style={{ color: 'var(--brand)' }}>Testora</span>
          </div>

          <p className="p-eyebrow mb-[14px]">Almost there</p>
          <h1 className="text-[38px] leading-[1.2] font-normal mb-[18px]">
            {reason === 'unset' ? 'Attach a database' : 'The database is not answering'}
          </h1>

          {reason === 'unset' ? (
            <>
              <p className="text-[18px] leading-[1.6] text-[color:var(--paper-ink-2)] mb-[24px]">
                Testora keeps everything in Postgres. On Vercel, open <b>Storage</b> in the project,
                create a Postgres database and connect it to this project. That sets the connection
                variable by itself, so there is nothing to copy or paste.
              </p>
              <ol className="text-[17px] leading-[1.7] text-[color:var(--paper-ink-2)] pl-[22px] mb-[26px] list-decimal">
                <li>Project → <b>Storage</b> → <b>Create Database</b> → Postgres (Neon works too).</li>
                <li>Connect it to this project, all environments.</li>
                <li><b>Redeploy</b>. The tables are created on the first request.</li>
              </ol>
              <p className="text-[16px] text-[color:var(--paper-ink-3)]">
                Self-hosting instead? Set <code>DATABASE_URL</code> and restart.
              </p>
            </>
          ) : (
            <>
              <p className="text-[18px] leading-[1.6] text-[color:var(--paper-ink-2)] mb-[20px]">
                A connection string is set, but the server refused it. On a hosted database the
                usual cause is the wrong host: use the <b>pooled</b> connection string, and check
                that the database has not been paused.
              </p>
              {error && (
                <pre className="insp-notice text-[14px] whitespace-pre-wrap mb-[22px]">{error}</pre>
              )}
              <p className="text-[16px] text-[color:var(--paper-ink-3)]">
                Once it answers, reload this page. Nothing else needs doing.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

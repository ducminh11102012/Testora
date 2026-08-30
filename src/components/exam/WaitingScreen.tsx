export default function WaitingScreen({
  title = 'Your test will begin shortly',
  subtitle = 'Please wait',
}: { title?: string; subtitle?: string }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-white" role="status" aria-live="polite">
      <div className="spinner mb-[36px]" aria-hidden="true" />
      <h1 className="text-[36px] font-bold mb-[16px] text-center px-6">{title}</h1>
      <p className="text-[22px] text-center px-6">{subtitle}</p>
    </div>
  );
}

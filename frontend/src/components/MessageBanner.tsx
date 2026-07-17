interface MessageBannerProps {
  message?: string;
}

// The backend only sets `message` when there's something worth explaining —
// no valid schedule at all, or nothing fits the preferred time range. When
// everything's fine, `message` is undefined and this renders nothing.
function MessageBanner({ message }: MessageBannerProps) {
  if (!message) return null;

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
      {message}
    </div>
  );
}

export default MessageBanner;

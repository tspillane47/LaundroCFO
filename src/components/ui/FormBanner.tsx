type FormBannerProps = {
  message: { type: "success" | "error"; text: string } | null;
};

export function FormBanner({ message }: FormBannerProps) {
  if (!message) return null;
  const isSuccess = message.type === "success";
  return (
    <div
      className="rounded-lg p-3 text-[12px] mb-4"
      style={{
        background: isSuccess ? "var(--bg-success-tint)" : "var(--bg-danger-tint)",
        color: isSuccess ? "var(--text-success)" : "var(--text-danger)",
      }}
    >
      {message.text}
    </div>
  );
}

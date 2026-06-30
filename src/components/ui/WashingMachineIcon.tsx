interface WashingMachineIconProps {
  size?: number;
  color?: string;
  className?: string;
}

export function WashingMachineIcon({
  size = 24,
  color,
  className = "flex-shrink-0",
}: WashingMachineIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      className={className}
      style={color ? { color } : undefined}
    >
      <rect
        x="4"
        y="2"
        width="16"
        height="20"
        rx="2"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <circle cx="12" cy="13" r="4.5" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="8" cy="5.5" r="0.75" fill="currentColor" />
      <circle cx="12" cy="5.5" r="0.75" fill="currentColor" />
      <circle cx="16" cy="5.5" r="0.75" fill="currentColor" />
    </svg>
  );
}

interface WashingMachineIconProps {
  size?: number;
  color?: string;
}

export function WashingMachineIcon({ size = 28, color = "#3b82f6" }: WashingMachineIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 28 28"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      className="flex-shrink-0"
    >
      <path
        fill={color}
        fillRule="evenodd"
        clipRule="evenodd"
        d="M6 3C4.343 3 3 4.343 3 6v18c0 1.657 1.343 3 3 3h16c1.657 0 3-1.343 3-3V6c0-1.657-1.343-3-3-3H6zm1.75 3.5a1.25 1.25 0 100 2.5 1.25 1.25 0 000-2.5zm5.75 0a1.25 1.25 0 100 2.5 1.25 1.25 0 000-2.5zm5.75 0a1.25 1.25 0 100 2.5 1.25 1.25 0 000-2.5zM14 14.5a5 5 0 100 10 5 5 0 000-10z"
      />
    </svg>
  );
}

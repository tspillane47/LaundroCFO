import clsx from "clsx";
import { ReactNode } from "react";

type TableCellProps = {
  children: ReactNode;
  className?: string;
  truncate?: boolean;
  title?: string;
  align?: "left" | "right" | "center";
};

export function TableCell({
  children,
  className,
  truncate = false,
  title,
  align = "left",
}: TableCellProps) {
  const text = typeof children === "string" || typeof children === "number" ? String(children) : undefined;
  const tooltip = title ?? (truncate && text ? text : undefined);

  return (
    <td
      className={clsx(
        align === "right" && "text-right",
        align === "center" && "text-center",
        truncate && "truncate max-w-0",
        className,
      )}
      title={tooltip}
    >
      {children}
    </td>
  );
}

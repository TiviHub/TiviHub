interface ProgressIndicatorProps {
  label: string;
  value?: number;
  max?: number;
  className?: string;
}

export function ProgressIndicator({
  label,
  value,
  max,
  className = "",
}: ProgressIndicatorProps) {
  const determinate = value !== undefined && max !== undefined && max > 0;
  const currentValue = determinate ? Math.max(0, Math.min(max, value)) : undefined;
  const percentage = currentValue === undefined || max === undefined
    ? undefined
    : currentValue / max * 100;

  return (
    <div
      aria-label={label}
      aria-valuemax={determinate ? max : undefined}
      aria-valuemin={determinate ? 0 : undefined}
      aria-valuenow={currentValue}
      className={`progress-indicator${determinate ? " is-determinate" : ""}${className ? ` ${className}` : ""}`}
      role="progressbar"
    >
      <span style={percentage === undefined ? undefined : { width: `${percentage}%` }} />
    </div>
  );
}

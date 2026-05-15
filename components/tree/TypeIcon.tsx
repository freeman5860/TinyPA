// Mini SVG icons matching the four tree node types — used inline in
// list views (today, search results, etc.) to keep the metaphor visible
// without rendering a full tree.

const SIZE = 18;

export function TypeIcon({
  type,
  className,
}: {
  type: "todo" | "note" | "mood" | "followup";
  className?: string;
}) {
  return (
    <svg
      width={SIZE}
      height={SIZE}
      viewBox="-12 -12 24 24"
      className={className}
      aria-hidden="true"
    >
      {type === "note" && (
        <>
          <path
            d="M 0 -10 C 7 -7 8 0 6 7 C 3 10 -3 10 -6 7 C -8 0 -7 -7 0 -10 Z"
            fill="#a8c66a"
            stroke="#4a5d3a"
            strokeWidth="0.8"
          />
          <path d="M 0 -8 L 0 8" stroke="#4a5d3a" strokeWidth="0.6" fill="none" opacity="0.7" />
        </>
      )}
      {type === "todo" && (
        <>
          <path d="M 0 -8 L 1 -11" stroke="#3a2a18" strokeWidth="1.2" strokeLinecap="round" />
          <ellipse cx="3" cy="-10" rx="2" ry="1" fill="#7ba05b" transform="rotate(-30 3 -10)" />
          <circle r="8" fill="#e8783c" stroke="#a83e1c" strokeWidth="0.6" />
          <ellipse cx="-2.5" cy="-3" rx="1.6" ry="1" fill="#ffe4c2" opacity="0.6" />
        </>
      )}
      {type === "mood" && (
        <>
          {[0, 72, 144, 216, 288].map((a) => (
            <ellipse
              key={a}
              cx="0"
              cy="-5"
              rx="3"
              ry="5"
              fill="#e89a8a"
              stroke="#6b4570"
              strokeWidth="0.4"
              transform={`rotate(${a})`}
            />
          ))}
          <circle r="2" fill="#f5c54b" stroke="#7a5a18" strokeWidth="0.4" />
        </>
      )}
      {type === "followup" && (
        <>
          <path d="M 0 6 L 0 -6" stroke="#5d7245" strokeWidth="1.2" strokeLinecap="round" />
          <path
            d="M 0 -2 C -6 -3 -8 -8 -2 -8 C 0 -6 0 -3 0 -2 Z"
            fill="#d4e09b"
            stroke="#3a4a26"
            strokeWidth="0.4"
          />
          <path
            d="M 0 -4 C 6 -5 8 -10 2 -10 C 0 -8 0 -5 0 -4 Z"
            fill="#d4e09b"
            stroke="#3a4a26"
            strokeWidth="0.4"
          />
        </>
      )}
    </svg>
  );
}

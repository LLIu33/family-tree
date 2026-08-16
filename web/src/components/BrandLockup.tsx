import './BrandLockup.css'

type BrandLockupProps = {
  size?: number
  withWordmark?: boolean
  className?: string
}

/** Inline hybrid-2 mark («Д» + mini family graph) + optional wordmark. */
export function BrandLockup({
  size = 28,
  withWordmark = true,
  className = '',
}: BrandLockupProps) {
  const classes = ['brand-lockup', className].filter(Boolean).join(' ')

  return (
    <span className={classes}>
      <svg
        className="brand-lockup__mark"
        width={size}
        height={size}
        viewBox="0 0 112 112"
        aria-hidden="true"
        focusable="false"
      >
        <circle cx="56" cy="56" r="52" fill="#d5ddd4" />
        <text
          x="48"
          y="72"
          textAnchor="middle"
          fontFamily="Georgia, 'Times New Roman', serif"
          fontSize="54"
          fontWeight="600"
          fill="#2c5f4e"
        >
          Д
        </text>
        <circle cx="72" cy="34" r="7" fill="#7a6b2e" />
        <circle cx="86" cy="58" r="6" fill="#2c5f4e" />
        <circle cx="74" cy="78" r="6" fill="#2c5f4e" />
        <path
          stroke="#7a6b2e"
          strokeWidth="2.5"
          strokeLinecap="round"
          fill="none"
          d="M72 41v10M78 52l6 4M72 68l2-6"
        />
      </svg>
      {withWordmark ? (
        <span className="brand-lockup__word">Древо</span>
      ) : null}
    </span>
  )
}

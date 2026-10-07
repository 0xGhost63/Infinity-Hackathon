import { Link } from 'react-router-dom';

export function BrandMark({ size = 34 }: { size?: number }) {
  return (
    <svg className="brand-mark" width={size} height={size} viewBox="0 0 40 40" aria-hidden="true" focusable="false">
      <path d="M8 8h30v22l-8 8H8z" fill="#000" />
      <path d="M5 5h30v22l-8 8H5z" fill="#FFE047" stroke="#000" strokeWidth="2.5" strokeLinejoin="round" />
      <path d="M27 35v-8h8" fill="#FFF6C8" stroke="#000" strokeWidth="2.5" strokeLinejoin="round" />
      <path d="M12 27V13h3.6l6.4 8.6V13h3.5v14h-3.6l-6.4-8.6V27z" fill="#000" />
    </svg>
  );
}

function BrandLockup() {
  return (
    <>
      <BrandMark />
      <span className="brand__name">NovaWorks</span>
      <span className="brand__tag">PM</span>
    </>
  );
}

export function Brand({ linked = true }: { linked?: boolean }) {
  if (!linked) {
    return (
      <span className="brand">
        <BrandLockup />
      </span>
    );
  }
  return (
    <Link to="/" className="brand" aria-label="NovaWorks PM home">
      <BrandLockup />
    </Link>
  );
}

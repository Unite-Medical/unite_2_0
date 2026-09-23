import {useId} from 'react';

/** Official Unite Medical artwork, sourced from unitemedical.net. */
export function UMLogoMark({ size = 28 }) {
  const clipId = useId();
  return (
    <svg width={size} height={size} viewBox="0 0 860 523" role="img" aria-label="Unite Medical" style={{display:'block',flexShrink:0}}>
      {/* Isolate the original mark from the transparent wordmark; preserve its exact artwork. */}
      <defs><clipPath id={clipId}><path d="M0 0H860V320H365V523H0Z"/></clipPath></defs>
      <image href="/brand/unite-medical-logo.png" width="2000" height="523" clipPath={`url(#${clipId})`}/>
    </svg>
  );
}

export function UMLogo({ size = 28, color = "#16201a" }) {
  const reversed = ["#f3f2eb", "#fff", "#ffffff"].includes(color.toLowerCase());
  return (
    <img
      src="/brand/unite-medical-logo.png"
      alt="Unite Medical"
      width="2000"
      height="523"
      style={{
        display: "block",
        width: size * (2000 / 523),
        height: "auto",
        maxWidth: "100%",
        flexShrink: 0,
        ...(reversed ? { filter: "brightness(0) invert(1)" } : {}),
      }}
    />
  );
}

/** Official Unite Medical artwork, sourced from unitemedical.net. */
export function UMLogoMark({ size = 28 }) {
  return (
    <img
      src="/brand/unite-medical-icon.png"
      alt="Unite Medical"
      width="180"
      height="180"
      style={{
        display: "block",
        width: size,
        height: size,
        objectFit: "contain",
        flexShrink: 0,
      }}
    />
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

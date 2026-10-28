export function Logo({ light = false }: { light?: boolean }) {
  return (
    <span className={`brand ${light ? "light" : ""}`}>
      <span className="brand-symbol">
        N<span />
      </span>
      Nexo Assist
    </span>
  );
}

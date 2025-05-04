export function ViewMoreButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" className="font-semibold" onClick={onClick}>
      View more
    </button>
  );
}

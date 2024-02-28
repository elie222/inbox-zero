export function ViewMoreButton({ onClick }: { onClick: () => void }) {
  return (
    <button className="font-semibold" onClick={onClick}>
      View more
    </button>
  );
}

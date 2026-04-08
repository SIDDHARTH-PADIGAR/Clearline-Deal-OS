export default function Tooltip({ text }) {
  return (
    <span className="tooltip-wrap">
      <span className="tooltip-icon">?</span>
      <span className="tooltip-box">{text}</span>
    </span>
  );
}

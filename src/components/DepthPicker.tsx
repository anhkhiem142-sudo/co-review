import { DEPTH_PRESETS, type DepthPreset } from '../storage/prefs';

export default function DepthPicker({
  value,
  onChange,
  disabled,
}: {
  value: DepthPreset;
  onChange: (d: DepthPreset) => void;
  disabled?: boolean;
}) {
  return (
    <div className="segmented" role="radiogroup" aria-label="Độ sâu phân tích">
      {DEPTH_PRESETS.map((p) => (
        <button
          key={p.value}
          type="button"
          role="radio"
          aria-checked={value === p.value}
          className={value === p.value ? 'active' : ''}
          disabled={disabled}
          onClick={() => onChange(p.value)}
          title={`Độ sâu ${p.value}`}
        >
          {p.label}
          <small>{p.value}</small>
        </button>
      ))}
    </div>
  );
}

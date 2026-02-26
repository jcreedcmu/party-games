import { type FormEvent } from 'react';

type TextInputProps = {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (text: string) => void;
};

export function TextInput({ value, onChange, onSubmit }: TextInputProps) {
  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (value.trim()) {
      onSubmit(value.trim());
    }
  }

  return (
    <form className="text-input" onSubmit={handleSubmit}>
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder="Describe what you see..."
        autoFocus
      />
      <button type="submit" disabled={!value.trim()}>Submit</button>
    </form>
  );
}

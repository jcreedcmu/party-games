import { useState, type FormEvent } from 'react';

type TextInputProps = {
  onSubmit: (text: string) => void;
};

export function TextInput({ onSubmit }: TextInputProps) {
  const [text, setText] = useState('');

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (text.trim()) {
      onSubmit(text.trim());
    }
  }

  return (
    <form className="text-input" onSubmit={handleSubmit}>
      <input
        type="text"
        value={text}
        onChange={e => setText(e.target.value)}
        placeholder="Describe what you see..."
        autoFocus
      />
      <button type="submit" disabled={!text.trim()}>Submit</button>
    </form>
  );
}

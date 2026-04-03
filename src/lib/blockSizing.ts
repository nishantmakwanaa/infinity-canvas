import type { TodoItem } from '@/store/canvasStore';

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export function getNoteSize(content: string) {
  const lines = (content || '').split('\n');
  const lineCount = Math.max(1, lines.length);
  const longest = lines.reduce((max, line) => Math.max(max, line.length), 0);

  return {
    width: clamp(220 + Math.max(0, longest - 22) * 6, 220, 560),
    height: clamp(130 + lineCount * 22, 130, 700),
  };
}

export function getTodoSize(todos: TodoItem[] = []) {
  const rows = Math.max(1, todos.length);
  const longest = todos.reduce((max, todo) => Math.max(max, (todo.text || '').length), 0);

  return {
    width: clamp(240 + Math.max(0, longest - 20) * 6, 240, 620),
    height: clamp(112 + rows * 34, 150, 760),
  };
}

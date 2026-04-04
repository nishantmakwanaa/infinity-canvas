import { useCanvasStore, CanvasBlock, TodoItem, FONT_MAP } from '@/store/canvasStore';
import { Plus, Check } from 'lucide-react';
import { getTodoSize } from '@/lib/blockSizing';
import { getBlockForegroundColor, getBlockMutedColor } from '@/lib/blockColors';
import type { CSSProperties } from 'react';

export function TodoBlock({ block, readOnly }: { block: CanvasBlock; readOnly?: boolean }) {
  const updateBlock = useCanvasStore((s) => s.updateBlock);
  const todos = block.todos || [];
  const textFont = FONT_MAP[block.fontFamily || 'mono'];
  const foregroundColor = getBlockForegroundColor(block.backgroundColor);
  const mutedColor = getBlockMutedColor(block.backgroundColor);
  const textStyle: CSSProperties = {
    fontFamily: textFont,
    fontWeight: block.textBold ? 700 : 400,
    fontStyle: block.textItalic ? 'italic' : 'normal',
    textDecoration: block.textUnderline ? 'underline' : 'none',
    backgroundColor: block.textHighlight ? 'rgba(250, 204, 21, 0.28)' : 'transparent',
    color: foregroundColor || undefined,
  };

  const updateTodo = (todoId: string, updates: Partial<TodoItem>) => {
    if (readOnly) return;
    const nextTodos = todos.map((t) => (t.id === todoId ? { ...t, ...updates } : t));
    const size = getTodoSize(nextTodos);
    updateBlock(block.id, {
      todos: nextTodos,
      width: size.width,
      height: size.height,
    });
  };

  const addTodo = () => {
    if (readOnly) return;
    const nextTodos = [...todos, { id: `todo-${Date.now()}`, text: '', done: false }];
    const size = getTodoSize(nextTodos);
    updateBlock(block.id, {
      todos: nextTodos,
      width: size.width,
      height: size.height,
    });
  };

  const removeTodo = (todoId: string) => {
    if (readOnly) return;
    const nextTodos = todos.filter((t) => t.id !== todoId);
    const size = getTodoSize(nextTodos);
    updateBlock(block.id, {
      todos: nextTodos,
      width: size.width,
      height: size.height,
    });
  };

  return (
    <div className="p-3 space-y-1.5" style={textStyle}>
      {todos.map((todo) => (
        <div key={todo.id} className="flex items-center gap-2.5 group">
          <button
            className={`w-4 h-4 border flex-shrink-0 flex items-center justify-center transition-all ${
              todo.done
                ? 'bg-foreground border-foreground'
                : 'border-border hover:border-foreground'
            }`}
            onClick={() => updateTodo(todo.id, { done: !todo.done })}
            disabled={readOnly}
          >
            {todo.done && <Check size={10} className="text-background" strokeWidth={3} />}
          </button>
          {readOnly ? (
            <span
              className={`flex-1 text-sm font-mono ${todo.done ? 'line-through' : ''}`}
              style={{ ...textStyle, color: todo.done ? (mutedColor || foregroundColor || undefined) : (foregroundColor || undefined) }}
            >
              {todo.text || 'To do...'}
            </span>
          ) : (
            <input
              className={`flex-1 bg-transparent text-sm font-mono focus:outline-none ${todo.done ? 'line-through' : ''}`}
              style={{ ...textStyle, color: todo.done ? (mutedColor || foregroundColor || undefined) : (foregroundColor || undefined) }}
              placeholder="To do..."
              value={todo.text}
              onChange={(e) => updateTodo(todo.id, { text: e.target.value })}
            />
          )}
          {!readOnly && (
            <button
              className="opacity-0 group-hover:opacity-100 text-xs transition-opacity"
              style={{ color: mutedColor || undefined }}
              onClick={() => removeTodo(todo.id)}
            >
              ×
            </button>
          )}
        </div>
      ))}
      {!readOnly && (
        <button
          className="flex items-center gap-1.5 text-xs font-mono mt-2 transition-colors"
          style={{ color: mutedColor || undefined }}
          onClick={addTodo}
        >
          <Plus size={10} /> add item
        </button>
      )}
    </div>
  );
}

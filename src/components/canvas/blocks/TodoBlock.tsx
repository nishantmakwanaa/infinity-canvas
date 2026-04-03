import { useCanvasStore, CanvasBlock, TodoItem } from '@/store/canvasStore';
import { Plus, Check } from 'lucide-react';
import { getTodoSize } from '@/lib/blockSizing';

export function TodoBlock({ block, readOnly }: { block: CanvasBlock; readOnly?: boolean }) {
  const updateBlock = useCanvasStore((s) => s.updateBlock);
  const todos = block.todos || [];

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
    <div className="p-3 space-y-1.5">
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
              className={`flex-1 text-sm font-mono ${
                todo.done ? 'line-through text-muted-foreground' : 'text-foreground'
              }`}
            >
              {todo.text || 'To do...'}
            </span>
          ) : (
            <input
              className={`flex-1 bg-transparent text-sm font-mono focus:outline-none placeholder:text-muted-foreground ${
                todo.done ? 'line-through text-muted-foreground' : 'text-foreground'
              }`}
              placeholder="To do..."
              value={todo.text}
              onChange={(e) => updateTodo(todo.id, { text: e.target.value })}
            />
          )}
          {!readOnly && (
            <button
              className="text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100 text-xs transition-opacity"
              onClick={() => removeTodo(todo.id)}
            >
              ×
            </button>
          )}
        </div>
      ))}
      {!readOnly && (
        <button
          className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground text-xs font-mono mt-2 transition-colors"
          onClick={addTodo}
        >
          <Plus size={10} /> add item
        </button>
      )}
    </div>
  );
}

import { useCanvasStore, CanvasBlock, TodoItem } from '@/store/canvasStore';
import { Plus } from 'lucide-react';

export function TodoBlock({ block }: { block: CanvasBlock }) {
  const updateBlock = useCanvasStore((s) => s.updateBlock);
  const todos = block.todos || [];

  const updateTodo = (todoId: string, updates: Partial<TodoItem>) => {
    updateBlock(block.id, {
      todos: todos.map((t) => (t.id === todoId ? { ...t, ...updates } : t)),
    });
  };

  const addTodo = () => {
    updateBlock(block.id, {
      todos: [...todos, { id: `todo-${Date.now()}`, text: '', done: false }],
    });
  };

  const removeTodo = (todoId: string) => {
    updateBlock(block.id, {
      todos: todos.filter((t) => t.id !== todoId),
    });
  };

  return (
    <div className="p-3 space-y-1">
      {todos.map((todo) => (
        <div key={todo.id} className="flex items-center gap-2 group">
          <button
            className={`w-3.5 h-3.5 border border-border flex-shrink-0 flex items-center justify-center text-[8px] transition-colors ${
              todo.done ? 'bg-foreground text-background' : 'hover:bg-accent'
            }`}
            onClick={() => updateTodo(todo.id, { done: !todo.done })}
          >
            {todo.done && '✓'}
          </button>
          <input
            className={`flex-1 bg-transparent text-sm font-mono focus:outline-none placeholder:text-muted-foreground ${
              todo.done ? 'line-through text-muted-foreground' : 'text-foreground'
            }`}
            placeholder="To do..."
            value={todo.text}
            onChange={(e) => updateTodo(todo.id, { text: e.target.value })}
          />
          <button
            className="text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100 text-xs transition-opacity"
            onClick={() => removeTodo(todo.id)}
          >
            ×
          </button>
        </div>
      ))}
      <button
        className="flex items-center gap-1 text-muted-foreground hover:text-foreground text-xs font-mono mt-2 transition-colors"
        onClick={addTodo}
      >
        <Plus size={10} /> add item
      </button>
    </div>
  );
}
